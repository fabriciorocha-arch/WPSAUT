import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  Customer,
  ChatMessage,
  BotConfig,
  FollowUpTask,
  WhatsAppConnectionState,
  WhatsAppProviderMode,
  MetaCloudConfig,
  EvolutionApiConfig,
  WhatsAppGroupInfo,
} from './src/types/index.ts';
import {
  calculateAnalytics,
  isFollowUpDue,
  parseFollowUpRating,
} from './src/utils/crm-analytics.ts';
import {
  parseWebhookPayload,
  normalizeWhatsAppDigits,
  getWhatsAppPhoneCandidates,
  shouldAiReplyToCustomer,
  shouldAiReplyToConversation,
  isGroupJid,
  stripJsonCodeFences,
} from './src/utils/whatsapp-utils.ts';
import {
  DEFAULT_BOT_SCHEDULE,
  isWithinBotSchedule,
  isFollowUpAllowedToday,
} from './src/utils/schedule-utils.ts';
import { WhatsAppManager } from './server/whatsapp-manager.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Server-side Gemini lazy initialization
let cachedAiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

// Persistence file
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

interface PersistedStore {
  botConfig: BotConfig;
  customers: Customer[];
  messages: ChatMessage[];
  followUpTasks: FollowUpTask[];
  whatsappPrefs?: {
    provider: WhatsAppProviderMode;
    metaConfig: MetaCloudConfig;
    evolutionConfig: EvolutionApiConfig;
    autoReplyEnabled: boolean;
    groupAutoReplyEnabled?: boolean;
    groupMentionOnly?: boolean;
  };
}

// Default Seed Data
const defaultBotConfig: BotConfig = {
  name: 'Sofia - Assistente Comercial',
  persona:
    'Especialista em atendimento e vendas, empática, ágil e focada em solucionar dúvidas e guiar para o fechamento.',
  niche: 'geral',
  systemPrompt: `Você é a Sofia, consultora virtual no WhatsApp da nossa empresa.
Seu objetivo é:
1. Cumprimentar de forma calorosa, profissional e ágil no tom de WhatsApp (use emojis moderados e quebras de linha curtas).
2. Entender a necessidade do cliente e responder suas perguntas com clareza.
3. Explicar nossos serviços/planos e tirar todas as dúvidas técnicas e financeiras.
4. Conduzir o cliente para a conversão (fechamento, agendamento de demonstração ou compra).
5. Se o cliente solicitar humano ou caso complexo, confirme que um consultor entrará em contato.
Nunca invente informações enganosas. Mantenha as mensagens concisas e fáceis de ler no celular.`,
  welcomeMessage: 'Olá! Seja muito bem-vindo(a). Como posso ajudar você hoje?',
  followUpDelayHours: 24,
  followUpMessageTemplate:
    'Olá, {nome}! Tudo bem? Conversamos ontem sobre {assunto}. Queria saber como foi sua experiência e se posso te ajudar com mais alguma coisa? De 1 a 5, como avalia nosso atendimento?',
  autoFollowUpEnabled: true,
  followUpBlockedDays: [],
  followUpBlockedDates: [],
  schedule: { ...DEFAULT_BOT_SCHEDULE },
  qualificationCriteria: 'Lead qualificado se tem interesse em produto e orçamento compatível.',
  phoneConnected: '',
  isConnected: false,
};

const defaultCustomers: Customer[] = [];

const defaultMessages: ChatMessage[] = [];

const defaultFollowUpTasks: FollowUpTask[] = [];

function loadStore(): PersistedStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStore;
      return {
        botConfig: {
          ...defaultBotConfig,
          ...parsed.botConfig,
          followUpBlockedDays: Array.isArray(parsed.botConfig?.followUpBlockedDays)
            ? parsed.botConfig.followUpBlockedDays
            : defaultBotConfig.followUpBlockedDays,
          followUpBlockedDates: Array.isArray(parsed.botConfig?.followUpBlockedDates)
            ? parsed.botConfig.followUpBlockedDates
            : defaultBotConfig.followUpBlockedDates,
          schedule: {
            ...DEFAULT_BOT_SCHEDULE,
            ...(parsed.botConfig?.schedule || {}),
          },
        },
        customers: Array.isArray(parsed.customers) ? parsed.customers : defaultCustomers,
        messages: Array.isArray(parsed.messages) ? parsed.messages : defaultMessages,
        followUpTasks: Array.isArray(parsed.followUpTasks)
          ? parsed.followUpTasks
          : defaultFollowUpTasks,
        whatsappPrefs: parsed.whatsappPrefs,
      };
    }
  } catch (err) {
    console.error('Error loading store.json, using defaults:', err);
  }
  return {
    botConfig: defaultBotConfig,
    customers: defaultCustomers,
    messages: defaultMessages,
    followUpTasks: defaultFollowUpTasks,
  };
}

const initialStore = loadStore();
let botConfig: BotConfig = initialStore.botConfig;
let customers: Customer[] = initialStore.customers;
let messages: ChatMessage[] = initialStore.messages;
let followUpTasks: FollowUpTask[] = initialStore.followUpTasks;

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload: PersistedStore = {
      botConfig,
      customers,
      messages,
      followUpTasks,
      whatsappPrefs: whatsappManager
        ? {
            provider: whatsappManager.state.provider,
            metaConfig: whatsappManager.state.metaConfig,
            evolutionConfig: whatsappManager.state.evolutionConfig,
            autoReplyEnabled: whatsappManager.state.autoReplyEnabled,
            groupAutoReplyEnabled: whatsappManager.state.groupAutoReplyEnabled,
            groupMentionOnly: whatsappManager.state.groupMentionOnly,
          }
        : initialStore.whatsappPrefs,
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error persisting store.json:', err);
  }
}

