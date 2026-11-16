import { AiEngineSettings, AiProviderType, BotConfig, ChatMessage, Customer } from '../types/index.ts';
import { stripJsonCodeFences } from './whatsapp-utils.ts';

export const DEFAULT_AI_ENGINE: AiEngineSettings = {
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
};

export interface AiProviderCatalogEntry {
  id: AiProviderType;
  label: string;
  envVarName?: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  models: Array<{ id: string; label: string }>;
}

export const AI_PROVIDER_CATALOG: AiProviderCatalogEntry[] = [
  {
    id: 'gemini',
    label: 'Google Gemini (Padrão)',
    envVarName: 'GEMINI_API_KEY',
    defaultModel: 'gemini-4-hydrogen',
    models: [
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen / Flash (Padrão)' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Ultra rápido)' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon / Pro (Chave paga)' },
      { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Chave paga)' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (API / Chat & Reasoner)',
    envVarName: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3 · Rápido)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1 · Raciocínio)' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    envVarName: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Rápido)' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    envVarName: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-haiku-latest',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Rápido)' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
    ],
  },
  {
    id: 'custom_openai',
    label: 'Endpoint Compatível / Ollama Local',
    envVarName: 'CUSTOM_AI_API_KEY',
    defaultModel: 'llama3.1',
    defaultBaseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.1', label: 'Llama 3.1 (Ollama)' },
      { id: 'qwen2.5', label: 'Qwen 2.5 (Ollama)' },
      { id: 'mistral', label: 'Mistral' },
    ],
  },
];

const VALID_PROVIDERS = new Set<AiProviderType>([
  'gemini',
  'deepseek',
  'openai',
  'anthropic',
  'custom_openai',
]);

export function normalizeAiEngine(engine?: Partial<AiEngineSettings> | null): AiEngineSettings {
  const provider: AiProviderType =
    engine?.provider && VALID_PROVIDERS.has(engine.provider)
      ? engine.provider
      : DEFAULT_AI_ENGINE.provider;

  const catalogEntry = AI_PROVIDER_CATALOG.find((p) => p.id === provider);
  const rawModel = typeof engine?.model === 'string' ? engine.model.trim() : '';
  const model = rawModel || catalogEntry?.defaultModel || DEFAULT_AI_ENGINE.model;

  const rawBaseUrl =
    provider !== 'gemini' && typeof engine?.customBaseUrl === 'string'
      ? engine.customBaseUrl.trim()
      : '';
  const customBaseUrl =
    provider !== 'gemini' ? rawBaseUrl || catalogEntry?.defaultBaseUrl : undefined;

  const customApiKey =
    provider !== 'gemini' && typeof engine?.customApiKey === 'string' && engine.customApiKey.trim()
      ? engine.customApiKey.trim()
      : undefined;

  return {
    provider,
    model,
    ...(customBaseUrl ? { customBaseUrl } : {}),
    ...(customApiKey ? { customApiKey } : {}),
  };
}

