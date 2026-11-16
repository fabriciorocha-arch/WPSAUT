import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Sliders,
  Copy,
  Check,
  QrCode,
  Smartphone,
  Save,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  Send,
  Zap,
} from 'lucide-react';
import { BotConfig, WhatsAppConnectionState } from '../types/index.ts';
import { formatAiEngineLabel } from '../utils/ai-engine-utils.ts';

interface BotPromptConfigProps {
  botConfig: BotConfig;
  connectionState: WhatsAppConnectionState;
  onOpenConnection: () => void;
  onRefreshData: () => void;
}

export const BotPromptConfig: React.FC<BotPromptConfigProps> = ({
  botConfig,
  connectionState,
  onOpenConnection,
  onRefreshData,
}) => {
  const [name, setName] = useState(botConfig.name);
  const [persona, setPersona] = useState(botConfig.persona);
  const [systemPrompt, setSystemPrompt] = useState(botConfig.systemPrompt);
  const [welcomeMessage, setWelcomeMessage] = useState(botConfig.welcomeMessage);
  const [niche, setNiche] = useState(botConfig.niche || 'geral');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setName(botConfig.name);
    setPersona(botConfig.persona);
    setSystemPrompt(botConfig.systemPrompt);
    setWelcomeMessage(botConfig.welcomeMessage);
    setNiche(botConfig.niche || 'geral');
  }, [
    botConfig.name,
    botConfig.persona,
    botConfig.systemPrompt,
    botConfig.welcomeMessage,
    botConfig.niche,
  ]);

  // Pre-made system prompt templates for different business niches
  const presets = [
    {
      id: 'varejo',
      title: 'Vendas & E-commerce',
      description: 'Focado em conversão de pedidos, tirar dúvidas sobre frete, prazo e formas de pagamento.',
      name: 'Sofia - Consultora de Vendas',
      persona: 'Vendedora empática, ágil, persuasiva e prestativa.',
      prompt: `Você é a Sofia, consultora oficial de vendas no WhatsApp da nossa loja.
Seus objetivos:
1. Saudação calorosa e descobrir rapidamente o que o cliente procura.
2. Apresentar os produtos disponíveis com valores (ex: Plano Básico R$ 97/mês, Plano Pro R$ 197/mês, Plano VIP R$ 397/mês).
3. Tirar dúvidas sobre parcelamento em até 12x no cartão ou 5% de desconto no Pix.
4. Conduzir o cliente para finalizar o pedido enviando o link de pagamento.
5. Manter respostas curtas (máximo 3 a 4 linhas por mensagem) e no estilo WhatsApp.`,
    },
    {
      id: 'saude',
      title: 'Clínica & Consultas',
      description: 'Atendimento humanizado para agendamento de consultas e exames com verificação de convênios.',
      name: 'Dra. Julia (Assistente da Clínica)',
      persona: 'Acolhedora, cuidadosa, profissional da área da saúde.',
      prompt: `Você é a Julia, assistente virtual da Clínica Saúde & Bem-Estar no WhatsApp.
Seus objetivos:
1. Cumprimentar com gentileza e respeito.
2. Perguntar qual especialidade médica ou exame o paciente necessita.
3. Informar que atendemos particular e os principais convênios (Unimed, Bradesco, Amil, SulAmérica).
4. Propor horários vagos (Segunda a Sexta, das 08h às 18h).
5. Confirmar nome completo e CPF do paciente para concluir o agendamento.`,
    },
    {
      id: 'servicos',
      title: 'Prestação de Serviços & B2B',
      description: 'Qualificação de leads empresariais, orçamento de projetos e agendamento de diagnóstico.',
      name: 'Lucas - Especialista Comercial',
      persona: 'Consultor corporativo, técnico, focado em entender a dor da empresa.',
      prompt: `Você é o Lucas, consultor corporativo da nossa empresa de soluções tecnológicas.
Seus objetivos:
1. Compreender o tamanho da equipe do cliente e o desafio que desejam resolver.
2. Explicar como nossa solução reduz custos operacionais em até 40% no primeiro mês.
3. Se o cliente for qualificado (orçamento acima de R$ 1.500), convidar para reunião online de 15 minutos com um especialista.
4. Se o cliente perguntar de preços, fornecer as faixas de investimento e solicitar o e-mail corporativo.`,
    },
    {
      id: 'imobiliaria',
      title: 'Imobiliária & Locação',
      description: 'Captação e atendimento de pessoas interessadas em comprar, alugar ou financiar imóveis.',
      name: 'Marina - Consultora Imobiliária',
      persona: 'Especialista no mercado imobiliário da região, atenciosa e proativa.',
      prompt: `Você é a Marina, consultora da imobiliária no WhatsApp.
Seus objetivos:
1. Perguntar se o interesse é para Compra ou Aluguel, e qual bairro/região prefere.
2. Perguntar faixa de valor desejada e quantidade de quartos/vagas.
3. Apresentar opções compatíveis e enviar detalhes.
4. Convidar o cliente para uma visita presencial sem compromisso com nossos corretores credenciados.`,
    },
  ];

  const handleApplyPreset = (preset: typeof presets[0]) => {
    setName(preset.name);
    setPersona(preset.persona);
    setSystemPrompt(preset.prompt);
    setNiche(preset.id as any);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          persona,
          systemPrompt,
          welcomeMessage,
          niche,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onRefreshData();
      }
    } catch (err) {
      console.error('Error saving bot config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-emerald-600" />
            Configuração da IA (Prompt & WhatsApp)
          </h2>
          <p className="text-sm text-slate-500">
            Ensine seu robô o que dizer aos clientes, tom de voz, regras de atendimento e conecte com o WhatsApp.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-xs transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Salvando...' : saveSuccess ? 'Salvo com Sucesso! ✓' : 'Salvar Prompt'}
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-medium">
          ✓ Prompt e configurações atualizados! A IA responderá imediatamente usando essas instruções.
        </div>
      )}

      {/* Preset Cards */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Modelos Prontos por Nicho (Clique para aplicar):
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleApplyPreset(p)}
              className={`text-left p-3.5 rounded-xl border transition-all text-xs ${
                niche === p.id
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <span className="font-bold text-slate-800 block mb-1">{p.title}</span>
              <p className="text-slate-500 leading-snug line-clamp-2">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Form: Prompt & Persona */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Instruções de Comportamento (Prompt)
            </h3>
            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Motor: {formatAiEngineLabel(botConfig.aiEngine)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Assistente no WhatsApp
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Sofia - Consultora Comercial"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Persona / Perfil do Atendente
              </label>
              <input
                type="text"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Ex: Especialista em vendas, paciente e focado em soluções"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Prompt Principal (O que ensinar ao robô):
              </label>
              <span className="text-[11px] text-slate-400">
                Quanto mais detalhado, mais assertiva a IA
              </span>
            </div>
            <textarea
              rows={11}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Digite aqui como o bot deve se comportar, produtos que vende, valores, políticas de troca, objeções comuns..."
              className="w-full px-3.5 py-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800 leading-relaxed"
            />
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <span className="font-bold text-slate-800 block mb-1">Dicas para um prompt de alta conversão:</span>
            <p>• Inclua a tabela de produtos/planos com valores claros.</p>
            <p>• Especifique quando um cliente deve ser considerado "Convertido" (ex: "quando solicitar o link de pagamento ou agendar").</p>
            <p>• Adicione a instrução para não inventar informações caso não saiba a resposta.</p>
          </div>
        </div>

        {/* WhatsApp Connection Card */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                Integração WhatsApp Webhook
              </h3>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Conecte seu WhatsApp oficial da Meta Cloud API, Evolution API, Z-API ou Baileys para receber e responder mensagens reais automaticamente.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  URL do Webhook (Copie para seu WhatsApp):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-600 font-mono text-[11px] truncate"
                  />
                  <button
                    onClick={handleCopyWebhook}
                    className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold shrink-0 transition-colors"
                  >
                    {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Verify Token (Meta Cloud API):
                </label>
                <code className="block px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] text-slate-700">
                  zapflow_token_secret
                </code>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Número Conectado:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {connectionState.connectedPhone || 'Nenhum vinculado'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Status da Sessão:</span>
                  <span
                    className={`font-semibold ${
                      connectionState.status === 'connected'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {connectionState.status === 'connected'
                      ? 'Online & Conectado ✓'
                      : 'Desconectado'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenConnection}
                  className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {connectionState.status === 'connected'
                    ? 'Gerenciar Conexão WhatsApp'
                    : 'Conectar Meu WhatsApp (QR Code)'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-2">
            <span className="font-bold flex items-center gap-1.5 text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Segurança & API Server-side
            </span>
            <p className="leading-relaxed">
              Todas as chamadas à inteligência artificial são processadas diretamente no servidor através da SDK oficial <code>@google/genai</code>, mantendo a credencial segura e as respostas criptografadas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