// SSE Clients for real-time UI updates
const sseClients = new Set<Response>();
function broadcastEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  });
}

let lastAiError: string | null = null;

// Helper: AI Response Generator strictly aligned with "Configurar IA (Prompt)"
async function generateAiReply(
  userText: string,
  customer: Customer,
  history: ChatMessage[],
  config: BotConfig,
  participantName?: string
): Promise<{
  replyText: string;
  detectedStatus?: string;
  detectedFunnel?: string;
  detectedProduct?: string;
  detectedSummary?: string;
  detectedAction?: string;
  aiError?: string;
}> {
  const client = getAiClient();
  if (!client) {
    console.warn('[AI] GEMINI_API_KEY ausente no ambiente. Usando resposta de contingência.');
    const welcomeHint = config.welcomeMessage ? `${config.welcomeMessage} ` : '';
    const targetName = participantName || customer.name || 'amigo(a)';
    return {
      replyText: `${welcomeHint}Olá ${targetName}! Sou ${config.name}. Recebi sua mensagem sobre "${userText.slice(0, 80)}" e estou à disposição para ajudar conforme nossas orientações. Como posso prosseguir com seu atendimento?`,
      detectedStatus: customer.status === 'novo' ? 'em_atendimento' : customer.status,
      detectedSummary: `Cliente perguntou sobre: ${userText.slice(0, 60)}`,
      detectedAction: 'Continuar atendimento no WhatsApp',
    };
  }

  try {
    const formattedHistory = history
      .slice(-10)
      .map((m) => {
        const speaker =
          m.sender === 'customer'
            ? m.participantName
              ? `Cliente (${m.participantName})`
              : 'Cliente'
            : 'Assistente';
        return `${speaker}: ${m.text}`;
      })
      .join('\n');

    const systemInstruction = `Você é "${config.name}", atendendo clientes no WhatsApp.
Persona / Perfil: ${config.persona}

REGRAS E PROMPT OFICIAL CONFIGURADO PELO USUÁRIO (SIGA RIGOROSAMENTE):
"""
${config.systemPrompt}
"""

Diretrizes obrigatórias:
- Responda exclusivamente com base nas regras, produtos, preços e instruções acima definidas pelo usuário.
- Escreva em português brasileiro natural de WhatsApp (mensagens claras, objetivas, empáticas e fáceis de ler no celular).
- Se estiver em um grupo do WhatsApp, responda de forma cordial mencionando ou dirigindo-se naturalmente ao participante que perguntou, sem perder o foco comercial.
- Retorne sempre um JSON válido no esquema solicitado.`;

    const prompt = `DADOS ATUAIS DO CONTATO NO CRM:
- Tipo de chat: ${customer.isGroup ? `Grupo do WhatsApp (${customer.groupName || customer.name})` : 'Conversa Privada'}
- Nome: ${customer.name}
${participantName ? `- Participante que enviou esta mensagem: ${participantName}\n` : ''}- WhatsApp / ID: ${customer.phone}
- Status atual: ${customer.status}
- Etapa do funil: ${customer.funnelStage}
- Interesse prévio: ${customer.productInterest || 'Nenhum definido'}

HISTÓRICO RECENTE DA CONVERSA:
${formattedHistory || '(Início do atendimento)'}

NOVA MENSAGEM ENVIADA AGORA:
"${userText}"`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let response: any = null;
    let lastAttemptErr: any = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const modelName = modelsToTry[i];
      try {
        const generatePromise = client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            ...(modelName === 'gemini-3.8-flash'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description:
                    'A resposta exata que será enviada ao cliente no WhatsApp seguindo o Prompt configurado.',
                },
                status: {
                  type: Type.STRING,
                  description:
                    'Um dos valores: novo, em_atendimento, interessado, aguardando_followup, convertido, perdido.',
                },
                funnelStage: {
                  type: Type.STRING,
                  description:
                    'Um dos valores: descoberta, qualificacao, proposta, fechamento, pos_venda.',
                },
                productInterest: {
                  type: Type.STRING,
                  description:
                    'Produto, plano ou serviço de interesse identificado (vazio se indefinido).',
                },
                summary: {
                  type: Type.STRING,
                  description: 'Resumo curto (1 frase) do atendimento para a planilha do CRM.',
                },
                nextAction: {
                  type: Type.STRING,
                  description: 'Próxima ação recomendada para este lead.',
                },
              },
              required: ['reply', 'status', 'funnelStage', 'summary', 'nextAction'],
            },
          },
        });
        response = await Promise.race([
          generatePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 10s (${modelName})`)), 10_000)
          ),
        ]);
        break;
      } catch (attemptErr: any) {
        lastAttemptErr = attemptErr;
        const msg = attemptErr?.message || String(attemptErr);
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Timeout');
        console.warn(
          `[AI] Tentativa ${i + 1} (${modelName}) falhou${isTransient ? ' (temporário)' : ''}:`,
          msg
        );
        if (!isTransient && i === 0) {
          throw attemptErr;
        }
        if (i < modelsToTry.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    if (!response) {
      throw lastAttemptErr || new Error('Falha ao obter resposta do Gemini');
    }

    const jsonText = stripJsonCodeFences(response.text || '{}');
    const parsed = JSON.parse(jsonText);

    lastAiError = null;
    return {
      replyText: parsed.reply || config.welcomeMessage || 'Olá! Como posso te ajudar hoje?',
      detectedStatus: parsed.status,
      detectedFunnel: parsed.funnelStage,
      detectedProduct: parsed.productInterest || undefined,
      detectedSummary: parsed.summary,
      detectedAction: parsed.nextAction,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    lastAiError = errMsg;
    console.error('[AI] Erro ao gerar resposta com Gemini:', errMsg);
    return {
      replyText: `Olá ${customer.name || ''}! Recebi sua mensagem sobre "${userText.slice(0, 50)}". Como posso te ajudar melhor com isso hoje?`,
      detectedStatus: customer.status === 'novo' ? 'em_atendimento' : customer.status,
      detectedSummary: `Dúvida do cliente: ${userText.slice(0, 60)}`,
      aiError: errMsg,
    };
  }
}

function findCustomerByContact(
  phoneDigits: string,
  jid?: string,
  isGroup?: boolean
): Customer | undefined {
  if (isGroup || isGroupJid(jid)) {
    return customers.find((c) => {
      if (jid && c.whatsappJid && c.whatsappJid === jid) return true;
      return Boolean(c.isGroup && phoneDigits && normalizeWhatsAppDigits(c.phone) === phoneDigits);
    });
  }

  const candidates = phoneDigits ? getWhatsAppPhoneCandidates(phoneDigits) : [];
  return customers.find((c) => {
    if (c.isGroup) return false;
    if (jid && c.whatsappJid && c.whatsappJid === jid) return true;
    const custDigits = normalizeWhatsAppDigits(c.phone);
    if (!custDigits || !phoneDigits) return false;
    if (custDigits === phoneDigits) return true;
    const custCandidates = getWhatsAppPhoneCandidates(custDigits);
    return candidates.some((cand) => custCandidates.includes(cand));
  });
}

// Unified handler for real incoming WhatsApp messages (Baileys or Webhooks, 1:1 and Groups)
async function handleIncomingWhatsAppMessage(payload: {
  phone: string;
  senderName?: string;
  text: string;
  replyJid?: string;
  isGroup?: boolean;
  groupName?: string;
  participantCount?: number;
  participantName?: string;
  participantPhone?: string;
  isMentioned?: boolean;
}): Promise<string | null> {
  const isGroup = Boolean(payload.isGroup || isGroupJid(payload.replyJid));
  const digits = normalizeWhatsAppDigits(payload.phone);
  if (!digits && !payload.replyJid) return null;

  let customer = findCustomerByContact(digits, payload.replyJid, isGroup);
  if (!customer) {
    const displayName = isGroup
      ? payload.groupName || payload.senderName || `Grupo ${digits.slice(-4)}`
      : payload.senderName || `WhatsApp ${digits.slice(-4)}`;
    customer = {
      id: `cust-${Date.now()}`,
      name: displayName,
      phone: digits,
      whatsappJid: payload.replyJid,
      isGroup,
      groupName: isGroup ? displayName : undefined,
      participantCount: payload.participantCount,
      aiEnabled: true,
      status: 'novo',
      funnelStage: 'descoberta',
      dealValue: 0,
      tags: isGroup ? ['whatsapp-grupo'] : ['whatsapp-real'],
      notes: isGroup
        ? 'Grupo integrado automaticamente via WhatsApp'
        : 'Contato recebido automaticamente via WhatsApp',
      aiSummary: isGroup
        ? 'Conversa em grupo do WhatsApp'
        : 'Conversa iniciada pelo cliente no WhatsApp',
      lastInteraction: new Date().toISOString(),
      nextAction: isGroup ? 'Acompanhar atendimento no grupo' : 'Qualificar lead',
      followUpSent: false,
      createdAt: new Date().toISOString(),
    };
    customers.unshift(customer);
  } else {
    if (
      payload.replyJid &&
      (!customer.whatsappJid ||
        (payload.replyJid.endsWith('@lid') && !customer.whatsappJid.endsWith('@lid')))
    ) {
      customer.whatsappJid = payload.replyJid;
    }
    if (isGroup) {
      customer.isGroup = true;
      if (payload.groupName) {
        customer.groupName = payload.groupName;
        if (customer.name.startsWith('Grupo ') || customer.name.startsWith('WhatsApp ')) {
          customer.name = payload.groupName;
        }
      }
      if (payload.participantCount !== undefined) {
        customer.participantCount = payload.participantCount;
      }
    } else if (
      payload.senderName &&
      (customer.name.startsWith('WhatsApp ') || customer.name.startsWith('Contato '))
    ) {
      customer.name = payload.senderName;
    }
  }

  // Record incoming customer or group-member message
  const userMsg: ChatMessage = {
    id: `msg-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: customer.id,
    sender: 'customer',
    text: payload.text,
    timestamp: new Date().toISOString(),
    status: 'read',
    ...(isGroup
      ? {
          participantName: payload.participantName || 'Participante',
          participantPhone: payload.participantPhone,
        }
      : {}),
  };
  messages.push(userMsg);

  // Check if customer is replying to a 24h follow-up with a rating (1:1 contacts)
  if (!isGroup && customer.followUpSent && !customer.csatRating) {
    const { rating, feedback } = parseFollowUpRating(payload.text);
    if (rating) {
      customer.csatRating = rating;
      customer.csatFeedback = feedback;
      const task = followUpTasks.find((t) => t.customerId === customer?.id && t.status === 'sent');
      if (task) {
        task.status = 'replied';
        task.ratingReceived = rating;
        task.feedbackText = feedback;
      }
    }
  }

  const scheduleCheck = isWithinBotSchedule(botConfig.schedule);
  const allowedWithoutSchedule = shouldAiReplyToConversation({
    isGroup,
    customerAiEnabled: customer.aiEnabled,
    globalAutoReplyEnabled: whatsappManager.state.autoReplyEnabled,
    groupAutoReplyEnabled: whatsappManager.state.groupAutoReplyEnabled,
    groupMentionOnly: whatsappManager.state.groupMentionOnly,
    isMentioned: payload.isMentioned,
    scheduleAllowed: true,
  });

  let replyText: string | null = null;
  if (allowedWithoutSchedule && scheduleCheck.allowed) {
    const history = messages.filter((m) => m.customerId === customer!.id);
    const aiResult = await generateAiReply(
      payload.text,
      customer,
      history,
      botConfig,
      isGroup ? payload.participantName : undefined
    );
    replyText = aiResult.replyText;

    const botMsg: ChatMessage = {
      id: `msg-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: customer.id,
      sender: 'bot',
      text: replyText,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
    messages.push(botMsg);

    if (aiResult.detectedStatus) customer.status = aiResult.detectedStatus as any;
    if (aiResult.detectedFunnel) customer.funnelStage = aiResult.detectedFunnel as any;
    if (aiResult.detectedProduct) customer.productInterest = aiResult.detectedProduct;
    if (aiResult.detectedSummary) customer.aiSummary = aiResult.detectedSummary;
    if (aiResult.detectedAction) customer.nextAction = aiResult.detectedAction;
  } else if (
    allowedWithoutSchedule &&
    !scheduleCheck.allowed &&
    botConfig.schedule?.sendOffHoursMessage &&
    botConfig.schedule?.offHoursMessage?.trim()
  ) {
    const offHoursKey = customer.id;
    const lastSent = offHoursCooldownMap.get(offHoursKey) || 0;
    const sixHoursMs = 6 * 60 * 60 * 1000;
    if (Date.now() - lastSent > sixHoursMs) {
      offHoursCooldownMap.set(offHoursKey, Date.now());
      replyText = botConfig.schedule.offHoursMessage.trim();
      messages.push({
        id: `msg-out-off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        customerId: customer.id,
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toISOString(),
        status: 'sent',
      });
    } else {
      console.log(
        `[AI] Fora do horário (${scheduleCheck.reason} às ${scheduleCheck.currentTime}); mensagem de ausência já enviada recentemente para ${customer.name}.`
      );
    }
  } else {
    console.log(
      `[AI] Resposta automática ignorada para ${customer.name} (${customer.phone}) — isGroup=${isGroup}, aiEnabled=${customer.aiEnabled}, global=${whatsappManager.state.autoReplyEnabled}, groupAuto=${whatsappManager.state.groupAutoReplyEnabled}, mentionOnly=${whatsappManager.state.groupMentionOnly}, isMentioned=${payload.isMentioned}, scheduleAllowed=${scheduleCheck.allowed} (${scheduleCheck.reason || 'ok'})`
    );
  }

  customer.lastInteraction = new Date().toISOString();
  saveStore();
  broadcastEvent('data_updated', { customerId: customer.id });

  return replyText;
}

