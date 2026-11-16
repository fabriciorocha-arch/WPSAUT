import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  CheckCheck,
  Sparkles,
  Search,
  MessageSquare,
  ChevronRight,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  QrCode,
  PauseCircle,
  PlayCircle,
  Users,
} from 'lucide-react';
import { Customer, ChatMessage, BotConfig, WhatsAppGroupInfo } from '../types/index.ts';
import { formatPhoneBR, formatCurrencyBRL } from '../utils/crm-analytics.ts';

interface WhatsAppChatProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string) => void;
  botConfig: BotConfig;
  isWhatsAppConnected: boolean;
  onOpenConnection: () => void;
  onRefreshData: () => void;
}

export const WhatsAppChat: React.FC<WhatsAppChatProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  botConfig,
  isWhatsAppConnected,
  onOpenConnection,
  onRefreshData,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [senderMode, setSenderMode] = useState<'customer' | 'agent'>(
    isWhatsAppConnected ? 'agent' : 'customer'
  );
  const [deliveryFeedback, setDeliveryFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [showCustomerDetails, setShowCustomerDetails] = useState(true);
  const [chatFilter, setChatFilter] = useState<'todos' | 'contatos' | 'grupos'>('todos');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatType, setNewChatType] = useState<'contact' | 'group'>('contact');
  const [newChatName, setNewChatName] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [availableGroups, setAvailableGroups] = useState<WhatsAppGroupInfo[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeCustomer =
    customers.find((c) => c.id === selectedCustomerId) || customers[0] || null;
  const isAiEnabledForActive = activeCustomer ? activeCustomer.aiEnabled !== false : true;

  useEffect(() => {
    setSenderMode(isWhatsAppConnected ? 'agent' : 'customer');
  }, [isWhatsAppConnected]);

  useEffect(() => {
    if (activeCustomer) {
      fetchMessages(activeCustomer.id);
    } else {
      setMessages([]);
    }
  }, [activeCustomer?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isTyping]);

  const fetchMessages = async (custId: string) => {
    try {
      const res = await fetch(`/api/messages/${custId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const fetchAvailableGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const res = await fetch('/api/whatsapp/groups');
      if (res.ok) {
        const data = await res.json();
        setAvailableGroups(data.groups || []);
      }
    } catch (err) {
      console.error('Error loading WhatsApp groups:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (isNewChatOpen && newChatType === 'group' && isWhatsAppConnected) {
      fetchAvailableGroups();
    }
  }, [isNewChatOpen, newChatType, isWhatsAppConnected]);

  const handleOpenExistingOrNewGroup = async (group: WhatsAppGroupInfo) => {
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
          aiSummary: `Grupo do WhatsApp (${group.participantCount} membros)`,
          nextAction: 'Acompanhar atendimento no grupo',
        }),
      });
      if (res.ok) {
        const created: Customer = await res.json();
        setIsNewChatOpen(false);
        onSelectCustomer(created.id);
        onRefreshData();
      }
    } catch (err) {
      console.error('Error selecting group:', err);
    }
  };

  const handleCreateNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) return;

    const isGroup = newChatType === 'group' || newChatPhone.trim().endsWith('@g.us');
    const cleanPhone = newChatPhone.trim();
    const digits = cleanPhone.split('@')[0].replace(/\D/g, '');
    const whatsappJid = isGroup
      ? cleanPhone.includes('@')
        ? cleanPhone
        : `${digits}@g.us`
      : undefined;

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:
            newChatName.trim() ||
            (isGroup ? `Grupo ${digits.slice(-4)}` : `Contato ${digits.slice(-4)}`),
          phone: digits,
          whatsappJid,
          isGroup,
          groupName: isGroup ? newChatName.trim() || `Grupo ${digits.slice(-4)}` : undefined,
          status: 'em_atendimento',
          funnelStage: 'descoberta',
          dealValue: 0,
          aiSummary: isGroup
            ? 'Grupo adicionado manualmente no chat'
            : 'Conversa iniciada manualmente no chat',
          nextAction: 'Enviar mensagem no WhatsApp',
        }),
      });
      if (res.ok) {
        const created: Customer = await res.json();
        setIsNewChatOpen(false);
        setNewChatName('');
        setNewChatPhone('');
        onSelectCustomer(created.id);
        onRefreshData();
      }
    } catch (err) {
      console.error('Error creating new chat:', err);
    }
  };

  const handleSendMessage = async (customText?: string, forceMode?: 'customer' | 'agent') => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || !activeCustomer) return;

    const modeToUse = forceMode || senderMode;
    setInputText('');
    setDeliveryFeedback(null);
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          text: textToSend,
          sender: modeToUse,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const toAppend = [data.userMessage];
        if (data.botMessage) {
          toAppend.push(data.botMessage);
        }
        setMessages((prev) => [...prev, ...toAppend]);

        if (modeToUse === 'agent' && data.realDelivery) {
          if (data.realDelivery.delivered) {
            setDeliveryFeedback({
              ok: true,
              message: `Mensagem entregue no WhatsApp real (${data.realDelivery.jid || activeCustomer.phone})!`,
            });
          } else if (data.realDelivery.error) {
            setDeliveryFeedback({
              ok: false,
              message: `Não enviado ao WhatsApp: ${data.realDelivery.error}`,
            });
          }
        } else if (modeToUse === 'customer' && data.aiPausedForCustomer) {
          setDeliveryFeedback({
            ok: false,
            message: `IA pausada apenas para ${activeCustomer.name}. Nenhuma resposta automática foi gerada.`,
          });
        } else if (modeToUse === 'customer' && data.aiError) {
          setDeliveryFeedback({
            ok: false,
            message: `Aviso da IA (resposta de contingência usada): ${data.aiError}`,
          });
        }

        onRefreshData();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setDeliveryFeedback({
        ok: false,
        message: 'Erro de conexão ao enviar mensagem.',
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleToggleCustomerAi = async (cust: Customer) => {
    const nextAiEnabled = cust.aiEnabled === false;
    setIsTogglingAi(true);
    try {
      const res = await fetch(`/api/customers/${cust.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: nextAiEnabled }),
      });
      if (res.ok) {
        setDeliveryFeedback({
          ok: true,
          message: nextAiEnabled
            ? `IA reativada para ${cust.name}. Ela responderá automaticamente às próximas mensagens deste contato.`
            : `IA pausada exclusivamente para ${cust.name}. Outros contatos continuam sendo atendidos normalmente.`,
        });
        onRefreshData();
      }
    } catch (err) {
      console.error('Error toggling customer AI permission:', err);
    } finally {
      setIsTogglingAi(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.productInterest && c.productInterest.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (chatFilter === 'grupos') return Boolean(c.isGroup);
    if (chatFilter === 'contatos') return !c.isGroup;
    return true;
  });

  const getStatusBadge = (status: Customer['status']) => {
    switch (status) {
      case 'convertido':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Convertido</span>;
      case 'interessado':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">Interessado</span>;
      case 'aguardando_followup':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">Follow-up 24h</span>;
      case 'em_atendimento':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">Em Atendimento</span>;
      case 'perdido':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">Perdido</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-600 border border-slate-500/20">Novo Lead</span>;
    }
  };

  const quickQuestions = [
    'Quanto custa o serviço e como contratar?',
    'Vocês dão garantia ou período de teste?',
    'Gostei muito, quero fechar agora!',
    '⭐⭐⭐⭐⭐ Excelente atendimento, muito satisfeito!',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
      {/* Top Banner explaining WhatsApp Live Status */}
      <div className="bg-emerald-700 text-white px-4 py-2 flex items-center justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2 w-2 rounded-full ${
              isWhatsAppConnected ? 'bg-emerald-300 animate-pulse' : 'bg-amber-300'
            }`}
          />
          <span className="font-medium">
            {isWhatsAppConnected ? 'WhatsApp Real Conectado:' : 'Modo Simulação / Desconectado:'}
          </span>
          <span className="opacity-90">
            {isWhatsAppConnected
              ? `Mensagens recebidas são respondidas pela IA (${botConfig.name}) e enviadas no modo WhatsApp Real.`
              : `Conecte seu número para enviar e receber mensagens reais no WhatsApp.`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isWhatsAppConnected ? (
            <span className="bg-emerald-800/80 px-2 py-0.5 rounded text-xs font-mono">
              {botConfig.phoneConnected}
            </span>
          ) : (
            <button
              onClick={onOpenConnection}
              className="bg-white text-emerald-800 hover:bg-emerald-50 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            >
              Conectar WhatsApp
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left column: Conversations List */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  aria-label="Buscar conversa ou cliente"
                  placeholder="Buscar conversa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={() => setIsNewChatOpen(true)}
                title="Nova Conversa WhatsApp"
                aria-label="Nova Conversa WhatsApp"
                className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'contatos', label: 'Contatos' },
                { id: 'grupos', label: 'Grupos' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChatFilter(tab.id as any)}
                  className={`flex-1 py-1 rounded-md font-semibold transition-colors ${
                    chatFilter === tab.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredCustomers.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs space-y-3">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-medium text-slate-700">Nenhuma conversa ainda</p>
                <p className="text-slate-400 leading-relaxed">
                  Quando clientes enviarem mensagens no seu WhatsApp conectado ou quando você iniciar uma conversa, elas aparecerão aqui.
                </p>
                <button
                  onClick={() => setIsNewChatOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Iniciar Conversa por Número
                </button>
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = activeCustomer?.id === cust.id;
                return (
                  <button
                    key={cust.id}
                    onClick={() => onSelectCustomer(cust.id)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors hover:bg-slate-50 ${
                      isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : ''
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full font-semibold flex items-center justify-center text-sm ${
                          cust.isGroup
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {cust.isGroup ? (
                          <Users className="w-5 h-5" />
                        ) : (
                          cust.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                        )}
                      </div>
                      {cust.status === 'convertido' && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-slate-800 truncate">
                          {cust.name}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {new Date(cust.lastInteraction).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        {cust.isGroup && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Grupo
                          </span>
                        )}
                        {getStatusBadge(cust.status)}
                        {cust.aiEnabled === false && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            IA Pausada
                          </span>
                        )}
                        {cust.csatRating && (
                          <span className="text-xs text-amber-600 flex items-center">
                            ★ {cust.csatRating}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {cust.aiSummary || cust.productInterest || 'Sem mensagens recentes'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center column: Active WhatsApp Conversation */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#efeae2] relative">
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
              backgroundSize: '16px 16px',
            }}
          />

          {activeCustomer ? (
            <>
              {/* WhatsApp Chat Header */}
              <div className="bg-[#f0f2f5] border-b border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2 z-10">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-full text-white font-semibold flex items-center justify-center text-xs shadow-sm shrink-0 ${
                      activeCustomer.isGroup ? 'bg-indigo-600' : 'bg-emerald-600'
                    }`}
                  >
                    {activeCustomer.isGroup ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      activeCustomer.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{activeCustomer.name}</span>
                      {activeCustomer.isGroup ? (
                        <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                          Grupo{activeCustomer.participantCount ? ` • ${activeCustomer.participantCount}` : ''}
                        </span>
                      ) : (
                        <span className="hidden 2xl:inline text-[11px] font-normal text-slate-500 font-mono shrink-0">
                          ({formatPhoneBR(activeCustomer.phone)})
                        </span>
                      )}
                    </h3>
                    <p
                      className={`text-xs flex items-center gap-1 font-medium truncate ${
                        isAiEnabledForActive ? 'text-emerald-600' : 'text-amber-700'
                      }`}
                    >
                      {isTyping ? (
                        <span className="animate-pulse flex items-center gap-1">
                          <Bot className="w-3 h-3" /> Processando...
                        </span>
                      ) : !isAiEnabledForActive ? (
                        <span>IA Pausada neste contato • Manual</span>
                      ) : (
                        <span>
                          {isWhatsAppConnected
                            ? 'WhatsApp Real • IA Ativa'
                            : 'Simulação • IA Ativa'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCustomerAi(activeCustomer)}
                    disabled={isTogglingAi}
                    title={
                      isAiEnabledForActive
                        ? 'Remover permissão da IA apenas para este cliente'
                        : 'Reativar respostas automáticas da IA para este cliente'
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      isAiEnabledForActive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300'
                    }`}
                  >
                    {isAiEnabledForActive ? (
                      <>
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>IA Ativa</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>IA Pausada</span>
                      </>
                    )}
                  </button>

                  <div className="hidden sm:flex items-center bg-white rounded-lg p-0.5 border border-slate-200 text-[11px] shrink-0">
                    <button
                      onClick={() => setSenderMode('agent')}
                      className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                        senderMode === 'agent'
                          ? 'bg-emerald-600 text-white font-medium'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      WhatsApp Real
                    </button>
                    <button
                      onClick={() => setSenderMode('customer')}
                      title="Simular mensagem recebida para testar a IA"
                      className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                        senderMode === 'customer'
                          ? 'bg-slate-800 text-white font-medium'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Simular IA
                    </button>
                  </div>

                  <button
                    onClick={() => setShowCustomerDetails(!showCustomerDetails)}
                    aria-label="Ver dados do cliente"
                    className={`p-2 rounded-lg text-slate-600 hover:bg-slate-200/60 transition-colors shrink-0 ${
                      showCustomerDetails ? 'bg-slate-200/80 text-emerald-700' : ''
                    }`}
                    title="Detalhes do Cliente na Planilha"
                  >
                    <User className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delivery status toast */}
              {deliveryFeedback && (
                <div
                  className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between z-10 border ${
                    deliveryFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {deliveryFeedback.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{deliveryFeedback.message}</span>
                  </div>
                  <button
                    onClick={() => setDeliveryFeedback(null)}
                    className="font-bold ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Per-customer AI paused notice */}
              {!isAiEnabledForActive && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 z-10 border bg-amber-50 border-amber-200 text-amber-900">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>IA desativada apenas para {activeCustomer.name}.</strong> Novas mensagens deste contato ficam salvas aqui sem resposta automática.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleCustomerAi(activeCustomer)}
                    disabled={isTogglingAi}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-[11px] shrink-0"
                  >
                    Reativar IA
                  </button>
                </div>
              )}

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 z-10">
                {messages.length === 0 ? (
                  <div className="text-center my-10">
                    <span className="bg-white/90 text-slate-600 text-xs px-4 py-2 rounded-lg shadow-xs border border-slate-200 inline-block">
                      Nenhuma mensagem trocada ainda com {activeCustomer.name}. Envie uma mensagem abaixo!
                    </span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isBot = msg.sender === 'bot';
                    const isCustomer = msg.sender === 'customer';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isCustomer ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-sm relative ${
                            isCustomer
                              ? 'bg-white text-slate-800 rounded-tl-xs border border-slate-100'
                              : isBot
                              ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs border border-emerald-200/50'
                              : 'bg-blue-100 text-slate-900 rounded-tr-xs border border-blue-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              className={`text-[11px] font-semibold flex items-center gap-1 ${
                                isCustomer
                                  ? 'text-slate-500'
                                  : isBot
                                  ? 'text-emerald-800'
                                  : 'text-blue-800'
                              }`}
                            >
                              {isBot ? (
                                <>
                                  <Bot className="w-3 h-3 text-emerald-600" /> {botConfig.name} (IA)
                                </>
                              ) : isCustomer ? (
                                <>
                                  <User className="w-3 h-3" />{' '}
                                  {activeCustomer.isGroup
                                    ? msg.participantName || 'Membro do Grupo'
                                    : activeCustomer.name}
                                </>
                              ) : (
                                'Você (WhatsApp Real)'
                              )}
                            </span>

                            {msg.isFollowUp && (
                              <span className="text-[10px] bg-purple-200/80 text-purple-900 px-1.5 py-0.2 rounded font-medium">
                                Follow-up 24h
                              </span>
                            )}
                          </div>

                          <p className="whitespace-pre-wrap leading-relaxed text-[13.5px]">
                            {msg.text}
                          </p>

                          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {!isCustomer && (
                              <CheckCheck
                                className={`w-3.5 h-3.5 ${
                                  msg.status === 'delivered' || msg.status === 'read'
                                    ? 'text-blue-500'
                                    : 'text-slate-400'
                                }`}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {isTyping && (
                  <div className="flex items-start gap-2">
                    <div className="bg-[#d9fdd3] text-slate-700 rounded-2xl rounded-tl-xs px-4 py-2.5 shadow-sm text-xs flex items-center gap-2 border border-emerald-200">
                      <Bot className="w-4 h-4 text-emerald-700 animate-spin" />
                      <span>Processando mensagem...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Test Chips when simulating */}
              {senderMode === 'customer' && (
                <div className="bg-slate-100/95 border-t border-slate-200/80 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs z-10">
                  <span className="text-slate-500 shrink-0 font-medium flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Simular cliente dizendo:
                  </span>
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(q, 'customer')}
                      className="shrink-0 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 px-2.5 py-1 rounded-full border border-slate-200 text-xs transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Input Box */}
              <div className="bg-[#f0f2f5] border-t border-slate-200 p-3 flex items-center gap-2 z-10">
                <input
                  type="text"
                  aria-label="Mensagem WhatsApp"
                  placeholder={
                    senderMode === 'agent'
                      ? activeCustomer.isGroup
                        ? `Enviar mensagem real no grupo ${activeCustomer.name}...`
                        : `Enviar mensagem real para ${activeCustomer.name} (${formatPhoneBR(
                            activeCustomer.phone
                          )})...`
                      : `Simular mensagem enviada por ${activeCustomer.name} para testar a IA...`
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-white rounded-lg px-4 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() || isTyping}
                  aria-label="Enviar mensagem"
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white p-2.5 rounded-lg transition-colors shadow-sm"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 z-10">
              <div className="bg-white/95 p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md space-y-4">
                <MessageSquare className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">
                  Seu chat está limpo e pronto!
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {isWhatsAppConnected
                    ? 'Seu WhatsApp está conectado. Assim que um cliente enviar mensagem para você, a IA responderá automaticamente e a conversa aparecerá aqui — ou inicie uma conversa agora.'
                    : 'Conecte seu WhatsApp via QR Code para conversar com clientes reais ou inicie uma conversa manualmente para testar.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  {!isWhatsAppConnected && (
                    <button
                      onClick={onOpenConnection}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs"
                    >
                      <QrCode className="w-4 h-4" /> Conectar WhatsApp
                    </button>
                  )}
                  <button
                    onClick={() => setIsNewChatOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs"
                  >
                    <Plus className="w-4 h-4" /> Nova Conversa por Número
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Customer CRM Quick Profile */}
        {showCustomerDetails && activeCustomer && (
          <div className="w-72 border-l border-slate-200 bg-white p-4 flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-semibold text-sm text-slate-800">
                {activeCustomer.isGroup ? 'Ficha do Grupo' : 'Ficha do Cliente'}
              </h4>
              {getStatusBadge(activeCustomer.status)}
            </div>

            <div className="text-center py-4 border-b border-slate-100">
              <div
                className={`w-16 h-16 rounded-full font-bold text-xl mx-auto flex items-center justify-center mb-2 ${
                  activeCustomer.isGroup
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {activeCustomer.isGroup ? (
                  <Users className="w-7 h-7" />
                ) : (
                  activeCustomer.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                )}
              </div>
              <h3 className="font-semibold text-base text-slate-900">{activeCustomer.name}</h3>
              <p className="text-xs text-slate-500">
                {activeCustomer.isGroup
                  ? activeCustomer.participantCount
                    ? `Grupo WhatsApp • ${activeCustomer.participantCount} membros`
                    : 'Grupo WhatsApp'
                  : formatPhoneBR(activeCustomer.phone)}
              </p>
              {activeCustomer.email && (
                <p className="text-xs text-slate-400 mt-0.5">{activeCustomer.email}</p>
              )}
            </div>

            <div className="py-3 space-y-3 text-xs border-b border-slate-100">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="font-semibold text-slate-800 block">
                    Resposta Automática (IA)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isAiEnabledForActive
                      ? 'Ativa para este cliente'
                      : 'Pausada somente para este cliente'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleCustomerAi(activeCustomer)}
                  disabled={isTogglingAi}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-colors ${
                    isAiEnabledForActive
                      ? 'bg-emerald-600 text-white hover:bg-amber-600'
                      : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  {isAiEnabledForActive ? 'Ativa (Pausar)' : 'Pausada (Ativar)'}
                </button>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Etapa no Funil:</span>
                <span className="font-medium text-slate-800 capitalize bg-slate-100 px-2 py-0.5 rounded">
                  {activeCustomer.funnelStage}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Valor Potencial:</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {formatCurrencyBRL(activeCustomer.dealValue)}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Interesse / Produto:</span>
                <span className="font-medium text-emerald-700">
                  {activeCustomer.productInterest || 'Identificando...'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Satisfação (CSAT):</span>
                {activeCustomer.csatRating ? (
                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    {'★'.repeat(activeCustomer.csatRating)}
                    <span className="text-slate-600 font-normal ml-1">
                      ({activeCustomer.csatRating}/5)
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Aguardando follow-up 24h</span>
                )}
                {activeCustomer.csatFeedback && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded mt-1 border border-slate-200">
                    "{activeCustomer.csatFeedback}"
                  </p>
                )}
              </div>
            </div>

            <div className="py-3 space-y-2 text-xs">
              <span className="text-slate-400 block font-medium">Resumo Automático pela IA:</span>
              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                {activeCustomer.aiSummary || 'A IA atualizará este resumo conforme o diálogo.'}
              </p>
            </div>

            <div className="py-2 text-xs">
              <span className="text-slate-400 block font-medium mb-1">Próxima Ação Recomendada:</span>
              <p className="text-slate-800 font-medium flex items-center gap-1.5 bg-emerald-50 text-emerald-900 p-2 rounded border border-emerald-200">
                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {activeCustomer.nextAction || 'Continuar atendimento'}
              </p>
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Follow-up enviado:</span>
              <span
                className={`font-semibold ${
                  activeCustomer.followUpSent ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {activeCustomer.followUpSent ? 'Sim ✓' : 'Pendente (24h)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Nova Conversa por Número */}
      {isNewChatOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Iniciar Conversa no WhatsApp
              </h3>
              <button
                onClick={() => setIsNewChatOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4 text-xs">
              <button
                type="button"
                onClick={() => setNewChatType('contact')}
                className={`flex-1 py-2 rounded-lg font-semibold border transition-colors ${
                  newChatType === 'contact'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Contato (Número)
              </button>
              <button
                type="button"
                onClick={() => setNewChatType('group')}
                className={`flex-1 py-2 rounded-lg font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
                  newChatType === 'group'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Grupo do WhatsApp
              </button>
            </div>

            {newChatType === 'group' && isWhatsAppConnected && (
              <div className="mb-4 space-y-2 text-xs">
                <span className="font-semibold text-slate-700 block">
                  Selecionar um dos seus grupos reais:
                </span>
                {isLoadingGroups ? (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-center">
                    Carregando grupos do WhatsApp...
                  </div>
                ) : availableGroups.length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-center">
                    Nenhum grupo carregado automaticamente. Informe o JID abaixo ou conecte o número.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {availableGroups.map((g) => (
                      <button
                        key={g.jid}
                        type="button"
                        onClick={() => handleOpenExistingOrNewGroup(g)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 flex items-center justify-between transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">
                            {g.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {g.participantCount} membros
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-indigo-700 shrink-0 ml-2">
                          Abrir →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleCreateNewChat} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {newChatType === 'group'
                    ? 'ID / JID do Grupo (@g.us) *'
                    : 'Número do WhatsApp (com DDI e DDD) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    newChatType === 'group'
                      ? 'Ex: 120363012345678901@g.us'
                      : 'Ex: 5511999998888'
                  }
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {newChatType === 'group'
                    ? 'Nome do Grupo (Opcional)'
                    : 'Nome do Cliente (Opcional)'}
                </label>
                <input
                  type="text"
                  placeholder={newChatType === 'group' ? 'Ex: Grupo VIP Clientes' : 'Ex: Maria Clara'}
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewChatOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {newChatType === 'group' ? 'Abrir Grupo' : 'Abrir Conversa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
