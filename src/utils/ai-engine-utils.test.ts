import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_ENGINE,
  normalizeAiEngine,
  formatAiEngineLabel,
  parseStructuredAiResponse,
  maskApiKey,
  sanitizeAiEngineForClient,
  resolveChatCompletionsUrl,
  buildMultiTurnMessages,
} from './ai-engine-utils.ts';
import { Customer, ChatMessage } from '../types/index.ts';

test('normalizeAiEngine defaults to Gemini and supports DeepSeek + custom endpoints cleanly', () => {
  assert.deepEqual(normalizeAiEngine(undefined), DEFAULT_AI_ENGINE);
  assert.deepEqual(normalizeAiEngine({ provider: 'unknown' as any, model: '' }), DEFAULT_AI_ENGINE);

  const deepseek = normalizeAiEngine({
    provider: 'deepseek',
    model: '',
    customApiKey: '  sk-deepseek-1234567890  ',
  });
  assert.deepEqual(deepseek, {
    provider: 'deepseek',
    model: 'deepseek-chat',
    customBaseUrl: 'https://api.deepseek.com/v1',
    customApiKey: 'sk-deepseek-1234567890',
  });

  const custom = normalizeAiEngine({
    provider: 'custom_openai',
    model: 'llama3.1',
    customBaseUrl: '  http://localhost:11434/v1  ',
  });
  assert.deepEqual(custom, {
    provider: 'custom_openai',
    model: 'llama3.1',
    customBaseUrl: 'http://localhost:11434/v1',
  });
});

test('sanitizeAiEngineForClient masks customApiKey and strips raw secret', () => {
  assert.equal(maskApiKey('sk-1234567890abcd'), 'sk-1••••abcd');
  const sanitized = sanitizeAiEngineForClient({
    provider: 'deepseek',
    model: 'deepseek-chat',
    customBaseUrl: 'https://api.deepseek.com/v1',
    customApiKey: 'sk-secret-value-9999',
  });
  assert.equal((sanitized as any).customApiKey, undefined);
  assert.equal(sanitized.hasCustomApiKey, true);
  assert.equal(sanitized.customApiKeyMasked, 'sk-s••••9999');
});

test('resolveChatCompletionsUrl handles base URLs, /v1 URLs, and full chat/completions links', () => {
  assert.equal(
    resolveChatCompletionsUrl('https://api.deepseek.com'),
    'https://api.deepseek.com/chat/completions'
  );
  assert.equal(
    resolveChatCompletionsUrl('https://api.deepseek.com/v1/'),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.equal(
    resolveChatCompletionsUrl('https://api.deepseek.com/v1/chat/completions'),
    'https://api.deepseek.com/v1/chat/completions'
  );
});

test('buildMultiTurnMessages passes structured conversation history and group participants', () => {
  const customer: Customer = {
    id: 'c1',
    name: 'Grupo VIP',
    phone: '120363012345678901',
    isGroup: true,
    groupName: 'Grupo VIP',
    status: 'em_atendimento',
    funnelStage: 'descoberta',
    dealValue: 0,
    tags: [],
    notes: '',
    aiSummary: '',
    lastInteraction: new Date().toISOString(),
    nextAction: '',
    followUpSent: false,
    createdAt: new Date().toISOString(),
  };

  const history: ChatMessage[] = [
    {
      id: 'm1',
      customerId: 'c1',
      sender: 'customer',
      participantName: 'Maria',
      text: 'Oi, quanto custa?',
      timestamp: new Date().toISOString(),
      status: 'read',
    },
    {
      id: 'm2',
      customerId: 'c1',
      sender: 'bot',
      text: 'Olá Maria! O plano Pro custa R$ 197/mês.',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
    {
      id: 'm3',
      customerId: 'c1',
      sender: 'customer',
      participantName: 'João',
      text: 'Tem desconto anual?',
      timestamp: new Date().toISOString(),
      status: 'read',
    },
  ];

  const turns = buildMultiTurnMessages({
    systemInstruction: 'Seja direto.',
    customer,
    history,
    currentUserText: 'Tem desconto anual?',
    participantName: 'João',
  });

  assert.equal(turns[0].role, 'system');
  assert.match(turns[0].content, /Grupo VIP/);
  assert.equal(turns[1].role, 'user');
  assert.equal(turns[1].content, '[Maria]: Oi, quanto custa?');
  assert.equal(turns[2].role, 'assistant');
  assert.equal(turns[2].content, 'Olá Maria! O plano Pro custa R$ 197/mês.');
  assert.equal(turns[3].role, 'user');
  assert.equal(turns[3].content, '[João]: Tem desconto anual?');
});

test('formatAiEngineLabel and parseStructuredAiResponse work for DeepSeek and Gemini', () => {
  assert.equal(formatAiEngineLabel(undefined), 'Gemini (gemini-4-hydrogen)');
  assert.equal(formatAiEngineLabel({ provider: 'deepseek', model: 'deepseek-chat' }), 'DeepSeek (deepseek-chat)');

  const fenced = '```json\n{"reply":"Oi! Tudo certo.","status":"interessado","funnelStage":"proposta","productInterest":"Plano Pro","summary":"Pediu proposta","nextAction":"Enviar link"}\n```';
  const parsed = parseStructuredAiResponse(fenced, 'Fallback');
  assert.equal(parsed.replyText, 'Oi! Tudo certo.');
  assert.equal(parsed.detectedStatus, 'interessado');

  const plain = parseStructuredAiResponse('Olá, posso ajudar com seu pedido!', 'Fallback');
  assert.equal(plain.replyText, 'Olá, posso ajudar com seu pedido!');
});