const defaultAppUrl = process.env.APP_URL || `http://localhost:${PORT}`;
const whatsappManager = new WhatsAppManager(
  `${defaultAppUrl.replace(/\/+$/, '')}/api/whatsapp/webhook`,
  handleIncomingWhatsAppMessage,
  (newState: WhatsAppConnectionState) => {
    botConfig.isConnected = newState.status === 'connected';
    botConfig.phoneConnected = newState.connectedPhone || '';
    saveStore();
    broadcastEvent('whatsapp_status', newState);
  },
  initialStore.whatsappPrefs?.metaConfig,
  initialStore.whatsappPrefs?.evolutionConfig,
  initialStore.whatsappPrefs?.provider
);

if (initialStore.whatsappPrefs?.autoReplyEnabled !== undefined) {
  whatsappManager.state.autoReplyEnabled = initialStore.whatsappPrefs.autoReplyEnabled;
}
if (initialStore.whatsappPrefs?.groupAutoReplyEnabled !== undefined) {
  whatsappManager.state.groupAutoReplyEnabled = initialStore.whatsappPrefs.groupAutoReplyEnabled;
}
if (initialStore.whatsappPrefs?.groupMentionOnly !== undefined) {
  whatsappManager.state.groupMentionOnly = initialStore.whatsappPrefs.groupMentionOnly;
}

