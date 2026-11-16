import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Plus,
  Search,
  Filter,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  Trash2,
  Edit2,
  Check,
  X,
  Star,
  ChevronDown,
  Bot,
  PauseCircle,
  Users,
} from 'lucide-react';
import { Customer, CustomerStatus, FunnelStage } from '../types/index.ts';
import {
  formatCurrencyBRL,
  formatPhoneBR,
  generateCustomersCSV,
} from '../utils/crm-analytics.ts';

interface CustomerSpreadsheetProps {
  customers: Customer[];
  onOpenChat: (customerId: string) => void;
  onRefreshData: () => void;
}

export const CustomerSpreadsheet: React.FC<CustomerSpreadsheetProps> = ({
  customers,
  onOpenChat,
  onRefreshData,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'contatos' | 'grupos'>('todos');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // New customer form state
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDealValue, setNewCustDealValue] = useState(1000);
  const [newCustProduct, setNewCustProduct] = useState('');

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.aiSummary.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      selectedStatus === 'todos' ? true : c.status === selectedStatus;

    const matchesType =
      typeFilter === 'grupos'
        ? Boolean(c.isGroup)
        : typeFilter === 'contatos'
        ? !c.isGroup
        : true;

    return matchesSearch && matchesStatus && matchesType;
  });

  const handleExportCSV = () => {
    const csvContent = generateCustomersCSV(customers);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `zapflow-planilha-clientes-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateStatus = async (customerId: string, status: CustomerStatus) => {
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Error updating customer:', err);
    }
  };

  const handleUpdateFunnel = async (customerId: string, funnelStage: FunnelStage) => {
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelStage }),
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Error updating funnel stage:', err);
    }
  };

  const handleToggleCustomerAi = async (cust: Customer) => {
    try {
      const res = await fetch(`/api/customers/${cust.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: cust.aiEnabled === false }),
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Error toggling customer AI:', err);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Error deleting customer:', err);
    }
  };

  const handleResetAll = async () => {
    try {
      const res = await fetch('/api/reset-data', { method: 'POST' });
      if (res.ok) {
        setConfirmReset(false);
        onRefreshData();
      }
    } catch (err) {
      console.error('Error resetting data:', err);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName,
          phone: newCustPhone.replace(/\D/g, ''),
          email: newCustEmail,
          dealValue: Number(newCustDealValue) || 0,
          productInterest: newCustProduct,
          status: 'novo',
          funnelStage: 'descoberta',
          aiSummary: 'Cliente adicionado manualmente na planilha',
          nextAction: 'Iniciar conversa no WhatsApp',
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustEmail('');
        setNewCustDealValue(1000);
        setNewCustProduct('');
        onRefreshData();
      }
    } catch (err) {
      console.error('Error adding customer:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Planilha de Clientes (CRM em Tempo Real)
          </h2>
          <p className="text-sm text-slate-500">
            Acompanhe o status de cada lead, histórico da IA, valor e satisfação do follow-up.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {customers.length > 0 && (
            confirmReset ? (
              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg text-xs">
                <span className="text-rose-800 font-medium">Zerar tudo?</span>
                <button
                  onClick={handleResetAll}
                  className="px-2 py-0.5 bg-rose-600 text-white font-semibold rounded hover:bg-rose-700"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-200 rounded"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Zerar Planilha
              </button>
            )
          )}

          <button
            onClick={handleExportCSV}
            disabled={customers.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 rounded-lg shadow-xs transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Exportar CSV / Excel
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Linha
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            aria-label="Pesquisar na planilha"
            placeholder="Pesquisar por nome, WhatsApp, interesse ou resumo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200 shrink-0">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'contatos', label: 'Contatos' },
              { id: 'grupos', label: 'Grupos' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id as any)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  typeFilter === t.id
                    ? 'bg-indigo-100 text-indigo-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {[
            { id: 'todos', label: 'Todos Status' },
            { id: 'novo', label: 'Novos' },
            { id: 'em_atendimento', label: 'Em Atendimento' },
            { id: 'interessado', label: 'Interessados' },
            { id: 'aguardando_followup', label: 'Aguardando Follow-up' },
            { id: 'convertido', label: 'Convertidos' },
            { id: 'perdido', label: 'Perdidos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1 rounded-md font-medium shrink-0 transition-colors ${
                selectedStatus === tab.id
                  ? 'bg-emerald-100 text-emerald-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spreadsheet Table View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 select-none">
                <th className="py-3 px-3.5 border-r border-slate-200 w-12 text-center">#</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[180px]">Nome do Cliente</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[140px]">WhatsApp</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[130px]">IA no WhatsApp</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[160px]">Status (CRM)</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[140px]">Etapa do Funil</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[120px]">Valor (R$)</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[130px]">Satisfação 24h</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[220px]">Resumo da IA (Gemini)</th>
                <th className="py-3 px-4 border-r border-slate-200 min-w-[180px]">Próximo Passo</th>
                <th className="py-3 px-3.5 text-center min-w-[100px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-normal text-slate-800">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    Nenhum cliente encontrado nesta visualização.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust, idx) => (
                  <tr
                    key={cust.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Row Index */}
                    <td className="py-2.5 px-3.5 border-r border-slate-200 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>

                    {/* Customer / Group Name */}
                    <td className="py-2.5 px-4 border-r border-slate-200 font-medium">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-[10px] shrink-0 ${
                            cust.isGroup
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {cust.isGroup ? <Users className="w-3.5 h-3.5" /> : cust.name.slice(0, 1)}
                        </div>
                        <span className="truncate max-w-[150px] font-semibold text-slate-900">
                          {cust.name}
                        </span>
                        {cust.isGroup && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[10px] font-semibold shrink-0">
                            Grupo
                          </span>
                        )}
                      </div>
                      {cust.email && (
                        <span className="text-[11px] text-slate-400 block truncate">
                          {cust.email}
                        </span>
                      )}
                    </td>

                    {/* Phone or Group */}
                    <td className="py-2.5 px-4 border-r border-slate-200 font-mono text-[11px] text-slate-600">
                      {cust.isGroup
                        ? cust.participantCount
                          ? `Grupo (${cust.participantCount} membros)`
                          : 'Grupo WhatsApp'
                        : formatPhoneBR(cust.phone)}
                    </td>

                    {/* Per-customer AI Toggle */}
                    <td className="py-2.5 px-4 border-r border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleToggleCustomerAi(cust)}
                        title={
                          cust.aiEnabled === false
                            ? 'Clique para reativar a IA para este cliente'
                            : 'Clique para pausar a IA apenas para este cliente'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          cust.aiEnabled === false
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300'
                        }`}
                      >
                        {cust.aiEnabled === false ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" />
                            IA Pausada
                          </>
                        ) : (
                          <>
                            <Bot className="w-3.5 h-3.5" />
                            IA Ativa
                          </>
                        )}
                      </button>
                    </td>

                    {/* Status Select */}
                    <td className="py-2.5 px-4 border-r border-slate-200">
                      <select
                        value={cust.status}
                        onChange={(e) => handleUpdateStatus(cust.id, e.target.value as CustomerStatus)}
                        className={`text-xs px-2 py-1 rounded font-semibold border focus:outline-none focus:ring-1 cursor-pointer ${
                          cust.status === 'convertido'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : cust.status === 'interessado'
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : cust.status === 'aguardando_followup'
                            ? 'bg-purple-50 text-purple-700 border-purple-300'
                            : cust.status === 'em_atendimento'
                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                            : cust.status === 'perdido'
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : 'bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        <option value="novo">Novo Lead</option>
                        <option value="em_atendimento">Em Atendimento</option>
                        <option value="interessado">Interessado</option>
                        <option value="aguardando_followup">Aguardando Follow-up</option>
                        <option value="convertido">Convertido / Ganho</option>
                        <option value="perdido">Perdido</option>
                      </select>
                    </td>

                    {/* Funnel Stage */}
                    <td className="py-2.5 px-4 border-r border-slate-200">
                      <select
                        value={cust.funnelStage}
                        onChange={(e) => handleUpdateFunnel(cust.id, e.target.value as FunnelStage)}
                        className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-medium capitalize focus:outline-none cursor-pointer"
                      >
                        <option value="descoberta">1. Descoberta</option>
                        <option value="qualificacao">2. Qualificação</option>
                        <option value="proposta">3. Proposta</option>
                        <option value="fechamento">4. Fechamento</option>
                        <option value="pos_venda">5. Pós-Venda</option>
                      </select>
                    </td>

                    {/* Deal Value */}
                    <td className="py-2.5 px-4 border-r border-slate-200 font-mono font-semibold text-slate-800">
                      {formatCurrencyBRL(cust.dealValue)}
                    </td>

                    {/* CSAT Rating */}
                    <td className="py-2.5 px-4 border-r border-slate-200">
                      {cust.csatRating ? (
                        <div className="flex items-center gap-1">
                          <span className="text-amber-500 font-bold">
                            {'★'.repeat(cust.csatRating)}
                          </span>
                          <span className="text-slate-500 text-[11px]">({cust.csatRating}/5)</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">
                          {cust.followUpSent ? 'Aguardando nota' : 'Programado 24h'}
                        </span>
                      )}
                    </td>

                    {/* AI Summary */}
                    <td className="py-2.5 px-4 border-r border-slate-200 text-slate-600 text-[11.5px] max-w-xs">
                      <span className="line-clamp-2" title={cust.aiSummary}>
                        {cust.aiSummary || 'Sem resumo registrado'}
                      </span>
                    </td>

                    {/* Next Action */}
                    <td className="py-2.5 px-4 border-r border-slate-200 text-slate-700 font-medium text-[11.5px]">
                      <span className="truncate block" title={cust.nextAction}>
                        {cust.nextAction || 'Continuar atendimento'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenChat(cust.id)}
                          title="Abrir no WhatsApp"
                          className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(cust.id)}
                          title="Excluir da Planilha"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Spreadsheet Footer Summary Bar */}
        <div className="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 font-mono">
          <div className="flex items-center gap-4">
            <span>Total de Linhas: <strong>{filteredCustomers.length}</strong></span>
            <span>Total em Pipeline: <strong>{formatCurrencyBRL(filteredCustomers.reduce((acc, c) => acc + c.dealValue, 0))}</strong></span>
          </div>
          <div className="text-[11px] text-slate-500">
            Atualização sincronizada automaticamente com o WhatsApp
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Adicionar Novo Cliente à Planilha
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ana Carolina Silva"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Número WhatsApp (com DDD) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 5511999998888"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  E-mail (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="ana@empresa.com"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="number"
                    value={newCustDealValue}
                    onChange={(e) => setNewCustDealValue(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Produto / Interesse
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Plano Pro Anual"
                    value={newCustProduct}
                    onChange={(e) => setNewCustProduct(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
