export interface ParsedIncomingWhatsAppMessage {
  phone: string;
  senderName?: string;
  text: string;
  source: 'meta_cloud' | 'evolution_api' | 'z_api' | 'generic';
  isGroup?: boolean;
  replyJid?: string;
  participantPhone?: string;
  groupName?: string;
  participantCount?: number;
}

export function normalizeWhatsAppDigits(raw: string): string {
  // Strip @s.whatsapp.net, @lid, @g.us, device suffixes (:12), and non-digits
  const withoutDomain = raw.split('@')[0].split(':')[0];
  return withoutDomain.replace(/\D/g, '');
}

/**
 * Generates candidate WhatsApp digit strings for lookup with sock.onWhatsApp().
 * Automatically handles missing '55' country code and Brazilian 9th-digit variations.
 */
export function getWhatsAppPhoneCandidates(rawPhone: string): string[] {
  let digits = normalizeWhatsAppDigits(rawPhone);
  if (!digits) return [];

  // Remove leading zeros
  digits = digits.replace(/^0+/, '');

  const candidates = new Set<string>();

  // If 10 or 11 digits (likely Brazilian DDD + number without country code 55)
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  candidates.add(digits);

  // Brazilian number 9th-digit variants:
  // 55 + 2-digit DDD + 9 + 8 digits = 13 digits
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    const withoutNine = digits.slice(0, 4) + digits.slice(5);
    candidates.add(withoutNine);
  }
  // 55 + 2-digit DDD + 8 digits = 12 digits
  if (digits.startsWith('55') && digits.length === 12) {
    const withNine = digits.slice(0, 4) + '9' + digits.slice(4);
    candidates.add(withNine);
  }

  return Array.from(candidates);
}

export function toWhatsAppJid(phone: string): string {
  if (phone.includes('@')) {
    return phone;
  }
  const digits = normalizeWhatsAppDigits(phone);
  return `${digits}@s.whatsapp.net`;
}

export function isGroupJid(jid?: string | null): boolean {
  return Boolean(jid && jid.endsWith('@g.us'));
}

export function isDirectUserJid(jid?: string | null): boolean {
  if (!jid) return false;
  if (jid.endsWith('@g.us')) return false; // Group chat
  if (jid === 'status@broadcast') return false; // Status/Stories
  if (jid.endsWith('@newsletter')) return false; // Channels
  if (jid.endsWith('@bot')) return false; // Meta AI bot
  return (
    jid.endsWith('@s.whatsapp.net') ||
    jid.endsWith('@lid') ||
    jid.endsWith('@hosted') ||
    jid.endsWith('@hosted.lid')
  );
}

export function isSupportedChatJid(jid?: string | null, allowGroups = true): boolean {
  if (!jid) return false;
  if (allowGroups && isGroupJid(jid)) return true;
  return isDirectUserJid(jid);
}

export function isPhoneNumberJid(jid?: string | null): boolean {
  if (!jid) return false;
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@hosted');
}

export function extractIncomingContactInfo(
  key: {
    remoteJid?: string | null;
    remoteJidAlt?: string | null;
    senderPn?: string | null;
    participant?: string | null;
    participantAlt?: string | null;
  },
  resolvedPnFromLid?: string | null
): {
  replyJid: string;
  pnJid: string | null;
  phoneDigits: string;
  isGroup: boolean;
  participantJid: string | null;
  participantDigits: string;
} {
  const remoteJid = key.remoteJid || '';
  const group = isGroupJid(remoteJid);

  if (group) {
    const participantCandidates = [key.participantAlt, resolvedPnFromLid, key.participant];
    const participantPn = participantCandidates.find((j) => isPhoneNumberJid(j)) || null;
    const participantJid = key.participantAlt || key.participant || null;
    const participantDigits = normalizeWhatsAppDigits(participantPn || participantJid || '');
    const groupDigits = normalizeWhatsAppDigits(remoteJid);

    return {
      replyJid: remoteJid,
      pnJid: participantPn,
      phoneDigits: groupDigits || remoteJid,
      isGroup: true,
      participantJid,
      participantDigits,
    };
  }

  const candidates = [key.remoteJidAlt, key.senderPn, resolvedPnFromLid, remoteJid];
  const pnJid = candidates.find((j) => isPhoneNumberJid(j)) || null;
  const phoneDigits = normalizeWhatsAppDigits(pnJid || remoteJid);

  return {
    replyJid: remoteJid,
    pnJid,
    phoneDigits,
    isGroup: false,
    participantJid: null,
    participantDigits: phoneDigits,
  };
}

