import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUpRight, ArrowDownRight, ShieldCheck, CreditCard } from 'lucide-react';
import { FinancialAccount } from '../../types';

interface LineItem {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}

interface ManualJournalModalProps {
  onClose: () => void;
  accounts: FinancialAccount[];
  onSubmit: (data: any) => Promise<void>;
  isLoading: boolean;
}

export const ManualJournalModal: React.FC<ManualJournalModalProps> = ({ onClose, accounts, onSubmit, isLoading }) => {
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { id: '1', accountCode: '', debit: 0, credit: 0, description: '' },
    { id: '2', accountCode: '', debit: 0, credit: 0, description: '' }
  ]);

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;
  
  const isValid = isBalanced && description.trim() !== '' && lines.every(l => l.accountCode !== '');

  const addLine = () => {
    setLines([...lines, { id: Date.now().toString(), accountCode: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(lines.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: keyof LineItem, value: any) => {
    setLines(lines.map(l => {
      if (l.id === id) {
        const newLine = { ...l, [field]: value };
        if (field === 'debit' && value > 0) newLine.credit = 0;
        if (field === 'credit' && value > 0) newLine.debit = 0;
        return newLine;
      }
      return l;
    }));
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    const cleanLines = lines.map(({ accountCode, debit, credit }) => ({
      accountCode,
      debit,
      credit,
      description
    }));

    await onSubmit({
      description,
      referenceId: reference || `MANUAL-${Date.now()}`,
      lines: cleanLines
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80  z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -z-10 pointer-events-none" />
        
        {/* Header */}
        <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/20">
              <CreditCard size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-main tracking-tighter uppercase">قيد يومية يدوي</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1 text-amber-500">يتطلب موافقة المدير</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 transition-all border border-border/20 shadow-lg group">
            <X size={20} className="group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted pl-1">الوصف (مطلوب)</label>
              <input className="theme-input w-full px-6 py-4 rounded-2xl text-sm font-black" placeholder="اكتب سبب العملية..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted pl-1">المرجع (اختياري)</label>
              <input className="theme-input w-full px-6 py-4 rounded-2xl text-sm font-black" placeholder="رقم مستند خارجي" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-main">بنود القيد</h4>
              <button onClick={addLine} className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2 hover:text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-xl transition-all">
                <Plus size={14} /> إضافة بند
              </button>
            </div>
            
            <div className="rounded-3xl border border-border/30 overflow-hidden bg-app/50 shadow-inner">
              <div className="grid grid-cols-[auto_1fr_120px_120px_60px] gap-4 p-4 border-b border-border/20 bg-elevated/40 items-center">
                <div className="w-8"></div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">الحساب</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 text-right">مدين</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 text-right">دائن</div>
                <div></div>
              </div>
              
              <div className="divide-y divide-border/20">
                {lines.map((line, index) => (
                  <div key={line.id} className="grid grid-cols-[auto_1fr_120px_120px_60px] gap-4 p-4 items-center group hover:bg-elevated/20 transition-colors">
                    <div className="w-8 text-[10px] font-black text-muted text-center">{index + 1}</div>
                    
                    <select 
                      className="w-full bg-transparent border-none text-sm font-black text-main outline-none cursor-pointer appearance-none truncate"
                      value={line.accountCode}
                      onChange={(e) => updateLine(line.id, 'accountCode', e.target.value)}
                    >
                      <option value="">-- Select Account --</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.code}>{a.code} · {a.name}</option>
                      ))}
                    </select>

                    <div className="relative">
                       <input 
                         type="number" 
                         className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-black tabular-nums text-right text-emerald-500 focus:border-emerald-500 focus:outline-none"
                         value={line.debit || ''}
                         onChange={(e) => updateLine(line.id, 'debit', Number(e.target.value))}
                       />
                    </div>
                    
                    <div className="relative">
                       <input 
                         type="number" 
                         className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2 text-sm font-black tabular-nums text-right text-rose-500 focus:border-rose-500 focus:outline-none"
                         value={line.credit || ''}
                         onChange={(e) => updateLine(line.id, 'credit', Number(e.target.value))}
                       />
                    </div>

                    <button 
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 2}
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-20 transition-all mx-auto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[auto_1fr_120px_120px_60px] gap-4 p-5 bg-elevated/80 border-t border-border/30 items-center">
                <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted text-right pr-4">Totals</div>
                <div className="text-base font-black tabular-nums text-right text-emerald-500">{totalDebit.toFixed(2)}</div>
                <div className="text-base font-black tabular-nums text-right text-rose-500">{totalCredit.toFixed(2)}</div>
                <div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/20 bg-elevated/40 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
             {isBalanced ? (
               <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-xl">
                 <ShieldCheck size={16} /> Balanced
               </span>
             ) : (
               <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-500 bg-rose-500/10 px-4 py-2 rounded-xl">
                 Out of Balance ({(totalDebit - totalCredit).toFixed(2)})
               </span>
             )}
          </div>
          
          <button 
            disabled={!isValid || isLoading}
            onClick={handleSubmit} 
            className="theme-btn theme-btn-primary ml-auto flex items-center gap-3 disabled:opacity-50"
          >
            {isLoading ? 'SUBMITTING...' : 'SUBMIT FOR APPROVAL'}
          </button>
        </div>
      </div>
    </div>
  );
};