// Background Follow-up 24h Runner (checks every 60 seconds)
const offHoursCooldownMap = new Map<string, number>();

async function runDueFollowUps(sendRealWhatsApp = true): Promise<FollowUpTask[]> {
  if (!botConfig.autoFollowUpEnabled) return [];

  const dayCheck = isFollowUpAllowedToday(
    botConfig.followUpBlockedDays,
    botConfig.followUpBlockedDates,
    botConfig.schedule?.timezone
  );
  if (!dayCheck.allowed) {
    console.log(
      `[Follow-up] Envio automático bloqueado para hoje (${dayCheck.isoDate}, dia ${dayCheck.currentDay}) por regra: ${dayCheck.reason}.`
    );
    return [];
  }

  const now = new Date();
  const triggered: FollowUpTask[] = [];

  for (const cust of customers) {
    if (cust.isGroup) continue; // Do not send automated 24h CSAT blasts into groups
    const isDue = isFollowUpDue(
      cust.lastInteraction,
      botConfig.followUpDelayHours,
      cust.followUpSent,
      cust.status
    );
    if (isDue) {
      const msgText = botConfig.followUpMessageTemplate
        .replace('{nome}', cust.name.split(' ')[0] || 'Cliente')
        .replace('{assunto}', cust.productInterest || 'nosso atendimento');

      if (sendRealWhatsApp && whatsappManager.state.status === 'connected') {
        await whatsappManager.sendMessage(cust.whatsappJid || cust.phone, msgText);
      }

      const task: FollowUpTask = {
        id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        customerId: cust.id,
        customerName: cust.name,
        phone: cust.phone,
        scheduledFor: now.toISOString(),
        sentAt: now.toISOString(),
        status: 'sent',
        messageText: msgText,
      };

      followUpTasks.unshift(task);
      messages.push({
        id: `msg-fu-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        customerId: cust.id,
        sender: 'bot',
        text: msgText,
        timestamp: now.toISOString(),
        status: 'delivered',
        isFollowUp: true,
      });

      cust.followUpSent = true;
      cust.followUpDate = now.toISOString();
      cust.status = 'aguardando_followup';
      triggered.push(task);
    }
  }

  if (triggered.length > 0) {
    saveStore();
    broadcastEvent('data_updated', { followUpsSent: triggered.length });
  }

  return triggered;
}

setInterval(() => {
  if (whatsappManager.state.status === 'connected' && botConfig.autoFollowUpEnabled) {
    runDueFollowUps(true).catch((err) => console.error('Background follow-up error:', err));
  }
}, 60_000);

// ----------------- API ENDPOINTS -----------------

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    whatsappStatus: whatsappManager.state.status,
    lastAiError,
  });
});

// Real-time SSE stream
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`event: whatsapp_status\ndata: ${JSON.stringify(whatsappManager.state)}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Settings
app.get('/api/settings', (req: Request, res: Response) => {
  res.json({
    ...botConfig,
    isConnected: whatsappManager.state.status === 'connected',
    phoneConnected: whatsappManager.state.connectedPhone || '',
    autoReplyEnabled: whatsappManager.state.autoReplyEnabled,
    groupAutoReplyEnabled: whatsappManager.state.groupAutoReplyEnabled,
    groupMentionOnly: whatsappManager.state.groupMentionOnly,
  });
});

app.post('/api/settings', (req: Request, res: Response) => {
  const {
    autoReplyEnabled,
    groupAutoReplyEnabled,
    groupMentionOnly,
    schedule,
    followUpBlockedDays,
    followUpBlockedDates,
    ...rest
  } = req.body || {};

  botConfig = {
    ...botConfig,
    ...rest,
    ...(Array.isArray(followUpBlockedDays) ? { followUpBlockedDays } : {}),
    ...(Array.isArray(followUpBlockedDates) ? { followUpBlockedDates } : {}),
    ...(schedule && typeof schedule === 'object'
      ? {
          schedule: {
            ...DEFAULT_BOT_SCHEDULE,
            ...(botConfig.schedule || {}),
            ...schedule,
          },
        }
      : {}),
  };

  if (autoReplyEnabled !== undefined) {
    whatsappManager.setAutoReply(Boolean(autoReplyEnabled));
  }
  if (groupAutoReplyEnabled !== undefined || groupMentionOnly !== undefined) {
    whatsappManager.setGroupAutoReply(
      groupAutoReplyEnabled !== undefined
        ? Boolean(groupAutoReplyEnabled)
        : whatsappManager.state.groupAutoReplyEnabled,
      groupMentionOnly !== undefined ? Boolean(groupMentionOnly) : undefined
    );
  }

  saveStore();
  broadcastEvent('data_updated', { settingsUpdated: true });
  res.json({
    success: true,
    config: {
      ...botConfig,
      autoReplyEnabled: whatsappManager.state.autoReplyEnabled,
      groupAutoReplyEnabled: whatsappManager.state.groupAutoReplyEnabled,
      groupMentionOnly: whatsappManager.state.groupMentionOnly,
    },
  });
});

// WhatsApp Connection Management Endpoints
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const host = req.get('host');
  if (host) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    whatsappManager.setWebhookUrl(`${proto}://${host}/api/whatsapp/webhook`);
  }
  res.json(whatsappManager.state);
});

app.post('/api/whatsapp/connect/baileys', async (req: Request, res: Response) => {
  const { pairingPhoneNumber } = req.body || {};
  const state = await whatsappManager.connectBaileys(pairingPhoneNumber);
  res.json(state);
});

app.post('/api/whatsapp/disconnect', async (req: Request, res: Response) => {
  const state = await whatsappManager.disconnectBaileys(true);
  saveStore();
  res.json(state);
});

app.post('/api/whatsapp/config/meta', (req: Request, res: Response) => {
  const { phoneNumberId, accessToken, verifyToken } = req.body || {};
  const state = whatsappManager.configureMetaCloud({
    phoneNumberId: phoneNumberId || '',
    accessToken: accessToken || '',
    verifyToken: verifyToken || 'zapflow_token_secret',
  });
  saveStore();
  res.json(state);
});

app.post('/api/whatsapp/config/evolution', (req: Request, res: Response) => {
  const { baseUrl, instanceName, apiKey: evoApiKey } = req.body || {};
  const state = whatsappManager.configureEvolutionApi({
    baseUrl: baseUrl || '',
    instanceName: instanceName || '',
    apiKey: evoApiKey || '',
  });
  saveStore();
  res.json(state);
});

app.post('/api/whatsapp/auto-reply', (req: Request, res: Response) => {
  const { enabled } = req.body || {};
  whatsappManager.setAutoReply(Boolean(enabled));
  saveStore();
  res.json({ success: true, autoReplyEnabled: whatsappManager.state.autoReplyEnabled });
});

app.post('/api/whatsapp/group-auto-reply', (req: Request, res: Response) => {
  const { enabled, mentionOnly } = req.body || {};
  whatsappManager.setGroupAutoReply(
    enabled !== undefined ? Boolean(enabled) : whatsappManager.state.groupAutoReplyEnabled,
    mentionOnly !== undefined ? Boolean(mentionOnly) : undefined
  );
  saveStore();
  res.json({
    success: true,
    groupAutoReplyEnabled: whatsappManager.state.groupAutoReplyEnabled,
    groupMentionOnly: whatsappManager.state.groupMentionOnly,
  });
});

app.get('/api/whatsapp/groups', async (req: Request, res: Response) => {
  const joined = await whatsappManager.getJoinedGroups();
  const groupsByJid = new Map<string, WhatsAppGroupInfo>();

  for (const g of joined) {
    const existing = findCustomerByContact(normalizeWhatsAppDigits(g.jid), g.jid, true);
    if (existing) {
      existing.isGroup = true;
      existing.groupName = g.name;
      existing.participantCount = g.participantCount;
    }
    groupsByJid.set(g.jid, {
      jid: g.jid,
      name: g.name,
      participantCount: g.participantCount,
      aiEnabled: existing ? existing.aiEnabled !== false : true,
      registeredInCrm: Boolean(existing),
      customerId: existing?.id,
    });
  }

  for (const cust of customers) {
    if (cust.isGroup && cust.whatsappJid && !groupsByJid.has(cust.whatsappJid)) {
      groupsByJid.set(cust.whatsappJid, {
        jid: cust.whatsappJid,
        name: cust.groupName || cust.name,
        participantCount: cust.participantCount || 0,
        aiEnabled: cust.aiEnabled !== false,
        registeredInCrm: true,
        customerId: cust.id,
      });
    }
  }

  res.json({ groups: Array.from(groupsByJid.values()) });
});

app.post('/api/whatsapp/send-test', async (req: Request, res: Response) => {
  const { phone, text, groupName } = req.body || {};
  if (!phone || !text) {
    res.status(400).json({ error: 'Informe o número/JID e a mensagem' });
    return;
  }
  const result = await whatsappManager.sendMessage(phone, text);
  if (!result.delivered) {
    res.status(400).json(result);
    return;
  }

  const targetJid = result.jid || phone;
  const isGroup = isGroupJid(targetJid);
  const digits = normalizeWhatsAppDigits(targetJid);
  let customer = findCustomerByContact(digits, targetJid, isGroup);
  if (!customer) {
    customer = {
      id: `cust-${Date.now()}`,
      name: isGroup ? groupName || `Grupo ${digits.slice(-4)}` : `Contato ${digits.slice(-4)}`,
      phone: digits,
      whatsappJid: targetJid,
      isGroup,
      groupName: isGroup ? groupName || `Grupo ${digits.slice(-4)}` : undefined,
      aiEnabled: true,
      status: 'em_atendimento',
      funnelStage: 'descoberta',
      dealValue: 0,
      tags: [isGroup ? 'whatsapp-grupo' : 'whatsapp-real'],
      notes: '',
      aiSummary: isGroup
        ? 'Mensagem inicial enviada ao grupo'
        : 'Mensagem inicial enviada manualmente',
      lastInteraction: new Date().toISOString(),
      nextAction: isGroup ? 'Aguardar interação no grupo' : 'Aguardar resposta no WhatsApp',
      followUpSent: false,
      createdAt: new Date().toISOString(),
    };
    customers.unshift(customer);
  } else {
    customer.lastInteraction = new Date().toISOString();
    if (targetJid) customer.whatsappJid = targetJid;
  }

  messages.push({
    id: `msg-out-${Date.now()}`,
    customerId: customer.id,
    sender: 'agent',
    text,
    timestamp: new Date().toISOString(),
    status: 'delivered',
  });

  saveStore();
  broadcastEvent('data_updated', { customerId: customer.id });

  res.json(result);
});

app.post('/api/reset-data', (req: Request, res: Response) => {
  customers = [];
  messages = [];
  followUpTasks = [];
  saveStore();
  broadcastEvent('data_updated', { reset: true });
  res.json({ success: true });
});

// Customers (Spreadsheet / CRM)
app.get('/api/customers', (req: Request, res: Response) => {
  res.json(customers);
});

app.post('/api/customers', (req: Request, res: Response) => {
  const rawJid: string | undefined = req.body.whatsappJid;
  const isGroup = Boolean(req.body.isGroup || isGroupJid(rawJid));
  const rawPhone = req.body.phone || rawJid || '5511900000000';
  const digits = normalizeWhatsAppDigits(rawPhone);
  const whatsappJid = rawJid || (isGroup ? `${digits}@g.us` : undefined);

  if (isGroup && whatsappJid) {
    const existingGroup = findCustomerByContact(digits, whatsappJid, true);
    if (existingGroup) {
      if (req.body.name) {
        existingGroup.name = req.body.name;
        existingGroup.groupName = req.body.name;
      }
      if (req.body.participantCount !== undefined) {
        existingGroup.participantCount = Number(req.body.participantCount);
      }
      saveStore();
      res.status(200).json(existingGroup);
      return;
    }
  }

  const newCustomer: Customer = {
    id: `cust-${Date.now()}`,
    name: req.body.name || (isGroup ? `Grupo ${digits.slice(-4)}` : 'Novo Cliente'),
    phone: digits,
    whatsappJid,
    isGroup,
    groupName: isGroup ? req.body.groupName || req.body.name : undefined,
    participantCount: req.body.participantCount ? Number(req.body.participantCount) : undefined,
    email: req.body.email || '',
    aiEnabled: req.body.aiEnabled !== undefined ? Boolean(req.body.aiEnabled) : true,
    status: req.body.status || 'novo',
    funnelStage: req.body.funnelStage || 'descoberta',
    dealValue: Number(req.body.dealValue) || 0,
    tags: req.body.tags || [isGroup ? 'whatsapp-grupo' : 'manual'],
    notes: req.body.notes || '',
    aiSummary:
      req.body.aiSummary ||
      (isGroup ? 'Grupo conectado ao atendimento ZapFlow' : 'Cadastrado manualmente'),
    productInterest: req.body.productInterest || '',
    lastInteraction: new Date().toISOString(),
    nextAction: req.body.nextAction || 'Primeiro contato',
    followUpSent: false,
    createdAt: new Date().toISOString(),
  };

  customers.unshift(newCustomer);
  saveStore();
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Cliente não encontrado' });
    return;
  }

  customers[idx] = {
    ...customers[idx],
    ...req.body,
    lastInteraction: req.body.lastInteraction || customers[idx].lastInteraction || new Date().toISOString(),
  };
  saveStore();
  broadcastEvent('data_updated', { customerId: customers[idx].id });
  res.json(customers[idx]);
});

app.delete('/api/customers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  customers = customers.filter((c) => c.id !== id);
  messages = messages.filter((m) => m.customerId !== id);
  followUpTasks = followUpTasks.filter((f) => f.customerId !== id);
  saveStore();
  res.json({ success: true });
});