export function shouldProcessUpsertMessage(
  eventType: string,
  msg: {
    key?: { id?: string | null; fromMe?: boolean | null; remoteJid?: string | null };
    messageTimestamp?: number | string | { toNumber?: () => number } | null;
  },
  processedIds: Set<string>,
  nowEpochSec = Math.floor(Date.now() / 1000),
  options?: { allowGroups?: boolean }
): boolean {
  if (eventType !== 'notify' && eventType !== 'append') return false;
  if (!msg?.key || msg.key.fromMe) return false;
  if (!isSupportedChatJid(msg.key.remoteJid, Boolean(options?.allowGroups))) return false;

  const msgId = msg.key.id;
  if (msgId && processedIds.has(msgId)) return false;

  if (eventType === 'append') {
    const rawTs = msg.messageTimestamp;
    const ts =
      typeof rawTs === 'number'
        ? rawTs
        : typeof rawTs === 'string'
        ? Number(rawTs)
        : rawTs && typeof rawTs.toNumber === 'function'
        ? rawTs.toNumber()
        : 0;
    // Only auto-reply to 'append' messages sent within the last 120s (ignore historical backlog)
    if (!ts || nowEpochSec - ts > 120) {
      return false;
    }
  }

  return true;
}

export function unwrapBaileysMessage(messageObj: any): any {
  if (!messageObj || typeof messageObj !== 'object') return null;

  if (messageObj.deviceSentMessage?.message) {
    return unwrapBaileysMessage(messageObj.deviceSentMessage.message);
  }
  if (messageObj.ephemeralMessage?.message) {
    return unwrapBaileysMessage(messageObj.ephemeralMessage.message);
  }
  if (messageObj.viewOnceMessage?.message) {
    return unwrapBaileysMessage(messageObj.viewOnceMessage.message);
  }
  if (messageObj.viewOnceMessageV2?.message) {
    return unwrapBaileysMessage(messageObj.viewOnceMessageV2.message);
  }
  if (messageObj.viewOnceMessageV2Extension?.message) {
    return unwrapBaileysMessage(messageObj.viewOnceMessageV2Extension.message);
  }
  if (messageObj.documentWithCaptionMessage?.message) {
    return unwrapBaileysMessage(messageObj.documentWithCaptionMessage.message);
  }
  if (messageObj.associatedChildMessage?.message) {
    return unwrapBaileysMessage(messageObj.associatedChildMessage.message);
  }
  if (messageObj.botInvokeMessage?.message) {
    return unwrapBaileysMessage(messageObj.botInvokeMessage.message);
  }
  if (messageObj.editedMessage?.message?.protocolMessage?.editedMessage) {
    return unwrapBaileysMessage(messageObj.editedMessage.message.protocolMessage.editedMessage);
  }

  return messageObj;
}

export function extractBaileysMessageText(rawMessageObj: any): string {
  const messageObj = unwrapBaileysMessage(rawMessageObj);
  if (!messageObj) return '';
  if (typeof messageObj.conversation === 'string') return messageObj.conversation;
  if (messageObj.extendedTextMessage?.text) return messageObj.extendedTextMessage.text;
  if (messageObj.imageMessage?.caption) return messageObj.imageMessage.caption;
  if (messageObj.videoMessage?.caption) return messageObj.videoMessage.caption;
  if (messageObj.documentMessage?.caption) return messageObj.documentMessage.caption;
  if (messageObj.buttonsResponseMessage?.selectedDisplayText) {
    return messageObj.buttonsResponseMessage.selectedDisplayText;
  }
  if (messageObj.listResponseMessage?.title) {
    return messageObj.listResponseMessage.title;
  }
  if (messageObj.templateButtonReplyMessage?.selectedDisplayText) {
    return messageObj.templateButtonReplyMessage.selectedDisplayText;
  }
  if (messageObj.interactiveResponseMessage?.body?.text) {
    return messageObj.interactiveResponseMessage.body.text;
  }
  return '';
}

export function isBotMentionedInBaileysMessage(
  rawMessageObj: any,
  ownJids: Array<string | undefined | null>
): boolean {
  const unwrapped = unwrapBaileysMessage(rawMessageObj);
  if (!unwrapped) return false;

  const ownUsers = new Set(
    ownJids
      .filter((j): j is string => Boolean(j))
      .map((j) => normalizeWhatsAppDigits(j))
      .filter(Boolean)
  );
  if (ownUsers.size === 0) return false;

  const contextInfo =
    unwrapped.extendedTextMessage?.contextInfo ||
    unwrapped.imageMessage?.contextInfo ||
    unwrapped.videoMessage?.contextInfo ||
    unwrapped.documentMessage?.contextInfo ||
    unwrapped.audioMessage?.contextInfo;

  if (!contextInfo) return false;

  const mentionedJids: string[] = Array.isArray(contextInfo.mentionedJid)
    ? contextInfo.mentionedJid
    : [];
  if (mentionedJids.some((jid) => ownUsers.has(normalizeWhatsAppDigits(jid)))) {
    return true;
  }

  if (contextInfo.participant && ownUsers.has(normalizeWhatsAppDigits(contextInfo.participant))) {
    return true;
  }

  return false;
}

