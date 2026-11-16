export type CustomerStatus =
  | 'novo'
  | 'em_atendimento'
  | 'interessado'
  | 'aguardando_followup'
  | 'convertido'
  | 'perdido';

export type FunnelStage = 'descoberta' | 'qualificacao' | 'proposta' | 'fechamento' | 'pos_venda';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsappJid?: string;
  isGroup?: boolean;
  groupName?: string;
  participantCount?: number;
  email?: string;
  avatar?: string;
  status: CustomerStatus;
  funnelStage: FunnelStage;
  dealValue: number;
  aiEnabled?: boolean; // true by default; false pauses AI auto-reply for this specific customer/group only
  csatRating?: number; // 1 to 5
  csatFeedback?: string;
  tags: string[];
  notes: string;
  aiSummary: string;
  productInterest?: string;
  lastInteraction: string; // ISO date
  nextAction: string;
  followUpSent: boolean;
  followUpDate?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  customerId: string;
  sender: 'customer' | 'bot' | 'agent' | 'system';
  text: string;
  timestamp: string; // ISO date
  status: 'sent' | 'delivered' | 'read';
  isFollowUp?: boolean;
  participantName?: string;
  participantPhone?: string;
}

export interface WhatsAppGroupInfo {
  jid: string;
  name: string;
  participantCount: number;
  aiEnabled: boolean;
  registeredInCrm?: boolean;
  customerId?: string;
}

export type WhatsAppProviderMode = 'baileys_qr' | 'meta_cloud' | 'evolution_api';

export type WhatsAppConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error';

export interface MetaCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
}

export interface EvolutionApiConfig {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
}

export interface WhatsAppConnectionState {
  provider: WhatsAppProviderMode;
  status: WhatsAppConnectionStatus;
  qrCodeDataUrl?: string | null;
  pairingCode?: string | null;
  connectedPhone?: string;
  connectedName?: string;
  lastError?: string | null;
  webhookUrl: string;
  verifyToken: string;
  metaConfig: MetaCloudConfig;
  evolutionConfig: EvolutionApiConfig;
  autoReplyEnabled: boolean;
  groupAutoReplyEnabled: boolean;
  groupMentionOnly: boolean;
}

export interface BotScheduleSettings {
  enabled: boolean;
  activeDays: number[]; // 0 = Domingo, 1 = Segunda ... 6 = Sábado
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string; // IANA timezone, default America/Sao_Paulo
  sendOffHoursMessage?: boolean;
  offHoursMessage?: string;
}

export interface BotConfig {
  name: string;
  persona: string;
  niche: 'varejo' | 'servicos' | 'saude' | 'imobiliaria' | 'geral';
  systemPrompt: string;
  welcomeMessage: string;
  followUpDelayHours: number;
  followUpMessageTemplate: string;
  autoFollowUpEnabled: boolean;
  followUpBlockedDays?: number[]; // Dias da semana (0-6) em que o follow-up 24h NÃO deve ser enviado
  followUpBlockedDates?: string[]; // Datas específicas (YYYY-MM-DD) bloqueadas para follow-up 24h
  schedule?: BotScheduleSettings;
  qualificationCriteria: string;
  phoneConnected: string;
  isConnected: boolean;
}

export interface FollowUpTask {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  scheduledFor: string;
  sentAt?: string;
  status: 'pending' | 'sent' | 'replied' | 'cancelled';
  ratingReceived?: number;
  feedbackText?: string;
  messageText: string;
}

export interface AnalyticsSummary {
  totalLeads: number;
  activeConversations: number;
  convertedCount: number;
  conversionRate: number;
  totalDealValue: number;
  averageCsat: number;
  totalFollowUpsSent: number;
  averageResponseTimeSeconds: number;
  stageDistribution: Record<FunnelStage, number>;
  statusDistribution: Record<CustomerStatus, number>;
  dailyMessages: { date: string; customerCount: number; botCount: number; conversions: number }[];
}
