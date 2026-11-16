import React, { useState, useEffect } from 'react';
import {
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Star,
  RefreshCw,
  FastForward,
  Settings,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { Customer, FollowUpTask, BotConfig } from '../types/index.ts';
import { formatPhoneBR } from '../utils/crm-analytics.ts';
import { formatBlockedDaysSummary } from '../utils/schedule-utils.ts';

interface FollowUpManagerProps {
  customers: Customer[];
  botConfig: BotConfig;
  onRefreshData: () => void;
  onOpenChat: (customerId: string) => void;
  onOpenSettings?: () => void;
}

export const FollowUpManager: React.FC<FollowUpManagerProps> = ({
  customers,
  botConfig,
  onRefreshData,
  onOpenChat,
  onOpenSettings,
}) => {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Template editor
  const [templateText, setTemplateText] = useState(botConfig.followUpMessageTemplate);
  const [delayHours, setDelayHours] = useState(botConfig.followUpDelayHours || 24);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    setTemplateText(botConfig.followUpMessageTemplate);
    setDelayHours(botConfig.followUpDelayHours || 24);
  }, [botConfig.followUpMessageTemplate, botConfig.followUpDelayHours]);

  useEffect(() => {
    fetchFollowUps();
  }, []);

  const fetchFollowUps = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/followups');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error fetching follow-ups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerDue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/followups/trigger-due', {
        method: 'POST',
      });
      const data = await res.json();
      setFeedbackSuccess(
        data.blocked
          ? 'Envio automático bloqueado hoje pela configuração de dias sem follow-up. Ajuste em "Modelo de Configurações" se desejar liberar.'
          : data.triggeredCount > 0
          ? `Sucesso: ${data.triggeredCount} mensagem(ns) de follow-up enviada(s)!`
          : 'Nenhum cliente com 24h pendentes neste momento. Use o botão "Simular 24h" abaixo para testar!'
      );
      fetchFollowUps();
      onRefreshData();
    } catch (err) {
      console.error('Error triggering follow-ups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateTime = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/followups/simulate-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 25 }),
      });
      const data = await res.json();
      setFeedbackSuccess('Tempo avançado em 25 horas! Agora clique em "Disparar Fila" para testar o envio.');
      fetchFollowUps();
      onRefreshData();
    } catch (err) {
      console.error('Error simulating time:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestToCustomer = async (customerId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/followups/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (res.ok) {
        setFeedbackSuccess('Follow-up de teste enviado com sucesso!');
        fetchFollowUps();
        onRefreshData();
      }
    } catch (err) {
      console.error('Error sending test follow-up:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingConfig(true);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpMessageTemplate: templateText,
          followUpDelayHours: Number(delayHours),
        }),
      });
      if (res.ok) {
        setFeedbackSuccess('Configurações de follow-up salvas com sucesso!');
        onRefreshData();
      }
    } catch (err) {
      console.error('Error saving follow-up settings:', err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-purple-600" />
            Automação de Follow-up (1 Dia Depois / 24h)
          </h2>
          <p className="text-sm text-slate-500">
            Envio automático de mensagem 24h após o atendimento para colher avaliação de satisfação (CSAT).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateTime}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-xs transition-colors"
            title="Avança a data da última conversa dos clientes em 25h para simular o vencimento"
          >
            <FastForward className="w-4 h-4 text-purple-600" />
            Simular Passagem de 24h
          </button>

          <button
            onClick={handleTriggerDue}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-xs transition-colors"
          >
            <Send className="w-4 h-4" />
            Disparar Fila Vencida (24h)
          </button>
        </div>
      </div>

      {feedbackSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            onClick={() => setFeedbackSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Rules & Template Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-600" />
                Regra e Mensagem de Follow-up
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatBlockedDaysSummary(
                  botConfig.followUpBlockedDays,
                  botConfig.followUpBlockedDates
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                >
                  Configurar dias bloqueados
                </button>
              )}
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  botConfig.autoFollowUpEnabled !== false
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {botConfig.autoFollowUpEnabled !== false ? 'Ativo Automático' : 'Desativado'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempo de Espera (Horas)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
                <span className="text-xs text-slate-500 shrink-0">horas (1 dia = 24h)</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Variáveis disponíveis:
              </label>
              <div className="flex gap-2">
                <code className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-emerald-800 border border-slate-200">
                  {'{nome}'}
                </code>
                <code className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-emerald-800 border border-slate-200">
                  {'{assunto}'}
                </code>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Template da Mensagem no WhatsApp:
            </label>
            <textarea
              rows={3}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400">
              Quando o cliente responder com uma nota (1 a 5 ou estrelas ⭐), a planilha e o dashboard são atualizados na hora.
            </span>
            <button
              onClick={handleSaveSettings}
              disabled={isSavingConfig}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
            >
              {isSavingConfig ? 'Salvando...' : 'Salvar Regra'}
            </button>
          </div>
        </div>

        {/* Quick Send Card */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 p-5 rounded-xl border border-purple-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-purple-950 flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Disparo Individual Imediato
            </h3>
            <p className="text-xs text-purple-900/80 mb-4">
              Envie agora um follow-up de teste para qualquer cliente da sua carteira para ver a reação.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {customers.filter((c) => !c.isGroup).length === 0 ? (
                <div className="bg-white/80 p-3 rounded-lg border border-purple-100 text-xs text-purple-900/70 text-center">
                  Nenhum cliente individual registrado ainda. Os contatos aparecerão aqui conforme o WhatsApp receber atendimentos.
                </div>
              ) : (
                customers
                  .filter((c) => !c.isGroup)
                  .slice(0, 4)
                  .map((c) => (
                  <div
                    key={c.id}
                    className="bg-white/90 p-2.5 rounded-lg border border-purple-100 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-slate-800 block truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatPhoneBR(c.phone)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleSendTestToCustomer(c.id)}
                      className="shrink-0 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold rounded transition-colors"
                    >
                      Enviar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-[11px] text-purple-800 mt-3 pt-2 border-t border-purple-200/50">
            A mensagem cai direto na conversa do WhatsApp e atualiza a satisfação se respondida.
          </p>
        </div>
      </div>

      {/* Follow-up Queue / History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">
            Histórico e Fila de Follow-up 24h
          </h3>
          <button
            onClick={fetchFollowUps}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Cliente</th>
                <th className="py-2.5 px-4">WhatsApp</th>
                <th className="py-2.5 px-4">Status do Disparo</th>
                <th className="py-2.5 px-4">Mensagem Enviada</th>
                <th className="py-2.5 px-4">Nota CSAT (1-5)</th>
                <th className="py-2.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Nenhum registro de follow-up ainda.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {task.customerName}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {formatPhoneBR(task.phone)}
                    </td>
                    <td className="py-3 px-4">
                      {task.status === 'replied' ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800">
                          Respondido ✓
                        </span>
                      ) : task.status === 'sent' ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 text-blue-800">
                          Enviado (Aguardando)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-800">
                          Agendado (Pendente)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-sm text-slate-600 truncate" title={task.messageText}>
                      {task.messageText}
                    </td>
                    <td className="py-3 px-4">
                      {task.ratingReceived ? (
                        <div className="flex items-center gap-1 font-bold text-amber-500">
                          {'★'.repeat(task.ratingReceived)}
                          <span className="text-slate-600 text-[11px]">({task.ratingReceived}/5)</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onOpenChat(task.customerId)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Ver Chat
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
