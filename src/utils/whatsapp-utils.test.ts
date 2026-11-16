import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWhatsAppDigits,
  getWhatsAppPhoneCandidates,
  toWhatsAppJid,
  isDirectUserJid,
  extractBaileysMessageText,
  parseWebhookPayload,
} from './whatsapp-utils.ts';

test('normalizeWhatsAppDigits strips JID domains, device suffixes, and punctuation', () => {
  assert.equal(normalizeWhatsAppDigits('5511999998888:14@s.whatsapp.net'), '5511999998888');
  assert.equal(normalizeWhatsAppDigits('+55 (11) 99999-8888'), '5511999998888');
});

test('getWhatsAppPhoneCandidates generates Brazilian 55 and 9th-digit variants', () => {
  assert.deepEqual(getWhatsAppPhoneCandidates('11999998888'), [
    '5511999998888',
    '551199998888',
  ]);
  assert.deepEqual(getWhatsAppPhoneCandidates('5521988887777'), [
    '5521988887777',
    '552188887777',
  ]);
  assert.deepEqual(getWhatsAppPhoneCandidates('552188887777'), [
    '552188887777',
    '5521988887777',
  ]);
});

test('toWhatsAppJid builds valid JID from digits or preserves existing JID', () => {
  assert.equal(toWhatsAppJid('5511988887777'), '5511988887777@s.whatsapp.net');
  assert.equal(toWhatsAppJid('5511988887777@s.whatsapp.net'), '5511988887777@s.whatsapp.net');
});

test('isDirectUserJid filters out groups, broadcasts, and channels', () => {
  assert.equal(isDirectUserJid('5511988887777@s.whatsapp.net'), true);
  assert.equal(isDirectUserJid('1234567890@lid'), true);
  assert.equal(isDirectUserJid('1203630123456@g.us'), false);
  assert.equal(isDirectUserJid('status@broadcast'), false);
  assert.equal(isDirectUserJid('12345@newsletter'), false);
});

test('extractBaileysMessageText unwraps ephemeral and viewOnce messages', () => {
  assert.equal(extractBaileysMessageText({ conversation: 'Olá!' }), 'Olá!');
  assert.equal(
    extractBaileysMessageText({
      ephemeralMessage: {
        message: {
          extendedTextMessage: { text: 'Mensagem temporária' },
        },
      },
    }),
    'Mensagem temporária'
  );
  assert.equal(
    extractBaileysMessageText({
      viewOnceMessageV2: {
        message: {
          imageMessage: { caption: 'Foto única' },
        },
      },
    }),
    'Foto única'
  );
  assert.equal(extractBaileysMessageText({ audioMessage: {} }), '');
});

test('parseWebhookPayload handles Meta Cloud API, Evolution API, Z-API, and generic payloads', () => {
  const meta = parseWebhookPayload({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: 'João Meta' } }],
              messages: [{ from: '5511977776666', text: { body: 'Quero saber o preço' } }],
            },
          },
        ],
      },
    ],
  });
  assert.deepEqual(meta, {
    phone: '5511977776666',
    senderName: 'João Meta',
    text: 'Quero saber o preço',
    source: 'meta_cloud',
  });

  const evolution = parseWebhookPayload({
    data: {
      key: { remoteJid: '5521988881111@s.whatsapp.net', fromMe: false },
      pushName: 'Maria Evo',
      message: { conversation: 'Bom dia!' },
    },
  });
  assert.deepEqual(evolution, {
    phone: '5521988881111',
    senderName: 'Maria Evo',
    text: 'Bom dia!',
    source: 'evolution_api',
  });

  // Ignore Evolution group or fromMe messages
  assert.equal(
    parseWebhookPayload({
      data: {
        key: { remoteJid: '123456@g.us', fromMe: false },
        message: { conversation: 'Oi grupo' },
      },
    }),
    null
  );

  const zapi = parseWebhookPayload({
    phone: '5531999990000',
    senderName: 'Pedro ZAPI',
    fromMe: false,
    text: { message: 'Tem estoque?' },
  });
  assert.deepEqual(zapi, {
    phone: '5531999990000',
    senderName: 'Pedro ZAPI',
    text: 'Tem estoque?',
    source: 'z_api',
  });
});

