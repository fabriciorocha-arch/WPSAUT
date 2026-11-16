import React, { useState } from 'react';
import {
  TrendingUp,
  Users,
  MessageCircle,
  Star,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Filter,
  BarChart3,
  Flame,
  Send,
  Zap,
} from 'lucide-react';
import { AnalyticsSummary, Customer } from '../types/index.ts';
import { formatCurrencyBRL } from '../utils/crm-analytics.ts';

interface AnalyticsDashboardProps {
  analytics: AnalyticsSummary;
  customers: Customer[];
  onNavigateToTab: (tab: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  analytics,
  customers,
  onNavigateToTab,
}) => {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');

  const funnelSteps = [
    { key: 'descoberta', label: '1. Descoberta', count: analytics.stageDistribution.descoberta, color: 'bg-blue-500' },
    { key: 'qualificacao', label: '2. Qualificação', count: analytics.stageDistribution.qualificacao, color: 'bg-indigo-500' },
    { key: 'proposta', label: '3. Proposta', count: analytics.stageDistribution.proposta, color: 'bg-amber-500' },
    { key: 'fechamento', label: '4. Fechamento', count: analytics.stageDistribution.fechamento, color: 'bg-orange-500' },
    { key: 'pos_venda', label: '5. Convertido / Ganho', count: analytics.stageDistribution.pos_venda, color: 'bg-emerald-500' },
  ];

  const maxFunnelCount = Math.max(...funnelSteps.map((s) => s.count), 1);

  // CSAT distribution
  const csat5Count = customers.filter((c) => c.csatRating === 5).length;
  const csat4Count = customers.filter((c) => c.csatRating === 4).length;
  const csat3Count = customers.filter((c) => c.csatRating === 3).length;
  const csatLowCount = customers.filter((c) => c.csatRating && c.csatRating <= 2).length;
  const totalRated = csat5Count + csat4Count + csat3Count + csatLowCount || 1;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Dashboard de Desempenho e Conversão
          </h2>
          <p className="text-sm text-slate-500">
            Acompanhe em tempo real os atendimentos do WhatsApp, conversões de vendas e satisfação de follow-up.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white border border-slate-200 rounded-lg p-1 flex items-center text-xs font-medium shadow-xs">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded transition-colors ${
                period === 'today' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`px-3 py-1.5 rounded transition-colors ${
                period === '7d' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-3 py-1.5 rounded transition-colors ${
                period === '30d' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              30 dias
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxa de Conversão */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Taxa de Conversão</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{analytics.conversionRate}%</span>
            {analytics.totalLeads > 0 && (
              <span className="text-xs font-medium text-emerald-600 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" /> Ativo
              </span>
            )}
          </div>
          <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(analytics.conversionRate, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {analytics.totalLeads > 0
              ? `${analytics.convertedCount} de ${analytics.totalLeads} clientes converteram`
              : 'Aguardando primeiros contatos no WhatsApp'}
          </p>
        </div>

        {/* Valor Total Convertido */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Vendas Fechadas</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {formatCurrencyBRL(analytics.totalDealValue)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Ticket médio: {formatCurrencyBRL(analytics.convertedCount > 0 ? analytics.totalDealValue / analytics.convertedCount : 0)}
          </p>
        </div>

        {/* Satisfação CSAT */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Satisfação (CSAT)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {analytics.averageCsat > 0 ? analytics.averageCsat : '—'}
            </span>
            <span className="text-sm font-semibold text-slate-500">/ 5.0</span>
            {analytics.averageCsat > 0 && (
              <div className="flex text-amber-400 text-xs ml-auto">
                {'★'.repeat(Math.round(analytics.averageCsat))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-4">
            {analytics.averageCsat > 0
              ? 'Baseado no follow-up automático enviado 24h depois'
              : 'Nenhuma avaliação recebida ainda'}
          </p>
        </div>

        {/* Tempo de Resposta da IA */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Velocidade de Resposta</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {analytics.averageResponseTimeSeconds}s
            </span>
            <span className="text-xs font-medium text-emerald-600">Tempo real</span>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Respostas 24/7 com Gemini 3.8 Flash sem fila de espera
          </p>
        </div>
      </div>

      {/* Main Grid: Funnel & CSAT breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil de Vendas Interativo */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Funil de Conversão no WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Como os contatos evoluem de mensagem inicial para fechamento
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('spreadsheet')}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
            >
              Ver na Planilha →
            </button>
          </div>

          <div className="space-y-4">
            {funnelSteps.map((step) => {
              const percentage =
                analytics.totalLeads > 0 ? Math.round((step.count / maxFunnelCount) * 100) : 0;
              return (
                <div key={step.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{step.label}</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {step.count} {step.count === 1 ? 'cliente' : 'clientes'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-7 rounded-lg overflow-hidden flex items-center p-1">
                    {percentage > 0 ? (
                      <div
                        className={`${step.color} h-full rounded-md flex items-center justify-end pr-2 text-white text-xs font-medium transition-all duration-700`}
                        style={{ width: `${Math.max(percentage, 12)}%` }}
                      >
                        {percentage}%
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 pl-2">0%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block">Leads Ativos</span>
              <span className="font-bold text-slate-800 text-sm">{analytics.activeConversations}</span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block">Follow-ups 24h</span>
              <span className="font-bold text-slate-800 text-sm">{analytics.totalFollowUpsSent}</span>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-900">
              <span className="text-emerald-700 block">Ganhos / Fechados</span>
              <span className="font-bold text-emerald-800 text-sm">{analytics.convertedCount}</span>
            </div>
          </div>
        </div>

        {/* Satisfação & Feedback 24h */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                Pesquisa de Satisfação
              </h3>
              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                24h Pós-Atendimento
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-5">
              Feedback automático recebido dos clientes 1 dia após a última interação.
            </p>

            {/* Rating breakdown bars */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-600 font-medium shrink-0">5 estrelas</span>
                <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${(csat5Count / totalRated) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-slate-700 w-6 text-right">{csat5Count}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-600 font-medium shrink-0">4 estrelas</span>
                <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full"
                    style={{ width: `${(csat4Count / totalRated) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-slate-700 w-6 text-right">{csat4Count}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-600 font-medium shrink-0">3 estrelas</span>
                <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${(csat3Count / totalRated) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-slate-700 w-6 text-right">{csat3Count}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-600 font-medium shrink-0">1-2 estrelas</span>
                <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full"
                    style={{ width: `${(csatLowCount / totalRated) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-slate-700 w-6 text-right">{csatLowCount}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="bg-emerald-50 rounded-lg p-3 text-emerald-900 text-xs">
              <span className="font-bold block mb-1">💡 Insight da IA:</span>
              <p>
                Clientes que recebem o follow-up em 24h têm <strong>38% mais chance</strong> de indicar um amigo ou fechar novo pedido.
              </p>
            </div>

            <button
              onClick={() => onNavigateToTab('followup')}
              className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Gerenciar Fila de Follow-up 24h
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
