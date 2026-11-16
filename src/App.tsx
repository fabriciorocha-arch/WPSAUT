import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  MessageCircle,
  FileSpreadsheet,
  Clock,
  Bot,
  Smartphone,
  Menu,
  X,
  Sparkles,
  QrCode,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Customer,
  BotConfig,
  AnalyticsSummary,
  WhatsAppConnectionState,
} from './types/index.ts';
import { calculateAnalytics } from './utils/crm-analytics.ts';
import { WhatsAppChat } from './components/WhatsAppChat.tsx';
import { AnalyticsDashboard } from './components/AnalyticsDashboard.tsx';
import { CustomerSpreadsheet } from './components/CustomerSpreadsheet.tsx';
import { FollowUpManager } from './components/FollowUpManager.tsx';
import { BotPromptConfig } from './components/BotPromptConfig.tsx';
import { WhatsAppConnection } from './components/WhatsAppConnection.tsx';
import { SettingsModelConfig } from './components/SettingsModelConfig.tsx';

type AppTab = 'dashboard' | 'whatsapp' | 'chat' | 'spreadsheet' | 'followup' | 'config' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    name: 'Sofia - Assistente Comercial',
    persona: 'Especialista em vendas e atendimento.',
    niche: 'geral',
    systemPrompt: '',
    welcomeMessage: 'Olá! Como posso ajudar você hoje?',
    followUpDelayHours: 24,
    followUpMessageTemplate: 'Olá {nome}, tudo bem?',
    autoFollowUpEnabled: true,
    qualificationCriteria: '',
    phoneConnected: '',
    isConnected: false,
  });
  const [connectionState, setConnectionState] = useState<WhatsAppConnectionState>({
    provider: 'baileys_qr',
    status: 'disconnected',
    qrCodeDataUrl: null,
    pairingCode: null,
    connectedPhone: '',
    connectedName: '',
    lastError: null,
    webhookUrl: '',
    verifyToken: 'zapflow_token_secret',
    metaConfig: { phoneNumberId: '', accessToken: '', verifyToken: 'zapflow_token_secret' },
    evolutionConfig: { baseUrl: '', instanceName: '', apiKey: '' },
    autoReplyEnabled: true,
    groupAutoReplyEnabled: true,
    groupMentionOnly: false,
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchWhatsAppStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data: WhatsAppConnectionState = await res.json();
        setConnectionState(data);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    }
  };

  const fetchAppData = async () => {
    try {
      const [custRes, settingsRes, analyticsRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/settings'),
        fetch('/api/analytics'),
      ]);

      if (custRes.ok) {
        const custList: Customer[] = await custRes.json();
        setCustomers(custList);
        if (!selectedCustomerId && custList.length > 0) {
          setSelectedCustomerId(custList[0].id);
        }
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setBotConfig(settingsData);
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch (err) {
      console.error('Error fetching initial app data:', err);
    }
  };

  useEffect(() => {
    fetchAppData();
    fetchWhatsAppStatus();

    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('whatsapp_status', (e) => {
      try {
        const parsed = JSON.parse(e.data) as WhatsAppConnectionState;
        setConnectionState(parsed);
      } catch {
        // ignore
      }
    });
    eventSource.addEventListener('data_updated', () => {
      fetchAppData();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleOpenChatForCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setActiveTab('chat');
  };

  const currentAnalytics = analytics || calculateAnalytics(customers, []);
  const isConnected = connectionState.status === 'connected';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-800 font-sans antialiased">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            Z
          </div>
          <span className="font-bold text-base tracking-tight">ZapFlow AI</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
          aria-label="Abrir menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-black text-lg shadow-md shadow-emerald-500/20">
            Z
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight text-white flex items-center gap-1.5">
              ZapFlow AI
            </h1>
            <p className="text-[11px] text-emerald-400 font-medium">WhatsApp & CRM Inteligente</p>
          </div>
        </div>

        {/* Clickable WhatsApp Connection Status Card */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('whatsapp');
            setIsMobileMenuOpen(false);
          }}
          className="text-left px-4 py-3 mx-3 my-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700/60 text-xs transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Smartphone
                className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}
              />{' '}
              WhatsApp
            </span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300">
                Conectar
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-slate-200 truncate">
            {isConnected
              ? connectionState.connectedPhone || 'WhatsApp Ativo'
              : 'Clique para vincular seu número'}
          </p>
        </button>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4" />
              <span>Dashboard & Conversão</span>
            </div>
            {currentAnalytics.conversionRate > 0 && (
              <span className="text-[10px] bg-emerald-700 text-emerald-200 px-1.5 py-0.5 rounded-full font-mono">
                {currentAnalytics.conversionRate}%
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('whatsapp');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <QrCode className="w-4 h-4" />
              <span>Conectar WhatsApp</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {isConnected ? 'On' : 'QR'}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('chat');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'chat'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Live (Chat)</span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
              Live
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('spreadsheet');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'spreadsheet'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Planilha de Clientes</span>
            </div>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-full font-mono">
              {customers.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('followup');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'followup'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4" />
              <span>Follow-up 24h</span>
            </div>
            <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">
              Auto
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('config');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'config'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Bot className="w-4 h-4" />
              <span>Configurar IA (Prompt)</span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('settings');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="w-4 h-4" />
              <span>Modelo de Configurações</span>
            </div>
          </button>
        </nav>

        {/* Footer info in sidebar */}
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 mb-1 text-slate-300 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gemini 3.8 Flash Ativo</span>
          </div>
          <p className="text-[10px] leading-tight text-slate-500">
            Respostas instantâneas personalizadas com o prompt do seu negócio.
          </p>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Navbar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {activeTab === 'dashboard' && 'Dashboard de Desempenho & Conversão'}
              {activeTab === 'whatsapp' && 'Conectar com Meu WhatsApp (QR Code & APIs)'}
              {activeTab === 'chat' && 'WhatsApp Web & Atendimento Automático'}
              {activeTab === 'spreadsheet' && 'Planilha de Clientes (CRM Automático)'}
              {activeTab === 'followup' && 'Follow-up de Satisfação 24 Horas Depois'}
              {activeTab === 'config' && 'Instruções e Prompt da Inteligência Artificial'}
              {activeTab === 'settings' && 'Modelo de Configurações (Grupos, Horários & Follow-up)'}
            </h2>
            <p className="text-xs text-slate-400">
              {botConfig.name} • {customers.length} contatos registrados
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{isConnected ? 'WhatsApp Conectado' : 'Conectar meu WhatsApp'}</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Abrir Chat</span>
            </button>
          </div>
        </header>

        {/* Tab View Body */}
        <div className="p-4 sm:p-6 flex-1 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <AnalyticsDashboard
              analytics={currentAnalytics}
              customers={customers}
              onNavigateToTab={(tab) => setActiveTab(tab as AppTab)}
            />
          )}

          {activeTab === 'whatsapp' && (
            <WhatsAppConnection
              connectionState={connectionState}
              onRefreshState={fetchWhatsAppStatus}
              onRefreshAllData={fetchAppData}
              onOpenChat={handleOpenChatForCustomer}
            />
          )}

          {activeTab === 'chat' && (
            <WhatsAppChat
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelectCustomer={(id) => setSelectedCustomerId(id)}
              botConfig={botConfig}
              isWhatsAppConnected={isConnected}
              onOpenConnection={() => setActiveTab('whatsapp')}
              onRefreshData={fetchAppData}
            />
          )}

          {activeTab === 'spreadsheet' && (
            <CustomerSpreadsheet
              customers={customers}
              onOpenChat={handleOpenChatForCustomer}
              onRefreshData={fetchAppData}
            />
          )}

          {activeTab === 'followup' && (
            <FollowUpManager
              customers={customers}
              botConfig={botConfig}
              onRefreshData={fetchAppData}
              onOpenChat={handleOpenChatForCustomer}
              onOpenSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'config' && (
            <BotPromptConfig
              botConfig={botConfig}
              connectionState={connectionState}
              onOpenConnection={() => setActiveTab('whatsapp')}
              onRefreshData={fetchAppData}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsModelConfig
              botConfig={botConfig}
              connectionState={connectionState}
              onRefreshData={fetchAppData}
              onRefreshConnection={fetchWhatsAppStatus}
            />
          )}
        </div>
      </main>
    </div>
  );
}