// Messages
app.get('/api/messages/:customerId', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const filtered = messages.filter((m) => m.customerId === customerId);
  res.json(filtered);
});

// Chat Respond (Simulator & Real Human Outbound Agent Message)
app.post('/api/chat/respond', async (req: Request, res: Response) => {
  const { customerId, text, sender } = req.body;

  let customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    customer = {
      id: customerId || `cust-${Date.now()}`,
      name: 'Cliente WhatsApp',
      phone: '5511999990000',
      status: 'novo',
      funnelStage: 'descoberta',
      dealValue: 1000,
      tags: ['whatsapp'],
      notes: '',
      aiSummary: 'Conversa iniciada via WhatsApp',
      lastInteraction: new Date().toISOString(),
      nextAction: 'Qualificar lead',
      followUpSent: false,
      createdAt: new Date().toISOString(),
    };
    customers.unshift(customer);
  }

  // If sending as human agent & real WhatsApp is connected -> send directly to customer's real WhatsApp!
  if (sender === 'agent') {
    let realDelivery: { delivered: boolean; jid?: string; error?: string } = {
      delivered: false,
      error:
        whatsappManager.state.status !== 'connected'
          ? 'WhatsApp não conectado.'
          : undefined,
    };
    if (whatsappManager.state.status === 'connected') {
      realDelivery = await whatsappManager.sendMessage(
        customer.whatsappJid || customer.phone,
        text
      );
      if (realDelivery.jid && !customer.whatsappJid) {
        customer.whatsappJid = realDelivery.jid;
      }
    }

    const agentMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: customer.id,
      sender: 'agent',
      text,
      timestamp: new Date().toISOString(),
      status: realDelivery.delivered ? 'delivered' : 'sent',
    };
    messages.push(agentMsg);
    customer.lastInteraction = new Date().toISOString();
    saveStore();

    res.json({
      userMessage: agentMsg,
      botMessage: null,
      customer,
      realDelivery,
    });
    return;
  }

  // Simulator mode ("customer" speaking -> Gemini replies if AI is enabled for this specific customer)
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: customer.id,
    sender: 'customer',
    text,
    timestamp: new Date().toISOString(),
    status: 'read',
  };
  messages.push(userMsg);

  if (customer.followUpSent && !customer.csatRating) {
    const { rating, feedback } = parseFollowUpRating(text);
    if (rating) {
      customer.csatRating = rating;
      customer.csatFeedback = feedback;
      const task = followUpTasks.find((t) => t.customerId === customer?.id && t.status === 'sent');
      if (task) {
        task.status = 'replied';
        task.ratingReceived = rating;
        task.feedbackText = feedback;
      }
    }
  }

  if (!shouldAiReplyToCustomer(customer.aiEnabled, true)) {
    customer.lastInteraction = new Date().toISOString();
    saveStore();
    res.json({
      userMessage: userMsg,
      botMessage: null,
      customer,
      aiPausedForCustomer: true,
    });
    return;
  }

  const customerHistory = messages.filter((m) => m.customerId === customer!.id);
  const aiResult = await generateAiReply(text, customer, customerHistory, botConfig);

  const botMsg: ChatMessage = {
    id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: customer.id,
    sender: 'bot',
    text: aiResult.replyText,
    timestamp: new Date().toISOString(),
    status: 'delivered',
  };
  messages.push(botMsg);

  customer.lastInteraction = new Date().toISOString();
  if (aiResult.detectedStatus) customer.status = aiResult.detectedStatus as any;
  if (aiResult.detectedFunnel) customer.funnelStage = aiResult.detectedFunnel as any;
  if (aiResult.detectedProduct) customer.productInterest = aiResult.detectedProduct;
  if (aiResult.detectedSummary) customer.aiSummary = aiResult.detectedSummary;
  if (aiResult.detectedAction) customer.nextAction = aiResult.detectedAction;

  saveStore();

  res.json({
    userMessage: userMsg,
    botMessage: botMsg,
    customer,
    aiError: aiResult.aiError,
  });
});

