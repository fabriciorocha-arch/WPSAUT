import { Customer, ChatMessage, AnalyticsSummary, FunnelStage, CustomerStatus } from '../types/index.ts';

export function calculateAnalytics(
  customers: Customer[],
  messages: ChatMessage[]
): AnalyticsSummary {
  const totalLeads = customers.length;
  if (totalLeads === 0) {
    return {
      totalLeads: 0,
      activeConversations: 0,
      convertedCount: 0,
      conversionRate: 0,
      totalDealValue: 0,
      averageCsat: 0,
      totalFollowUpsSent: 0,
      averageResponseTimeSeconds: 1.8,
      stageDistribution: {
        descoberta: 0,
        qualificacao: 0,
        proposta: 0,
        fechamento: 0,
        pos_venda: 0,
      },
      statusDistribution: {
        novo: 0,
        em_atendimento: 0,
        interessado: 0,
        aguardando_followup: 0,
        convertido: 0,
        perdido: 0,
      },
      dailyMessages: [],
    };
  }

  const convertedCustomers = customers.filter((c) => c.status === 'convertido');
  const convertedCount = convertedCustomers.length;
  const conversionRate = totalLeads > 0 ? (convertedCount / totalLeads) * 100 : 0;

  const totalDealValue = convertedCustomers.reduce((acc, c) => acc + (c.dealValue || 0), 0);

  const ratedCustomers = customers.filter((c) => typeof c.csatRating === 'number' && c.csatRating > 0);
  const averageCsat =
    ratedCustomers.length > 0
      ? ratedCustomers.reduce((acc, c) => acc + (c.csatRating || 0), 0) / ratedCustomers.length
      : 0;

  const totalFollowUpsSent = customers.filter((c) => c.followUpSent).length;
  const activeConversations = customers.filter(
    (c) => c.status === 'em_atendimento' || c.status === 'interessado' || c.status === 'novo'
  ).length;

  const stageDistribution: Record<FunnelStage, number> = {
    descoberta: 0,
    qualificacao: 0,
    proposta: 0,
    fechamento: 0,
    pos_venda: 0,
  };

  const statusDistribution: Record<CustomerStatus, number> = {
    novo: 0,
    em_atendimento: 0,
    interessado: 0,
    aguardando_followup: 0,
    convertido: 0,
    perdido: 0,
  };

  customers.forEach((c) => {
    if (stageDistribution[c.funnelStage] !== undefined) {
      stageDistribution[c.funnelStage]++;
    }
    if (statusDistribution[c.status] !== undefined) {
      statusDistribution[c.status]++;
    }
  });

  // Calculate daily messages trend
  const dailyMap = new Map<string, { customerCount: number; botCount: number; conversions: number }>();
  
  messages.forEach((msg) => {
    const day = msg.timestamp.slice(0, 10);
    const curr = dailyMap.get(day) || { customerCount: 0, botCount: 0, conversions: 0 };
    if (msg.sender === 'customer') {
      curr.customerCount++;
    } else if (msg.sender === 'bot') {
      curr.botCount++;
    }
    dailyMap.set(day, curr);
  });

  // Add conversion counts to daily
  convertedCustomers.forEach((c) => {
    const day = c.lastInteraction.slice(0, 10);
    const curr = dailyMap.get(day) || { customerCount: 0, botCount: 0, conversions: 0 };
    curr.conversions++;
    dailyMap.set(day, curr);
  });

  const dailyMessages = Array.from(dailyMap.entries())
    .map(([date, counts]) => ({
      date,
      ...counts,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalLeads,
    activeConversations,
    convertedCount,
    conversionRate: Math.round(conversionRate * 10) / 10,
    totalDealValue,
    averageCsat: Math.round(averageCsat * 10) / 10,
    totalFollowUpsSent,
    averageResponseTimeSeconds: 1.8,
    stageDistribution,
    statusDistribution,
    dailyMessages,
  };
}

export function isFollowUpDue(
  lastInteractionISO: string,
  hoursThreshold: number,
  followUpSent: boolean,
  status: CustomerStatus,
  nowISO?: string
): boolean {
  if (followUpSent) return false;
  if (status === 'perdido') return false;

  const now = nowISO ? new Date(nowISO).getTime() : Date.now();
  const lastTime = new Date(lastInteractionISO).getTime();
  if (isNaN(lastTime)) return false;

  const diffHours = (now - lastTime) / (1000 * 60 * 60);
  return diffHours >= hoursThreshold;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatPhoneBR(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return rawPhone;
}

export function parseFollowUpRating(text: string): { rating?: number; feedback: string } {
  const clean = text.trim();
  // Check for 1 to 5 number or star count
  const starCount = (clean.match(/⭐/g) || []).length;
  if (starCount >= 1 && starCount <= 5) {
    return { rating: starCount, feedback: clean.replace(/⭐/g, '').trim() };
  }

  const numMatch = clean.match(/\b([1-5])(\/5)?(\s*estrelas?|\s*pontos?)?\b/i);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    return { rating: val, feedback: clean };
  }

  // Sentiment fallback
  const lower = clean.toLowerCase();
  if (lower.includes('excelente') || lower.includes('otimo') || lower.includes('ótimo') || lower.includes('perfeito')) {
    return { rating: 5, feedback: clean };
  }
  if (lower.includes('bom') || lower.includes('gostei') || lower.includes('satisfeito')) {
    return { rating: 4, feedback: clean };
  }
  if (lower.includes('regular') || lower.includes('mais ou menos')) {
    return { rating: 3, feedback: clean };
  }
  if (lower.includes('ruim') || lower.includes('demorou') || lower.includes('pessimo') || lower.includes('péssimo')) {
    return { rating: 1, feedback: clean };
  }

  return { rating: undefined, feedback: clean };
}

export function generateCustomersCSV(customers: Customer[]): string {
  const headers = [
    'ID',
    'Nome',
    'WhatsApp / Telefone',
    'Email',
    'Status',
    'Etapa do Funil',
    'Valor Potencial (R$)',
    'Satisfação CSAT (1-5)',
    'Interesse / Produto',
    'Resumo IA',
    'Próxima Ação',
    'Follow-up Enviado',
    'Última Interação',
    'Data de Cadastro',
  ];

  const escapeCSV = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = customers.map((c) => [
    escapeCSV(c.id),
    escapeCSV(c.name),
    escapeCSV(c.phone),
    escapeCSV(c.email || ''),
    escapeCSV(c.status),
    escapeCSV(c.funnelStage),
    escapeCSV(c.dealValue),
    escapeCSV(c.csatRating ? `${c.csatRating}/5` : 'Não avaliado'),
    escapeCSV(c.productInterest || ''),
    escapeCSV(c.aiSummary),
    escapeCSV(c.nextAction),
    escapeCSV(c.followUpSent ? 'Sim' : 'Não'),
    escapeCSV(new Date(c.lastInteraction).toLocaleString('pt-BR')),
    escapeCSV(new Date(c.createdAt).toLocaleDateString('pt-BR')),
  ]);

  // UTF-8 BOM for Excel
  const bom = '\uFEFF';
  return bom + [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}
