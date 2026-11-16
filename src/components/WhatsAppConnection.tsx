import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  Send,
  ShieldCheck,
  KeyRound,
  Server,
  Cloud,
  Bot,
  Loader2,
  Hash,
  Users,
  MessageCircle,
} from 'lucide-react';
import {
  WhatsAppConnectionState,
  WhatsAppProviderMode,
  WhatsAppGroupInfo,
} from '../types/index.ts';

interface WhatsAppConnectionProps {
  connectionState: WhatsAppConnectionState;
  onRefreshState: () => void;
  onRefreshAllData: () => void;
  onOpenChat?: (customerId: string) => void;
}

export const WhatsAppConnection: React.FC<WhatsAppConnectionProps> = ({
  connectionState,
  onRefreshState,
  onRefreshAllData,
  onOpenChat,
}) => {
  const [activeProviderTab, setActiveProviderTab] = useState<WhatsAppProviderMode>(
    connectionState.provider || 'baileys_qr'
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [usePairingCode, setUsePairingCode] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');

  // Meta Cloud API Form
  const [metaPhoneId, setMetaPhoneId] = useState(connectionState.metaConfig?.phoneNumberId || '');
  const [metaToken, setMetaToken] = useState(connectionState.metaConfig?.accessToken || '');
  const [metaVerifyToken, setMetaVerifyToken] = useState(
    connectionState.metaConfig?.verifyToken || 'zapflow_token_secret'
  );

  // Evolution API Form
  const [evoBaseUrl, setEvoBaseUrl] = useState(connectionState.evolutionConfig?.baseUrl || '');
  const [evoInstance, setEvoInstance] = useState(
    connectionState.evolutionConfig?.instanceName || ''
  );
  const [evoApiKey, setEvoApiKey] = useState(connectionState.evolutionConfig?.apiKey || '');

  // Test real send form
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState(
    'Olá! Esta é uma mensagem real enviada pelo meu sistema ZapFlow AI.'
  );
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroupInfo[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupsLoadedOnce, setGroupsLoadedOnce] = useState(false);
  const [openingGroupJid, setOpeningGroupJid] = useState<string | null>(null);

  useEffect(() => {
    setMetaPhoneId(connectionState.metaConfig?.phoneNumberId || '');
    setMetaToken(connectionState.metaConfig?.accessToken || '');
    setMetaVerifyToken(connectionState.metaConfig?.verifyToken || 'zapflow_token_secret');
    setEvoBaseUrl(connectionState.evolutionConfig?.baseUrl || '');
    setEvoInstance(connectionState.evolutionConfig?.instanceName || '');
    setEvoApiKey(connectionState.evolutionConfig?.apiKey || '');
  }, [connectionState.provider]);

  // Poll rapidly while QR is being generated or waiting to be scanned
  useEffect(() => {
    if (connectionState.status === 'connecting' || connectionState.status === 'qr_ready') {
      const interval = setInterval(() => {
        onRefreshState();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [connectionState.status]);

  const handleConnectBaileys = async () => {
    setIsConnecting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/whatsapp/connect/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          usePairingCode && pairingPhone.trim()
            ? { pairingPhoneNumber: pairingPhone.trim() }
            : {}
        ),
      });
      if (res.ok) {
        onRefreshState();
      }
    } catch (err) {
      console.error('Error connecting Baileys:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsConnecting(true);
    setActionMessage(null);
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      onRefreshState();
      onRefreshAllData();
      setActionMessage('Sessão do WhatsApp desconectada.');
    } catch (err) {
      console.error('Error disconnecting:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/whatsapp/config/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: metaPhoneId,
          accessToken: metaToken,
          verifyToken: metaVerifyToken,
        }),
      });
      if (res.ok) {
        onRefreshState();
        onRefreshAllData();
        setActionMessage('Credenciais da Meta Cloud API salvas e ativadas!');
      }
    } catch (err) {
      console.error('Error saving Meta config:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/whatsapp/config/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: evoBaseUrl,
          instanceName: evoInstance,
          apiKey: evoApiKey,
        }),
      });
      if (res.ok) {
        onRefreshState();
        onRefreshAllData();
        setActionMessage('Credenciais da Evolution API salvas e ativadas!');
      }
    } catch (err) {
      console.error('Error saving Evolution config:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleAutoReply = async () => {
    try {
      await fetch('/api/whatsapp/auto-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !connectionState.autoReplyEnabled }),
      });
      onRefreshState();
    } catch (err) {
      console.error('Error toggling auto-reply:', err);
    }
  };

  const handleToggleGroupAutoReply = async (nextEnabled: boolean, nextMentionOnly?: boolean) => {
    try {
      await fetch('/api/whatsapp/group-auto-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          ...(nextMentionOnly !== undefined ? { mentionOnly: nextMentionOnly } : {}),
        }),
      });
      onRefreshState();
    } catch (err) {
      console.error('Error toggling group auto-reply:', err);
    }
  };

  const handleFetchGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const res = await fetch('/api/whatsapp/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setGroupsLoadedOnce(true);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp groups:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const handleOpenGroupInChat = async (group: WhatsAppGroupInfo) => {
    if (group.customerId && onOpenChat) {
      onOpenChat(group.customerId);
      return;
    }
    setOpeningGroupJid(group.jid);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: group.name,
          phone: group.jid.split('@')[0],
          whatsappJid: group.jid,
          isGroup: true,
          groupName: group.name,
          participantCount: group.participantCount,
          status: 'em_atendimento',
          funnelStage: 'descoberta',
          aiSummary: `Grupo do WhatsApp (${group.participantCount} participantes)`,
          nextAction: 'Acompanhar mensagens do grupo',
        }),
      });
      if (res.ok) {
        const created = await res.json();
        await onRefreshAllData();
        await handleFetchGroups();
        if (onOpenChat) {
          onOpenChat(created.id);
        }
      }
    } catch (err) {
      console.error('Error opening group chat:', err);
    } finally {
      setOpeningGroupJid(null);
    }
  };

  useEffect(() => {
    if (connectionState.status === 'connected' && !groupsLoadedOnce) {
      handleFetchGroups();
    }
  }, [connectionState.status]);

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testText.trim()) return;
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, text: testText }),
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        setTestResult({
          ok: true,
          msg: `Mensagem enviada para ${testPhone} com sucesso!`,
        });
      } else {
        setTestResult({
          ok: false,
          msg: data.error || 'Não foi possível enviar a mensagem.',
        });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || 'Erro de rede ao enviar.' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleCopyPairingCode = () => {
    if (!connectionState.pairingCode) return;
    navigator.clipboard.writeText(connectionState.pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isConnected = connectionState.status === 'connected';

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-emerald-600" />
            Conectar com Meu WhatsApp
          </h2>
          <p className="text-sm text-slate-500">
            Vincule seu número real de WhatsApp por QR Code (igual ao WhatsApp Web) ou via API oficial para responder clientes automaticamente.
          </p>
        </div>

        {/* Status Pill */}
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
            isConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : connectionState.status === 'qr_ready' || connectionState.status === 'connecting'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-emerald-500 animate-pulse'
                : connectionState.status === 'qr_ready' || connectionState.status === 'connecting'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-slate-400'
            }`}
          />
          <span>
            {isConnected
              ? `Conectado: ${connectionState.connectedPhone || 'Ativo'}`
              : connectionState.status === 'qr_ready'
              ? 'QR Code Pronto para Leitura'
              : connectionState.status === 'connecting'
              ? 'Iniciando conexão...'
              : 'WhatsApp Desconectado'}
          </span>
        </div>
      </div>

      {actionMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="font-bold text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {connectionState.lastError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{connectionState.lastError}</span>
        </div>
      )}

      {/* Provider Mode Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => setActiveProviderTab('baileys_qr')}
          className={`text-left p-4 rounded-xl border transition-all ${
            activeProviderTab === 'baileys_qr'
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-bold text-sm text-slate-900">
              <QrCode className="w-4 h-4 text-emerald-600" />
              QR Code Direto (WhatsApp Web)
            </span>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
              Mais Fácil
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Escaneie com o celular em &quot;Aparelhos Conectados&quot; sem precisar de conta Meta Developer.
          </p>
        </button>

        <button
          onClick={() => setActiveProviderTab('meta_cloud')}
          className={`text-left p-4 rounded-xl border transition-all ${
            activeProviderTab === 'meta_cloud'
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-bold text-sm text-slate-900">
              <Cloud className="w-4 h-4 text-blue-600" />
              API Oficial da Meta (Cloud API)
            </span>
            <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              Oficial
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Para empresas com WhatsApp Business API oficial na Meta for Developers.
          </p>
        </button>

        <button
          onClick={() => setActiveProviderTab('evolution_api')}
          className={`text-left p-4 rounded-xl border transition-all ${
            activeProviderTab === 'evolution_api'
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-bold text-sm text-slate-900">
              <Server className="w-4 h-4 text-purple-600" />
              Evolution API / Z-API
            </span>
            <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
              Gateway
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Conecte uma instância externa da Evolution API ou Z-API usando URL e API Key.
          </p>
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Selected Provider Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          {activeProviderTab === 'baileys_qr' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Conexão Direta via QR Code (WhatsApp Multi-Device)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Funciona com WhatsApp Pessoal ou WhatsApp Business instalado no seu celular.
                  </p>
                </div>
                {isConnected && connectionState.provider === 'baileys_qr' && (
                  <button
                    onClick={handleDisconnect}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Desconectar
                  </button>
                )}
              </div>

              {isConnected && connectionState.provider === 'baileys_qr' ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                        WhatsApp Sincronizado em Tempo Real
                      </span>
                      <h4 className="text-lg font-bold text-slate-900 mt-0.5">
                        {connectionState.connectedName || 'WhatsApp Conectado'}
                      </h4>
                      <p className="text-sm font-mono text-emerald-800 font-semibold">
                        {connectionState.connectedPhone}
                      </p>
                      <p className="text-xs text-slate-600 mt-2">
                        Novas mensagens recebidas em conversas privadas e grupos serão respondidas automaticamente pela IA usando seu prompt e registradas na Planilha.
                      </p>
                    </div>
                  </div>

                  {/* Connected WhatsApp Groups Panel */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-600" />
                          Grupos do WhatsApp Conectados
                        </h4>
                        <p className="text-xs text-slate-500">
                          Veja seus grupos reais e abra qualquer um no chat para conversar ou gerenciar a IA.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleFetchGroups}
                        disabled={isLoadingGroups}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGroups ? 'animate-spin' : ''}`} />
                        {isLoadingGroups ? 'Carregando...' : 'Atualizar Grupos'}
                      </button>
                    </div>

                    {isLoadingGroups && groups.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        Buscando grupos do seu WhatsApp...
                      </div>
                    ) : groups.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-3 text-center">
                        Nenhum grupo encontrado ainda nesta conta, ou clique em &quot;Atualizar Grupos&quot;.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                        {groups.map((grp) => (
                          <div
                            key={grp.jid}
                            className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-900 truncate">
                                {grp.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                <span>{grp.participantCount} membros</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded font-semibold ${
                                    grp.aiEnabled
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {grp.aiEnabled ? 'IA Ativa' : 'IA Pausada'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenGroupInChat(grp)}
                              disabled={openingGroupJid === grp.jid}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold shrink-0 transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                              {openingGroupJid === grp.jid ? 'Abrindo...' : 'Abrir Chat'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* QR Box */}
                  <div className="flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 min-h-[280px]">
                    {connectionState.status === 'qr_ready' && connectionState.qrCodeDataUrl ? (
                      <div className="text-center space-y-3">
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 inline-block">
                          <img
                            src={connectionState.qrCodeDataUrl}
                            alt="QR Code do WhatsApp"
                            className="w-56 h-56 object-contain"
                          />
                        </div>
                        <p className="text-xs font-semibold text-emerald-700 animate-pulse">
                          Escaneie agora com seu WhatsApp!
                        </p>
                        {connectionState.pairingCode && (
                          <div className="bg-white border border-emerald-300 rounded-lg p-2.5 text-center">
                            <span className="text-[11px] text-slate-500 block">
                              Código de Pareamento (8 dígitos):
                            </span>
                            <div className="flex items-center justify-center gap-2 mt-1">
                              <code className="text-lg font-black tracking-widest text-emerald-700 font-mono">
                                {connectionState.pairingCode}
                              </code>
                              <button
                                onClick={handleCopyPairingCode}
                                className="p-1 text-slate-500 hover:text-emerald-700"
                                title="Copiar código"
                              >
                                {copiedCode ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : connectionState.status === 'connecting' || isConnecting ? (
                      <div className="text-center space-y-3">
                        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
                        <p className="text-xs font-semibold text-slate-700">
                          Gerando sessão segura com o WhatsApp...
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Aguarde alguns segundos até o QR Code aparecer.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                          <QrCode className="w-9 h-9" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            Pronto para vincular seu WhatsApp
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Clique no botão abaixo para gerar o QR Code oficial de pareamento.
                          </p>
                        </div>

                        {/* Optional Pairing Code toggle */}
                        <div className="pt-1">
                          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={usePairingCode}
                              onChange={(e) => setUsePairingCode(e.target.checked)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Conectar sem câmera (via Código por Número)</span>
                          </label>
                          {usePairingCode && (
                            <input
                              type="text"
                              placeholder="Seu WhatsApp com DDI+DDD (ex: 5511999998888)"
                              value={pairingPhone}
                              onChange={(e) => setPairingPhone(e.target.value)}
                              className="mt-2 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          )}
                        </div>

                        <button
                          onClick={handleConnectBaileys}
                          disabled={isConnecting}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
                        >
                          {usePairingCode ? (
                            <Hash className="w-4 h-4" />
                          ) : (
                            <QrCode className="w-4 h-4" />
                          )}
                          {usePairingCode
                            ? 'Gerar Código de Pareamento'
                            : 'Gerar QR Code para Conectar'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step-by-step Instructions */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm text-slate-900">
                      Como conectar em 4 passos:
                    </h4>
                    <ol className="space-y-3 text-xs text-slate-600">
                      <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <span>
                          Abra o <strong>WhatsApp</strong> no seu celular.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <span>
                          Toque em <strong>Mais opções (⋮)</strong> no Android ou{' '}
                          <strong>Configurações</strong> no iPhone.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                          3
                        </span>
                        <span>
                          Selecione <strong>Aparelhos conectados</strong> e toque em{' '}
                          <strong>Conectar um aparelho</strong>.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                          4
                        </span>
                        <span>
                          Aponte a câmera para o QR Code ao lado (ou insira o código de 8 dígitos).
                        </span>
                      </li>
                    </ol>

                    {(connectionState.status === 'qr_ready' ||
                      connectionState.status === 'connecting') && (
                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={handleConnectBaileys}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Novo QR Code
                        </button>
                        <button
                          onClick={handleDisconnect}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeProviderTab === 'meta_cloud' && (
            <form onSubmit={handleSaveMeta} className="space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="font-bold text-base text-slate-900">
                  API Oficial da Meta (WhatsApp Cloud API)
                </h3>
                <p className="text-xs text-slate-500">
                  Insira os dados do seu aplicativo no painel <strong>developers.facebook.com</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phone Number ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 109283746512345"
                    value={metaPhoneId}
                    onChange={(e) => setMetaPhoneId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Verify Token do Webhook *
                  </label>
                  <input
                    type="text"
                    required
                    value={metaVerifyToken}
                    onChange={(e) => setMetaVerifyToken(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-semibold text-slate-700 mb-1">
                  Access Token Permanente (Bearer) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="EAAG..."
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
                <span className="font-semibold text-slate-700 block">
                  URL de Callback para configurar na Meta:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold"
                  >
                    {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  <KeyRound className="w-4 h-4" />
                  Salvar e Conectar API Oficial
                </button>
              </div>
            </form>
          )}

          {activeProviderTab === 'evolution_api' && (
            <form onSubmit={handleSaveEvolution} className="space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="font-bold text-base text-slate-900">
                  Evolution API / Gateway Externo
                </h3>
                <p className="text-xs text-slate-500">
                  Conecte seu servidor Evolution API apontando o webhook de mensagens recebidas para este app.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    URL Base da Evolution API *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.seudominio.com"
                    value={evoBaseUrl}
                    onChange={(e) => setEvoBaseUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome da Instância *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: atendimento_principal"
                    value={evoInstance}
                    onChange={(e) => setEvoInstance(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-semibold text-slate-700 mb-1">
                  API Key Global / da Instância *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Sua apikey da Evolution"
                  value={evoApiKey}
                  onChange={(e) => setEvoApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
                <span className="font-semibold text-slate-700 block">
                  Webhook URL (evento MESSAGES_UPSERT):
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold"
                  >
                    {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  <Server className="w-4 h-4" />
                  Salvar e Conectar Instância
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Auto-Reply Control & Real Outbound Test */}
        <div className="space-y-4">
          {/* Auto-Reply Toggle Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-sm text-slate-900">Resposta Automática IA</h4>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={connectionState.autoReplyEnabled}
                aria-label="Ativar resposta automática da IA"
                onClick={handleToggleAutoReply}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  connectionState.autoReplyEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    connectionState.autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {connectionState.autoReplyEnabled
                ? 'Ativada: toda nova mensagem recebida no WhatsApp (conversas e grupos liberados) será respondida na hora pela IA com base no seu prompt.'
                : 'Pausada: as mensagens chegam na planilha e no chat, mas o robô não responde automaticamente.'}
            </p>
          </div>

          {/* Send Real Message Test Card */}
          <form
            onSubmit={handleSendTestMessage}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3"
          >
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              Testar Disparo Real no WhatsApp
            </h4>
            <p className="text-xs text-slate-500">
              Após conectar seu número, envie uma mensagem real para testar a entrega imediata.
            </p>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Número destino ou JID do Grupo
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5511999998888 ou 120363...@g.us"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mensagem</label>
                <textarea
                  rows={2}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg text-xs border ${
                  testResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {testResult.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={!isConnected || isSendingTest || !testPhone.trim()}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {isSendingTest ? 'Enviando...' : 'Enviar Mensagem Real'}
            </button>
          </form>

          {/* Group Integration Settings Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-sm text-slate-900">Integração com Grupos</h4>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={connectionState.groupAutoReplyEnabled}
                aria-label="Ativar resposta automática da IA em grupos"
                onClick={() =>
                  handleToggleGroupAutoReply(!connectionState.groupAutoReplyEnabled)
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  connectionState.groupAutoReplyEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    connectionState.groupAutoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {connectionState.groupAutoReplyEnabled
                ? 'Ativada: a IA responde automaticamente em grupos do WhatsApp citando o participante que perguntou.'
                : 'Desativada: mensagens de grupos são apenas registradas no chat sem resposta automática.'}
            </p>

            <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={connectionState.groupMentionOnly}
                disabled={!connectionState.groupAutoReplyEnabled}
                onChange={(e) =>
                  handleToggleGroupAutoReply(
                    connectionState.groupAutoReplyEnabled,
                    e.target.checked
                  )
                }
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
              />
              <span>Responder nos grupos apenas quando marcado (@) ou respondido</span>
            </label>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-start gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Canais (@newsletter) e Status continuam ignorados automaticamente.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