test('shouldAiReplyToCustomer respects global toggle and per-customer override', async () => {
  const { shouldAiReplyToCustomer, stripJsonCodeFences } = await import('./whatsapp-utils.ts');
  // Default (undefined) with global enabled -> true
  assert.equal(shouldAiReplyToCustomer(undefined, true), true);
  // Explicitly enabled with global enabled -> true
  assert.equal(shouldAiReplyToCustomer(true, true), true);
  // Explicitly disabled for this specific customer -> false even when global is true
  assert.equal(shouldAiReplyToCustomer(false, true), false);
  // Global disabled -> false even if customer is enabled
  assert.equal(shouldAiReplyToCustomer(true, false), false);

  assert.equal(stripJsonCodeFences('```json\n{"reply":"oi"}\n```'), '{"reply":"oi"}');
});

test('shouldProcessUpsertMessage & extractIncomingContactInfo handle v7 LID/PN and append freshness', async () => {
  const { shouldProcessUpsertMessage, extractIncomingContactInfo } = await import('./whatsapp-utils.ts');
  const seen = new Set<string>(['already-seen']);
  const now = 1_794_500_000;

  assert.equal(
    shouldProcessUpsertMessage(
      'notify',
      { key: { id: 'm1', fromMe: false, remoteJid: '12345@lid' }, messageTimestamp: now - 1000 },
      seen,
      now
    ),
    true
  );

  // Fresh append (< 120s old) should be processed
  assert.equal(
    shouldProcessUpsertMessage(
      'append',
      { key: { id: 'm2', fromMe: false, remoteJid: '5511999998888@s.whatsapp.net' }, messageTimestamp: now - 30 },
      seen,
      now
    ),
    true
  );

  // Stale append (> 120s old backlog) should be skipped
  assert.equal(
    shouldProcessUpsertMessage(
      'append',
      { key: { id: 'm3', fromMe: false, remoteJid: '5511999998888@s.whatsapp.net' }, messageTimestamp: now - 600 },
      seen,
      now
    ),
    false
  );

  // Dedupe and ignore fromMe / groups
  assert.equal(
    shouldProcessUpsertMessage(
      'notify',
      { key: { id: 'already-seen', fromMe: false, remoteJid: '12345@lid' } },
      seen,
      now
    ),
    false
  );
  assert.equal(
    shouldProcessUpsertMessage(
      'notify',
      { key: { id: 'm4', fromMe: true, remoteJid: '12345@lid' } },
      seen,
      now
    ),
    false
  );
  assert.equal(
    shouldProcessUpsertMessage(
      'notify',
      { key: { id: 'm5', fromMe: false, remoteJid: '120363012345@g.us' } },
      seen,
      now
    ),
    false
  );

  // deviceSentMessage unwrapping
  assert.equal(
    extractBaileysMessageText({
      deviceSentMessage: {
        message: { conversation: 'Oi do celular' },
      },
    }),
    'Oi do celular'
  );

  // PN/LID extraction
  assert.deepEqual(
    extractIncomingContactInfo({
      remoteJid: '217815692886042@lid',
      remoteJidAlt: '5589994690619@s.whatsapp.net',
    }),
    {
      replyJid: '217815692886042@lid',
      pnJid: '5589994690619@s.whatsapp.net',
      phoneDigits: '5589994690619',
      isGroup: false,
      participantJid: null,
      participantDigits: '5589994690619',
    }
  );
});

