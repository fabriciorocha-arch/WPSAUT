import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAnalytics,
  isFollowUpDue,
  formatPhoneBR,
  formatCurrencyBRL,
  parseFollowUpRating,
  generateCustomersCSV,
} from './crm-analytics.ts';
import { Customer, ChatMessage } from '../types/index.ts';

const mockCustomers: Customer[] = [
  {
    id: 'c1',
    name: 'Carlos Oliveira',
    phone: '5511999991111',
    email: 'carlos@exemplo.com',
    status: 'convertido',
    funnelStage: 'pos_venda',
    dealValue: 1250,
    csatRating: 5,
    csatFeedback: 'Excelente atendimento!',
    tags: ['vip', 'fechado'],
    notes: 'Cliente comprou plano anual',
    aiSummary: 'Interessado em automação WhatsApp empresarial',
    productInterest: 'Plano Pro Anual',
    lastInteraction: '2026-11-10T10:00:00.000Z',
    nextAction: 'Onboarding agendado',
    followUpSent: true,
    createdAt: '2026-11-09T08:00:00.000Z',
  },
  {
    id: 'c2',
    name: 'Mariana Santos',
    phone: '5521988882222',
    status: 'em_atendimento',
    funnelStage: 'qualificacao',
    dealValue: 500,
    csatRating: 4,
    tags: ['quente'],
    notes: 'Tirando dúvidas sobre preço',
    aiSummary: 'Dúvidas sobre integração com ERP',
    productInterest: 'Plano Básico',
    lastInteraction: '2026-11-11T12:00:00.000Z',
    nextAction: 'Enviar proposta comercial',
    followUpSent: false,
    createdAt: '2026-11-10T09:00:00.000Z',
  },
  {
    id: 'c3',
    name: 'Roberto Silva',
    phone: '5531977773333',
    status: 'perdido',
    funnelStage: 'descoberta',
    dealValue: 0,
    tags: ['sem-orcamento'],
    notes: 'Sem verba no momento',
    aiSummary: 'Procurava solução gratuita',
    lastInteraction: '2026-11-08T15:00:00.000Z',
    nextAction: 'Nenhuma',
    followUpSent: false,
    createdAt: '2026-11-08T14:00:00.000Z',
  },
];

const mockMessages: ChatMessage[] = [
  {
    id: 'm1',
    customerId: 'c1',
    sender: 'customer',
    text: 'Olá, gostaria de saber os planos',
    timestamp: '2026-11-10T10:00:00.000Z',
    status: 'read',
  },
  {
    id: 'm2',
    customerId: 'c1',
    sender: 'bot',
    text: 'Olá Carlos! Temos o plano Básico e o Pro.',
    timestamp: '2026-11-10T10:00:02.000Z',
    status: 'read',
  },
];

test('calculateAnalytics calculates conversion rate, deal values, and CSAT correctly', () => {
  const result = calculateAnalytics(mockCustomers, mockMessages);
  assert.equal(result.totalLeads, 3);
  assert.equal(result.convertedCount, 1);
  // 1/3 is 33.3%
  assert.equal(result.conversionRate, 33.3);
  assert.equal(result.totalDealValue, 1250);
  // 5 and 4 rated -> average is 4.5
  assert.equal(result.averageCsat, 4.5);
  assert.equal(result.totalFollowUpsSent, 1);
  assert.equal(result.stageDistribution.pos_venda, 1);
  assert.equal(result.stageDistribution.qualificacao, 1);
  assert.equal(result.statusDistribution.convertido, 1);
  assert.equal(result.statusDistribution.perdido, 1);
});

test('calculateAnalytics handles empty customers safely', () => {
  const result = calculateAnalytics([], []);
  assert.equal(result.totalLeads, 0);
  assert.equal(result.conversionRate, 0);
  assert.equal(result.totalDealValue, 0);
  assert.equal(result.averageCsat, 0);
});

test('isFollowUpDue detects 24h threshold correctly', () => {
  const now = '2026-11-12T12:00:00.000Z';

  // Last interaction 24h+ ago (48h ago), not sent, not lost -> due
  const due = isFollowUpDue('2026-11-10T12:00:00.000Z', 24, false, 'em_atendimento', now);
  assert.equal(due, true);

  // Already sent -> false
  const alreadySent = isFollowUpDue('2026-11-10T12:00:00.000Z', 24, true, 'em_atendimento', now);
  assert.equal(alreadySent, false);

  // Lost client -> false
  const lost = isFollowUpDue('2026-11-10T12:00:00.000Z', 24, false, 'perdido', now);
  assert.equal(lost, false);

  // Only 2 hours ago -> false
  const recent = isFollowUpDue('2026-11-12T10:00:00.000Z', 24, false, 'em_atendimento', now);
  assert.equal(recent, false);
});

test('formatPhoneBR formats Brazilian phone numbers appropriately', () => {
  const formatted = formatPhoneBR('5511999998888');
  assert.equal(formatted, '+55 (11) 99999-8888');
});

test('parseFollowUpRating extracts ratings and stars', () => {
  assert.equal(parseFollowUpRating('5').rating, 5);
  assert.equal(parseFollowUpRating('⭐⭐⭐⭐⭐').rating, 5);
  assert.equal(parseFollowUpRating('Nota 4, gostei bastante').rating, 4);
  assert.equal(parseFollowUpRating('Excelente serviço').rating, 5);
  assert.equal(parseFollowUpRating('Achei muito ruim o atraso').rating, 1);
});

test('generateCustomersCSV produces valid CSV with headers and rows', () => {
  const csv = generateCustomersCSV(mockCustomers);
  assert.ok(csv.startsWith('\uFEFF"ID","Nome","WhatsApp / Telefone"'));
  assert.ok(csv.includes('Carlos Oliveira'));
  assert.ok(csv.includes('Mariana Santos'));
});