// Follow-ups API
app.get('/api/followups', (req: Request, res: Response) => {
  const dayCheck = isFollowUpAllowedToday(
    botConfig.followUpBlockedDays,
    botConfig.followUpBlockedDates,
    botConfig.schedule?.timezone
  );
  res.json({
    tasks: followUpTasks,
    config: {
      delayHours: botConfig.followUpDelayHours,
      enabled: botConfig.autoFollowUpEnabled,
      template: botConfig.followUpMessageTemplate,
      blockedDays: botConfig.followUpBlockedDays || [],
      blockedDates: botConfig.followUpBlockedDates || [],
      blockedToday: !dayCheck.allowed,
      blockedReason: dayCheck.reason || null,
    },
  });
});

app.post('/api/followups/trigger-due', async (req: Request, res: Response) => {
  const dayCheck = isFollowUpAllowedToday(
    botConfig.followUpBlockedDays,
    botConfig.followUpBlockedDates,
    botConfig.schedule?.timezone
  );
  if (!dayCheck.allowed) {
    res.json({
      success: true,
      triggeredCount: 0,
      blocked: true,
      blockedReason: dayCheck.reason,
      tasks: [],
    });
    return;
  }

  const triggered = await runDueFollowUps(true);
  res.json({
    success: true,
    triggeredCount: triggered.length,
    blocked: false,
    tasks: triggered,
  });
});