export function parseWebhookPayload(
  body: any,
  options?: { allowGroups?: boolean }
): ParsedIncomingWhatsAppMessage | null {
  if (!body || typeof body !== 'object') return null;
  const allowGroups = Boolean(options?.allowGroups);

  // 1. Meta WhatsApp Cloud API format
  if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const value = body.entry[0].changes[0].value;
    const msgObj = value.messages[0];
    const contactName = value.contacts?.[0]?.profile?.name;
    const text = msgObj.text?.body || msgObj.button?.text || '';
    if (!text || !msgObj.from) return null;
    return {
      phone: normalizeWhatsAppDigits(msgObj.from),
      senderName: contactName,
      text,
      source: 'meta_cloud',
    };
  }

  // 2. Evolution API format (messages.upsert)
  if (body.data?.key && body.data?.message) {
    if (body.data.key.fromMe) return null;
    const remoteJid: string = body.data.key.remoteJid || '';
    if (!isSupportedChatJid(remoteJid, allowGroups)) return null;
    const text = extractBaileysMessageText(body.data.message);
    if (!text) return null;
    const group = isGroupJid(remoteJid);
    const participantJid = body.data.key.participantAlt || body.data.key.participant || '';
    return {
      phone: normalizeWhatsAppDigits(remoteJid),
      senderName: body.data.pushName,
      text,
      source: 'evolution_api',
      ...(group
        ? (() => {
            const gName =
              body.data.groupName ||
              body.data.groupMetadata?.subject ||
              body.groupName;
            const pCount =
              typeof body.data.participantCount === 'number'
                ? body.data.participantCount
                : typeof body.data.groupMetadata?.size === 'number'
                ? body.data.groupMetadata.size
                : undefined;
            return {
              isGroup: true,
              replyJid: remoteJid,
              participantPhone: participantJid ? normalizeWhatsAppDigits(participantJid) : undefined,
              ...(gName ? { groupName: String(gName) } : {}),
              ...(pCount !== undefined ? { participantCount: pCount } : {}),
            };
          })()
        : {}),
    };
  }

  // 3. Z-API format
  if (body.phone && body.text?.message && !body.fromMe) {
    const rawPhone = String(body.phone);
    const group = Boolean(body.isGroup || isGroupJid(rawPhone) || rawPhone.includes('-group'));
    if (group && !allowGroups) return null;
    const gName = body.chatName || body.groupName;
    return {
      phone: normalizeWhatsAppDigits(rawPhone),
      senderName: body.senderName || body.chatName,
      text: String(body.text.message),
      source: 'z_api',
      ...(group
        ? {
            isGroup: true,
            replyJid: rawPhone.includes('@') ? rawPhone : undefined,
            ...(gName ? { groupName: String(gName) } : {}),
          }
        : {}),
    };
  }

  // 4. Generic / direct JSON format
  const rawPhone = body.phone || body.from;
  const rawText = typeof body.text === 'string' ? body.text : body.message;
  if (rawPhone && rawText) {
    const rawStr = String(rawPhone);
    const group = Boolean(body.isGroup || isGroupJid(rawStr));
    if (group && !allowGroups) return null;
    return {
      phone: normalizeWhatsAppDigits(rawStr),
      senderName: body.name || body.senderName,
      text: String(rawText),
      source: 'generic',
      ...(group
        ? {
            isGroup: true,
            replyJid: isGroupJid(rawStr) ? rawStr : undefined,
            ...(body.groupName ? { groupName: String(body.groupName) } : {}),
            ...(typeof body.participantCount === 'number'
              ? { participantCount: body.participantCount }
              : {}),
          }
        : {}),
    };
  }

  return null;
}

export function shouldAiReplyToCustomer(
  customerAiEnabled: boolean | undefined,
  globalAutoReplyEnabled: boolean
): boolean {
  if (!globalAutoReplyEnabled) return false;
  // By default (undefined or true), AI responds to every customer unless explicitly disabled for that customer
  return customerAiEnabled !== false;
}

export function shouldAiReplyToConversation(params: {
  isGroup: boolean;
  customerAiEnabled: boolean | undefined;
  globalAutoReplyEnabled: boolean;
  groupAutoReplyEnabled: boolean;
  groupMentionOnly?: boolean;
  isMentioned?: boolean;
  scheduleAllowed?: boolean;
}): boolean {
  if (params.scheduleAllowed === false) return false;
  if (!shouldAiReplyToCustomer(params.customerAiEnabled, params.globalAutoReplyEnabled)) {
    return false;
  }
  if (params.isGroup) {
    if (!params.groupAutoReplyEnabled) return false;
    if (params.groupMentionOnly && !params.isMentioned) return false;
  }
  return true;
}

export function stripJsonCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