export function maskApiKey(rawKey?: string): string | undefined {
  if (!rawKey || !rawKey.trim()) return undefined;
  const key = rawKey.trim();
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function sanitizeAiEngineForClient(engine?: Partial<AiEngineSettings> | null): AiEngineSettings {
  const normalized = normalizeAiEngine(engine);
  const masked = maskApiKey(normalized.customApiKey);
  const { customApiKey: _omit, ...rest } = normalized;
  return {
    ...rest,
    hasCustomApiKey: Boolean(normalized.customApiKey),
    ...(masked ? { customApiKeyMasked: masked } : {}),
  };
}

export function resolveChatCompletionsUrl(baseUrl?: string, fallbackBase = 'https://api.deepseek.com/v1'): string {
  const clean = (baseUrl || fallbackBase).trim().replace(/\/+$/, '');
  if (!clean) return `${fallbackBase.replace(/\/+$/, '')}/chat/completions`;
  if (/\/chat\/completions$/i.test(clean)) return clean;
  if (/\/v\d+(?:alpha|beta)?$/i.test(clean)) return `${clean}/chat/completions`;
  // e.g. https://api.deepseek.com -> https://api.deepseek.com/chat/completions (also works on DeepSeek & OpenAI-compat)
  return `${clean}/chat/completions`;
}

export function buildMultiTurnMessages(params: {
  systemInstruction: string;
  customer: Customer;
  history: ChatMessage[];
  currentUserText: string;
  participantName?: string;
}): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const { systemInstruction, customer, history, currentUserText, participantName } = params;

  const crmHeader = `CONTEXTO DO CONTATO NO CRM:
- Tipo de chat: ${customer.isGroup ? `Grupo do WhatsApp (${customer.groupName || customer.name})` : 'Conversa Privada'}
- Nome: ${customer.name}
- WhatsApp / ID: ${customer.phone}
- Status atual: ${customer.status}
- Etapa do funil: ${customer.funnelStage}
- Interesse prévio: ${customer.productInterest || 'Nenhum definido'}`;

  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${systemInstruction}\n\n${crmHeader}`,
    },
  ];

  // Include recent history excluding a duplicate trailing copy of currentUserText if already appended
  const recent = history.slice(-12);
  const trimmedCurrent = currentUserText.trim();
  const historySlice =
    recent.length > 0 &&
    recent[recent.length - 1].sender === 'customer' &&
    recent[recent.length - 1].text.trim() === trimmedCurrent
      ? recent.slice(0, -1)
      : recent;

  for (const msg of historySlice) {
    const role: 'user' | 'assistant' = msg.sender === 'customer' ? 'user' : 'assistant';
    const text =
      role === 'user' && customer.isGroup && msg.participantName
        ? `[${msg.participantName}]: ${msg.text}`
        : msg.text;
    if (!text.trim()) continue;

    // Merge consecutive turns of the same role to satisfy strict alternating-turn APIs
    const last = result[result.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n${text}`;
    } else {
      result.push({ role, content: text });
    }
  }

  const finalUserTurn =
    customer.isGroup && participantName
      ? `[${participantName}]: ${currentUserText}`
      : currentUserText;

  const last = result[result.length - 1];
  if (last && last.role === 'user') {
    last.content = `${last.content}\n${finalUserTurn}`;
  } else {
    result.push({ role: 'user', content: finalUserTurn });
  }

  return result;
}

export function formatAiEngineLabel(engine?: Partial<AiEngineSettings> | null): string {
  const normalized = normalizeAiEngine(engine);
  const shortProvider =
    normalized.provider === 'gemini'
      ? 'Gemini'
      : normalized.provider === 'deepseek'
      ? 'DeepSeek'
      : normalized.provider === 'openai'
      ? 'OpenAI'
      : normalized.provider === 'anthropic'
      ? 'Claude'
      : 'Custom IA';
  return `${shortProvider} (${normalized.model})`;
}

export interface ParsedStructuredAiReply {
  replyText: string;
  detectedStatus?: string;
  detectedFunnel?: string;
  detectedProduct?: string;
  detectedSummary?: string;
  detectedAction?: string;
}

export function parseStructuredAiResponse(
  rawText: string,
  fallbackWelcome: string
): ParsedStructuredAiReply {
  const cleaned = stripJsonCodeFences(rawText || '');
  if (!cleaned) {
    return { replyText: fallbackWelcome || 'Olá! Como posso te ajudar hoje?' };
  }

  let candidateJson = cleaned;
  if (!candidateJson.startsWith('{')) {
    const firstBrace = candidateJson.indexOf('{');
    const lastBrace = candidateJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidateJson = candidateJson.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(candidateJson);
    if (parsed && typeof parsed === 'object') {
      return {
        replyText:
          typeof parsed.reply === 'string' && parsed.reply.trim()
            ? parsed.reply.trim()
            : fallbackWelcome || 'Olá! Como posso te ajudar hoje?',
        detectedStatus: typeof parsed.status === 'string' ? parsed.status : undefined,
        detectedFunnel: typeof parsed.funnelStage === 'string' ? parsed.funnelStage : undefined,
        detectedProduct:
          typeof parsed.productInterest === 'string' && parsed.productInterest.trim()
            ? parsed.productInterest.trim()
            : undefined,
        detectedSummary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        detectedAction: typeof parsed.nextAction === 'string' ? parsed.nextAction : undefined,
      };
    }
  } catch {
    // External models may occasionally answer in plain text without JSON
  }

  return {
    replyText: cleaned,
  };
}