app.post('/api/followups/simulate-time', (req: Request, res: Response) => {
  const { customerId, hours = 25 } = req.body;
  const targetCustomers = customerId
    ? customers.filter((c) => c.id === customerId)
    : customers;

  targetCustomers.forEach((c) => {
    const past = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    c.lastInteraction = past;
    c.followUpSent = false;
  });

  saveStore();
  res.json({
    success: true,
    message: `Horário de última interação recuado em ${hours} horas para simulação de follow-up.`,
    updatedCount: targetCustomers.length,
  });
});

app.post('/api/followups/send-test', async (req: Request, res: Response) => {
  const { customerId } = req.body;
  const cust = customers.find((c) => c.id === customerId);
  if (!cust) {
    res.status(404).json({ error: 'Cliente não encontrado' });
    return;
  }

  const now = new Date();
  const msgText = botConfig.followUpMessageTemplate
    .replace('{nome}', cust.name.split(' ')[0] || 'Cliente')
    .replace('{assunto}', cust.productInterest || 'nosso atendimento');

  let realDelivery: { delivered: boolean; error?: string } = { delivered: false };
  if (whatsappManager.state.status === 'connected') {
    realDelivery = await whatsappManager.sendMessage(
      cust.whatsappJid || cust.phone,
      msgText
    );
  }

  const task: FollowUpTask = {
    id: `fu-${Date.now()}`,
    customerId: cust.id,
    customerName: cust.name,
    phone: cust.phone,
    scheduledFor: now.toISOString(),
    sentAt: now.toISOString(),
    status: 'sent',
    messageText: msgText,
  };
  followUpTasks.unshift(task);

  messages.push({
    id: `msg-fu-${Date.now()}`,
    customerId: cust.id,
    sender: 'bot',
    text: msgText,
    timestamp: now.toISOString(),
    status: realDelivery.delivered ? 'delivered' : 'sent',
    isFollowUp: true,
  });

  cust.followUpSent = true;
  cust.followUpDate = now.toISOString();
  cust.status = 'aguardando_followup';
  saveStore();

  res.json({ success: true, task, realDelivery });
});