test('WhatsApp group helpers: JID detection, upsert, contact extraction, mentions, and reply policy', async () => {
  const {
    isGroupJid,
    isSupportedChatJid,
    shouldProcessUpsertMessage,
    extractIncomingContactInfo,
    isBotMentionedInBaileysMessage,
    shouldAiReplyToConversation,
    parseWebhookPayload,
  } = await import('./whatsapp-utils.ts');

  const groupJid = '120363012345678901@g.us';
  assert.equal(isGroupJid(groupJid), true);
  assert.equal(isGroupJid('5511999998888@s.whatsapp.net'), false);
  assert.equal(isSupportedChatJid(groupJid, false), false);
  assert.equal(isSupportedChatJid(groupJid, true), true);
  assert.equal(isSupportedChatJid('status@broadcast', true), false);

  const seen = new Set<string>();
  const now = 1_794_500_000;
  assert.equal(
    shouldProcessUpsertMessage(
      'notify',
      { key: { id: 'g1', fromMe: false, remoteJid: groupJid } },
      seen,
      now,
      { allowGroups: true }
    ),
    true
  );

  assert.deepEqual(
    extractIncomingContactInfo({
      remoteJid: groupJid,
      participant: '123456789@lid',
      participantAlt: '5511988887777@s.whatsapp.net',
    }),
    {
      replyJid: groupJid,
      pnJid: '5511988887777@s.whatsapp.net',
      phoneDigits: '120363012345678901',
      isGroup: true,
      participantJid: '5511988887777@s.whatsapp.net',
      participantDigits: '5511988887777',
    }
  );

  // Bot mention detection in group message (mentionedJid or quoted reply participant)
  assert.equal(
    isBotMentionedInBaileysMessage(
      {
        extendedTextMessage: {
          text: '@bot qual o valor?',
          contextInfo: { mentionedJid: ['558981212637@s.whatsapp.net'] },
        },
      },
      ['558981212637:11@s.whatsapp.net', '217815692886042:11@lid']
    ),
    true
  );
  assert.equal(
    isBotMentionedInBaileysMessage(
      {
        extendedTextMessage: {
          text: 'responder para o bot',
          contextInfo: { participant: '217815692886042@lid' },
        },
      },
      ['558981212637:11@s.whatsapp.net', '217815692886042:11@lid']
    ),
    true
  );
  assert.equal(
    isBotMentionedInBaileysMessage(
      { conversation: 'Oi pessoal do grupo' },
      ['558981212637:11@s.whatsapp.net']
    ),
    false
  );

  // Reply policy for groups
  assert.equal(
    shouldAiReplyToConversation({
      isGroup: true,
      customerAiEnabled: true,
      globalAutoReplyEnabled: true,
      groupAutoReplyEnabled: true,
      groupMentionOnly: false,
      isMentioned: false,
    }),
    true
  );
  assert.equal(
    shouldAiReplyToConversation({
      isGroup: true,
      customerAiEnabled: true,
      globalAutoReplyEnabled: true,
      groupAutoReplyEnabled: false,
    }),
    false
  );
  assert.equal(
    shouldAiReplyToConversation({
      isGroup: true,
      customerAiEnabled: true,
      globalAutoReplyEnabled: true,
      groupAutoReplyEnabled: true,
      groupMentionOnly: true,
      isMentioned: false,
    }),
    false
  );
  assert.equal(
    shouldAiReplyToConversation({
      isGroup: true,
      customerAiEnabled: false,
      globalAutoReplyEnabled: true,
      groupAutoReplyEnabled: true,
    }),
    false
  );

  // Webhook Evolution API group payload when allowGroups is enabled
  const evoGroup = parseWebhookPayload(
    {
      data: {
        key: {
          remoteJid: groupJid,
          participantAlt: '5511977776666@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Carlos Membro',
        message: { conversation: 'Alguém sabe o preço?' },
      },
    },
    { allowGroups: true }
  );
  assert.deepEqual(evoGroup, {
    phone: '120363012345678901',
    senderName: 'Carlos Membro',
    text: 'Alguém sabe o preço?',
    source: 'evolution_api',
    isGroup: true,
    replyJid: groupJid,
    participantPhone: '5511977776666',
  });
});


