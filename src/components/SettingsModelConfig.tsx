import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Users,
  Clock,
  CalendarOff,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Bot,
  MessageSquareOff,
  ChevronDown,
  Cpu,
  RotateCcw,
  KeyRound,
  Link2,
  FlaskConical,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  AiEngineSettings,
  AiProviderType,
  BotConfig,
  BotScheduleSettings,
  WhatsAppConnectionState,
} from '../types/index.ts';
import {
  WEEKDAY_OPTIONS,
  TIMEZONE_OPTIONS,
  DEFAULT_BOT_SCHEDULE,
  formatScheduleSummary,
  formatBlockedDaysSummary,
} from '../utils/schedule-utils.ts';
import {
  AI_PROVIDER_CATALOG,
  DEFAULT_AI_ENGINE,
  normalizeAiEngine,
} from '../utils/ai-engine-utils.ts';

interface SettingsModelConfigProps {
  botConfig: BotConfig;
  connectionState: WhatsAppConnectionState;
  onRefreshData: () => void;
  onRefreshConnection: () => void;
}

export const SettingsModelConfig: React.FC<SettingsModelConfigProps> = ({
  botConfig,
  connectionState,
  onRefreshData,
  onRefreshConnection,
}) => {
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(connectionState.autoReplyEnabled);
  const [groupAutoReplyEnabled, setGroupAutoReplyEnabled] = useState(
    connectionState.groupAutoReplyEnabled
  );
  const [groupMentionOnly, setGroupMentionOnly] = useState(connectionState.groupMentionOnly);

  const [schedule, setSchedule] = useState<BotScheduleSettings>({
    ...DEFAULT_BOT_SCHEDULE,
    ...(botConfig.schedule || {}),
  });

  const [autoFollowUpEnabled, setAutoFollowUpEnabled] = useState(
    botConfig.autoFollowUpEnabled !== false
  );
  const [followUpDelayHours, setFollowUpDelayHours] = useState(
    botConfig.followUpDelayHours || 24
  );
  const [followUpMessageTemplate, setFollowUpMessageTemplate] = useState(
    botConfig.followUpMessageTemplate || ''
  );
  const [followUpBlockedDays, setFollowUpBlockedDays] = useState<number[]>(
    Array.isArray(botConfig.followUpBlockedDays) ? botConfig.followUpBlockedDays : []
  );
  const [followUpBlockedDates, setFollowUpBlockedDates] = useState<string[]>(
    Array.isArray(botConfig.followUpBlockedDates) ? botConfig.followUpBlockedDates : []
  );
  const [newBlockedDate, setNewBlockedDate] = useState('');

  // Discreet advanced AI engine state (collapsed by default)
  const [aiEngine, setAiEngine] = useState<AiEngineSettings>(
    normalizeAiEngine(botConfig.aiEngine)
  );
  const [draftApiKeyInput, setDraftApiKeyInput] = useState('');
  const [clearCustomApiKey, setClearCustomApiKey] = useState(false);
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  const [useCustomModelInput, setUseCustomModelInput] = useState(false);
  const [providerEnvStatus, setProviderEnvStatus] = useState<Record<string, boolean> | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    message: string;
    replyText?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setAutoReplyEnabled(connectionState.autoReplyEnabled);
    setGroupAutoReplyEnabled(connectionState.groupAutoReplyEnabled);
    setGroupMentionOnly(connectionState.groupMentionOnly);
  }, [
    connectionState.autoReplyEnabled,
    connectionState.groupAutoReplyEnabled,
    connectionState.groupMentionOnly,
  ]);

  useEffect(() => {
    setSchedule({
      ...DEFAULT_BOT_SCHEDULE,
      ...(botConfig.schedule || {}),
    });
    setAutoFollowUpEnabled(botConfig.autoFollowUpEnabled !== false);
    setFollowUpDelayHours(botConfig.followUpDelayHours || 24);
    setFollowUpMessageTemplate(botConfig.followUpMessageTemplate || '');
    setFollowUpBlockedDays(
      Array.isArray(botConfig.followUpBlockedDays) ? botConfig.followUpBlockedDays : []
    );
    setFollowUpBlockedDates(
      Array.isArray(botConfig.followUpBlockedDates) ? botConfig.followUpBlockedDates : []
    );
    const normalizedEngine = normalizeAiEngine(botConfig.aiEngine);
    setAiEngine({
      ...normalizedEngine,
      hasCustomApiKey: botConfig.aiEngine?.hasCustomApiKey,
      customApiKeyMasked: botConfig.aiEngine?.customApiKeyMasked,
    });
    setDraftApiKeyInput('');
    setClearCustomApiKey(false);
    const catalog = AI_PROVIDER_CATALOG.find((p) => p.id === normalizedEngine.provider);
    setUseCustomModelInput(
      Boolean(catalog && !catalog.models.some((m) => m.id === normalizedEngine.model))
    );
  }, [botConfig]);

  useEffect(() => {
    if (!showAdvancedAi) return;
    fetch('/api/ai/providers-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setProviderEnvStatus(data);
      })
      .catch(() => {
        // ignore status probe error
      });
  }, [showAdvancedAi, botConfig.aiEngine]);

  const handleProviderChange = (nextProvider: AiProviderType) => {
    const entry = AI_PROVIDER_CATALOG.find((p) => p.id === nextProvider);
    setUseCustomModelInput(false);
    setDraftApiKeyInput('');
    setClearCustomApiKey(false);
    setAiTestResult(null);
    setAiEngine({
      provider: nextProvider,
      model: entry?.defaultModel || DEFAULT_AI_ENGINE.model,
      ...(nextProvider !== 'gemini' && entry?.defaultBaseUrl
        ? { customBaseUrl: entry.defaultBaseUrl }
        : {}),
      ...(botConfig.aiEngine?.provider === nextProvider
        ? {
            hasCustomApiKey: botConfig.aiEngine?.hasCustomApiKey,
            customApiKeyMasked: botConfig.aiEngine?.customApiKeyMasked,
          }
        : {}),
    });
  };

  const toggleScheduleDay = (dayVal: number) => {
    setSchedule((prev) => {
      const exists = prev.activeDays.includes(dayVal);
      const nextDays = exists
        ? prev.activeDays.filter((d) => d !== dayVal)
        : [...prev.activeDays, dayVal].sort((a, b) => a - b);
      return { ...prev, activeDays: nextDays };
    });
  };

  const toggleBlockedFollowUpDay = (dayVal: number) => {
    setFollowUpBlockedDays((prev) =>
      prev.includes(dayVal)
        ? prev.filter((d) => d !== dayVal)
        : [...prev, dayVal].sort((a, b) => a - b)
    );
  };

  const handleAddBlockedDate = () => {
    if (!newBlockedDate) return;
    if (!followUpBlockedDates.includes(newBlockedDate)) {
      setFollowUpBlockedDates((prev) => [...prev, newBlockedDate].sort());
    }
    setNewBlockedDate('');
  };

  const handleRemoveBlockedDate = (dateStr: string) => {
    setFollowUpBlockedDates((prev) => prev.filter((d) => d !== dateStr));
  };

  const applySchedulePreset = (preset: '24_7' | 'business' | 'mon_sat') => {
    if (preset === '24_7') {
      setSchedule((prev) => ({
        ...prev,
        enabled: false,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        startTime: '00:00',
        endTime: '23:59',
      }));
    } else if (preset === 'business') {
      setSchedule((prev) => ({
        ...prev,
        enabled: true,
        activeDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '18:00',
      }));
    } else {
      setSchedule((prev) => ({
        ...prev,
        enabled: true,
        activeDays: [1, 2, 3, 4, 5, 6],
        startTime: '08:00',
        endTime: '20:00',
      }));
    }
  };

  const handleTestAiConnection = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);

    try {
      const normalized = normalizeAiEngine(aiEngine);
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiEngine: {
            provider: normalized.provider,
            model: normalized.model,
            customBaseUrl: normalized.customBaseUrl,
            ...(draftApiKeyInput.trim() ? { customApiKey: draftApiKeyInput.trim() } : {}),
            ...(clearCustomApiKey ? { clearCustomApiKey: true } : {}),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAiTestResult({
          ok: true,
          message: `Conexão validada com ${data.provider} (${data.model}) incluindo histórico de conversa!`,
          replyText: data.replyText,
        });
      } else {
        setAiTestResult({
          ok: false,
          message: data.error || 'Falha ao conectar ao provedor de IA.',
        });
      }
    } catch {
      setAiTestResult({
        ok: false,
        message: 'Erro de rede ao testar conexão com a IA.',
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const normalized = normalizeAiEngine(aiEngine);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoReplyEnabled,
          groupAutoReplyEnabled,
          groupMentionOnly,
          schedule,
          autoFollowUpEnabled,
          followUpDelayHours: Number(followUpDelayHours) || 24,
          followUpMessageTemplate,
          followUpBlockedDays,
          followUpBlockedDates,
          aiEngine: {
            provider: normalized.provider,
            model: normalized.model,
            ...(normalized.customBaseUrl ? { customBaseUrl: normalized.customBaseUrl } : {}),
            ...(draftApiKeyInput.trim() ? { customApiKey: draftApiKeyInput.trim() } : {}),
            ...(clearCustomApiKey ? { clearCustomApiKey: true } : {}),
          },
        }),
      });

      if (res.ok) {
        setDraftApiKeyInput('');
        setClearCustomApiKey(false);
        setSaveFeedback({
          ok: true,
          message:
            'Modelo de configurações salvo! Regras de grupos, horários de atendimento, motor de IA e bloqueios de follow-up já estão ativos.',
        });
        onRefreshData();
        onRefreshConnection();
      } else {
        setSaveFeedback({
          ok: false,
          message: 'Não foi possível salvar as configurações no servidor.',
        });
      }
    } catch {
      setSaveFeedback({
        ok: false,
        message: 'Erro de conexão ao salvar configurações.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSaveSettings} className="space-y-6 pb-10 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Modelo de Configurações do Robô</span>
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Defina se o robô responde em grupos, em quais dias e horários atua, e quando o follow-up 24h deve ser pausado.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Salvando...' : 'Salvar Configurações'}</span>
        </button>
      </div>

      {/* Live Policy Summary Strip (unboxed clean metadata) */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">Regra ativa:</span>
        <span>
          Robô:{' '}
          <strong className={autoReplyEnabled ? 'text-emerald-700' : 'text-rose-700'}>
            {autoReplyEnabled ? 'Ligado' : 'Desligado'}
          </strong>
        </span>
        <span aria-hidden="true" className="text-slate-300">
          ·
        </span>
        <span>
          Grupos:{' '}
          <strong className={groupAutoReplyEnabled ? 'text-emerald-700' : 'text-slate-800'}>
            {groupAutoReplyEnabled
              ? groupMentionOnly
                ? 'Ativo (só com @menção)'
                : 'Ativo (todas msgs)'
              : 'Desativado'}
          </strong>
        </span>
        <span aria-hidden="true" className="text-slate-300">
          ·
        </span>
        <span className="tabular-nums">
          Horário: <strong className="text-slate-900">{formatScheduleSummary(schedule)}</strong>
        </span>
        <span aria-hidden="true" className="text-slate-300">
          ·
        </span>
        <span>
          Follow-up 24h:{' '}
          <strong className={autoFollowUpEnabled ? 'text-slate-900' : 'text-rose-700'}>
            {autoFollowUpEnabled
              ? formatBlockedDaysSummary(followUpBlockedDays, followUpBlockedDates)
              : 'Desativado'}
          </strong>
        </span>
      </div>

      {saveFeedback && (
        <div
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between border ${
            saveFeedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                saveFeedback.ok ? 'text-emerald-600' : 'text-rose-600'
              }`}
            />
            <span>{saveFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveFeedback(null)}
            className="font-semibold ml-3 opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Section 1: Grupos e Atendimento Automático */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Atendimento do Robô & Grupos do WhatsApp</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Controle geral das respostas automáticas e comportamento específico dentro de grupos.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                Resposta Automática Geral no WhatsApp
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Quando desativado, o robô apenas registra as conversas no CRM sem enviar respostas automáticas.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReplyEnabled}
              aria-label="Resposta Automática Geral no WhatsApp"
              onClick={() => setAutoReplyEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoReplyEnabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">
                Robô funcionando em Grupos do WhatsApp
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Permite que a IA leia e responda automaticamente dentro dos grupos conectados (citando quem perguntou).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={groupAutoReplyEnabled}
              aria-label="Robô funcionando em Grupos do WhatsApp"
              onClick={() => setGroupAutoReplyEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                groupAutoReplyEnabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  groupAutoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <label
            className={`flex items-start gap-2.5 text-xs pt-1 ${
              groupAutoReplyEnabled ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!groupAutoReplyEnabled}
              checked={groupMentionOnly}
              onChange={(e) => setGroupMentionOnly(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <strong>Responder em grupos apenas quando marcado (@) ou respondido:</strong> evita que o robô interrompa conversas paralelas entre membros do grupo.
            </span>
          </label>
        </div>
      </section>

      {/* Section 2: Dias e Horários das Mensagens do Robô */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Dias e Horários das Mensagens do Robô</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Escolha os dias da semana e a faixa de horário em que o robô pode responder clientes e grupos.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-medium text-slate-600">
              {schedule.enabled ? 'Horário restrito ativo' : 'Atendimento 24/7'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={schedule.enabled}
              aria-label="Ativar restrição de dias e horários"
              onClick={() => setSchedule((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                schedule.enabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-5">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 mr-1">Modelos rápidos:</span>
            <button
              type="button"
              onClick={() => applySchedulePreset('24_7')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                !schedule.enabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              24h (Todos os dias)
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('business')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                schedule.enabled &&
                schedule.activeDays.length === 5 &&
                schedule.startTime === '08:00' &&
                schedule.endTime === '18:00'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Comercial (Seg–Sex 08:00–18:00)
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('mon_sat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                schedule.enabled &&
                schedule.activeDays.length === 6 &&
                schedule.startTime === '08:00' &&
                schedule.endTime === '20:00'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Seg–Sáb (08:00–20:00)
            </button>
          </div>

          {/* Weekday Toggles */}
          <div className={schedule.enabled ? '' : 'opacity-55'}>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Dias da semana em que o robô responde:
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const active = schedule.activeDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (!schedule.enabled) {
                        setSchedule((prev) => ({ ...prev, enabled: true }));
                      }
                      toggleScheduleDay(day.value);
                    }}
                    className={`py-2.5 px-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hours & Timezone */}
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${schedule.enabled ? '' : 'opacity-55'}`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Horário inicial
              </label>
              <input
                type="time"
                value={schedule.startTime}
                onChange={(e) =>
                  setSchedule((prev) => ({ ...prev, enabled: true, startTime: e.target.value }))
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Horário final
              </label>
              <input
                type="time"
                value={schedule.endTime}
                onChange={(e) =>
                  setSchedule((prev) => ({ ...prev, enabled: true, endTime: e.target.value }))
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fuso horário
              </label>
              <select
                value={schedule.timezone}
                onChange={(e) => setSchedule((prev) => ({ ...prev, timezone: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Off-Hours Auto-Reply */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(schedule.sendOffHoursMessage)}
                onChange={(e) =>
                  setSchedule((prev) => ({ ...prev, sendOffHoursMessage: e.target.checked }))
                }
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <strong className="inline-flex items-center gap-1">
                  <MessageSquareOff className="w-3.5 h-3.5 text-slate-500" />
                  Enviar aviso automático de ausência fora do horário configurado
                </strong>{' '}
                (enviado no máximo 1 vez a cada 6 horas por conversa para evitar repetições).
              </span>
            </label>

            {schedule.sendOffHoursMessage && (
              <textarea
                rows={2}
                value={schedule.offHoursMessage || ''}
                onChange={(e) =>
                  setSchedule((prev) => ({ ...prev, offHoursMessage: e.target.value }))
                }
                placeholder="Ex: Nosso atendimento funciona de segunda a sexta, das 08:00 às 18:00. Retornaremos assim que possível!"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Follow-up Automático 24h & Dias Bloqueados */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CalendarOff className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Follow-up Automático (24h) & Dias que NÃO deve enviar</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure se o follow-up automático está ativo, o prazo em horas e quais dias da semana ou datas ele deve ficar bloqueado.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-medium text-slate-600">
              {autoFollowUpEnabled ? 'Follow-up ativo' : 'Follow-up desligado'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoFollowUpEnabled}
              aria-label="Ativar follow-up automático 24h"
              onClick={() => setAutoFollowUpEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoFollowUpEnabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoFollowUpEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-5">
          {/* Blocked Weekdays */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Dias da semana em que o Follow-up 24h NÃO deve ser enviado:
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFollowUpBlockedDays([0, 6])}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 whitespace-nowrap"
                >
                  Bloquear Sáb e Dom
                </button>
                <button
                  type="button"
                  onClick={() => setFollowUpBlockedDays([0])}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 whitespace-nowrap"
                >
                  Bloquear Domingo
                </button>
                <button
                  type="button"
                  onClick={() => setFollowUpBlockedDays([])}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap"
                >
                  Liberar Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const isBlocked = followUpBlockedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={isBlocked}
                    onClick={() => toggleBlockedFollowUpDay(day.value)}
                    className={`py-2.5 px-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                      isBlocked
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {day.short} · {isBlocked ? 'Bloq.' : 'OK'}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Nos dias marcados em vermelho (Bloq.), o disparador automático aguarda até o próximo dia liberado para enviar o follow-up.
            </p>
          </div>

          {/* Specific Blocked Dates */}
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Datas específicas bloqueadas (feriados, recessos ou folgas):
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={newBlockedDate}
                onChange={(e) => setNewBlockedDate(e.target.value)}
                className="px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddBlockedDate}
                disabled={!newBlockedDate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bloquear Data</span>
              </button>
            </div>

            {followUpBlockedDates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {followUpBlockedDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-md text-xs font-mono tabular-nums"
                  >
                    <span>{d.split('-').reverse().join('/')}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBlockedDate(d)}
                      aria-label={`Remover bloqueio de ${d}`}
                      className="text-rose-600 hover:text-rose-900"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Delay & Message Template */}
          <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempo de Espera (horas)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={followUpDelayHours}
                onChange={(e) => setFollowUpDelayHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Padrão: 24 horas (1 dia após último contato)
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mensagem automática de Follow-up ({'{nome}'}, {'{assunto}'})
              </label>
              <textarea
                rows={3}
                value={followUpMessageTemplate}
                onChange={(e) => setFollowUpMessageTemplate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Discreet Advanced Section: AI Engine Switcher + Bottom Save Action */}
      <div className="pt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowAdvancedAi((prev) => !prev)}
            aria-expanded={showAdvancedAi}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors self-start py-1"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Opções avançadas · Trocar motor de IA</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showAdvancedAi ? 'rotate-180' : ''}`}
            />
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Modelo de Configurações'}</span>
          </button>
        </div>

        {showAdvancedAi && (() => {
          const activeCatalog =
            AI_PROVIDER_CATALOG.find((p) => p.id === aiEngine.provider) || AI_PROVIDER_CATALOG[0];
          const envKeyName = activeCatalog.envVarName;
          const isEnvConfigured =
            aiEngine.provider === 'gemini'
              ? providerEnvStatus?.gemini
              : aiEngine.provider === 'deepseek'
              ? providerEnvStatus?.deepseek
              : aiEngine.provider === 'openai'
              ? providerEnvStatus?.openai
              : aiEngine.provider === 'anthropic'
              ? providerEnvStatus?.anthropic
              : providerEnvStatus?.customKey;
          const hasSavedServerKey =
            !clearCustomApiKey &&
            Boolean(aiEngine.hasCustomApiKey) &&
            botConfig.aiEngine?.provider === aiEngine.provider;

          return (
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-slate-500" />
                    <span>Motor de Inteligência Artificial (Avançado)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Por padrão o sistema utiliza o Google Gemini. Aqui você pode configurar DeepSeek ou outro provedor enviando o histórico completo da conversa automaticamente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUseCustomModelInput(false);
                    setDraftApiKeyInput('');
                    setClearCustomApiKey(true);
                    setAiTestResult(null);
                    setAiEngine({ ...DEFAULT_AI_ENGINE });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap self-start sm:self-center"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar padrão (Gemini)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Provedor de IA
                  </label>
                  <select
                    aria-label="Provedor de IA"
                    value={aiEngine.provider}
                    onChange={(e) => handleProviderChange(e.target.value as AiProviderType)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {AI_PROVIDER_CATALOG.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Modelo da IA
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomModelInput((prev) => !prev)}
                      className="text-[11px] text-emerald-700 hover:underline font-medium"
                    >
                      {useCustomModelInput ? 'Usar lista padrão' : 'Digitar ID manual'}
                    </button>
                  </div>

                  {useCustomModelInput ? (
                    <input
                      type="text"
                      aria-label="ID do modelo da IA"
                      value={aiEngine.model}
                      onChange={(e) =>
                        setAiEngine((prev) => ({ ...prev, model: e.target.value }))
                      }
                      placeholder={activeCatalog.defaultModel}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <select
                      aria-label="Modelo da IA"
                      value={
                        activeCatalog.models.some((m) => m.id === aiEngine.model)
                          ? aiEngine.model
                          : activeCatalog.defaultModel
                      }
                      onChange={(e) =>
                        setAiEngine((prev) => ({ ...prev, model: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {activeCatalog.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {aiEngine.provider !== 'gemini' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-200/80">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                      <Link2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Link / URL Base da API</span>
                    </label>
                    <input
                      type="url"
                      aria-label="Link ou URL Base da API"
                      value={aiEngine.customBaseUrl || ''}
                      onChange={(e) =>
                        setAiEngine((prev) => ({ ...prev, customBaseUrl: e.target.value }))
                      }
                      placeholder={activeCatalog.defaultBaseUrl || 'https://api.deepseek.com/v1'}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Ex: <code>{activeCatalog.defaultBaseUrl || 'https://api.deepseek.com/v1'}</code>
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                        <span>Chave da API (Token)</span>
                      </label>
                      {hasSavedServerKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setClearCustomApiKey(true);
                            setDraftApiKeyInput('');
                          }}
                          className="text-[11px] text-rose-600 hover:underline font-medium"
                        >
                          Remover chave salva
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      autoComplete="off"
                      aria-label="Chave da API"
                      value={draftApiKeyInput}
                      onChange={(e) => {
                        setDraftApiKeyInput(e.target.value);
                        if (e.target.value) setClearCustomApiKey(false);
                      }}
                      placeholder={
                        hasSavedServerKey
                          ? `Salva (${aiEngine.customApiKeyMasked || '••••'}) — digite para trocar`
                          : 'Cole sua chave secreta (ex: sk-...)'
                      }
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {clearCustomApiKey
                        ? 'A chave salva será removida ao salvar.'
                        : hasSavedServerKey
                        ? `Chave armazenada com segurança no servidor (${aiEngine.customApiKeyMasked}).`
                        : 'Armazenada apenas no servidor (nunca exposta ao navegador).'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
                <div className="text-[11px] text-slate-500">
                  {aiEngine.provider === 'gemini' ? (
                    <span>
                      Credencial padrão (<code>{envKeyName}</code>):{' '}
                      {isEnvConfigured ? (
                        <strong className="text-emerald-700">Conectada automaticamente</strong>
                      ) : (
                        <strong className="text-amber-700">Não detectada no ambiente</strong>
                      )}
                    </span>
                  ) : (
                    <span>
                      Status:{' '}
                      {draftApiKeyInput.trim() ? (
                        <strong className="text-emerald-700">Nova chave digitada (pronta para testar/salvar)</strong>
                      ) : hasSavedServerKey || isEnvConfigured ? (
                        <strong className="text-emerald-700">Chave configurada no servidor</strong>
                      ) : aiEngine.provider === 'custom_openai' ? (
                        <span>Chave opcional para servidores locais</span>
                      ) : (
                        <strong className="text-amber-700">
                          Informe a chave acima ou configure {envKeyName}
                        </strong>
                      )}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleTestAiConnection}
                  disabled={isTestingAi}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  {isTestingAi ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>{isTestingAi ? 'Testando IA...' : 'Testar Conexão da IA'}</span>
                </button>
              </div>

              {aiTestResult && (
                <div
                  className={`px-3.5 py-2.5 rounded-lg text-xs border space-y-1 ${
                    aiTestResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {aiTestResult.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span>{aiTestResult.message}</span>
                  </div>
                  {aiTestResult.replyText && (
                    <p className="text-[11px] text-emerald-800 pl-5 italic">
                      Resposta de teste: &ldquo;{aiTestResult.replyText}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })()}
      </div>
    </form>
  );
};