// WhatsApp Webhook (Meta Cloud API / Evolution API / Z-API)
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === whatsappManager.state.verifyToken) {
    res.status(200).send(challenge);
  } else if (mode === 'subscribe') {
    res.status(403).send('Verify token inválido');
  } else {
    res.status(200).json({
      status: 'active',
      message: 'Webhook ZapFlow pronto para receber mensagens reais',
      verifyToken: whatsappManager.state.verifyToken,
    });
  }
});

app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const parsed = parseWebhookPayload(req.body, { allowGroups: true });
    if (!parsed) {
      res.status(200).json({ status: 'ignored_non_text_or_self' });
      return;
    }

    const replyText = await handleIncomingWhatsAppMessage({
      phone: parsed.phone,
      senderName: parsed.isGroup ? undefined : parsed.senderName,
      text: parsed.text,
      replyJid: parsed.replyJid,
      isGroup: parsed.isGroup,
      groupName: parsed.groupName,
      participantCount: parsed.participantCount,
      participantName: parsed.isGroup ? parsed.senderName : undefined,
      participantPhone: parsed.participantPhone,
    });

    let delivered = false;
    if (replyText && whatsappManager.state.status === 'connected') {
      const sendRes = await whatsappManager.sendMessage(
        parsed.replyJid || parsed.phone,
        replyText
      );
      delivered = sendRes.delivered;
    }

    res.status(200).json({
      status: 'processed',
      source: parsed.source,
      isGroup: Boolean(parsed.isGroup),
      reply: replyText,
      delivered,
    });
  } catch (err: any) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Analytics Dashboard Endpoint
app.get('/api/analytics', (req: Request, res: Response) => {
  const summary = calculateAnalytics(customers, messages);
  res.json(summary);
});

// Vite Middleware for Full-stack Dev
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
