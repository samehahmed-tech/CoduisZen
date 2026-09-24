import React, { useState } from 'react';
import { X, ChevronRight, Lock, Unlock, Fingerprint } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { approvalsApi } from '@/services/api/approval';
import { translations } from '@/services/translations';
import { motion, AnimatePresence } from 'framer-motion';

interface ManagerApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApproved: (approval?: { id: number }) => void;
    actionName: string;
    referenceId?: string;
    credentialType?: 'pin' | 'password';
}

export const ManagerApprovalModal: React.FC<ManagerApprovalModalProps> = ({ isOpen, onClose, onApproved, actionName, referenceId, credentialType = 'pin' }) => {
    const [credential, setCredential] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const settings = useAuthStore(state => state.settings);
    const t = translations[settings.language];
    const isRTL = settings.language === 'ar';
    const isCredentialComplete = credentialType === 'password' ? credential.length >= 6 : credential.length >= 4;

    if (!isOpen) return null;

    const closeModal = () => {
        setCredential('');
        setError('');
        onClose();
    };

    const handleSubmit = async () => {
        if (!isCredentialComplete) return;
        setLoading(true);
        setError('');
        try {
            const request = {
                branchId: settings.activeBranchId || 'b1',
                action: actionName,
                relatedId: referenceId,
            };
            const res = credentialType === 'password'
                ? await approvalsApi.verifyPassword({ ...request, password: credential })
                : await approvalsApi.verifyPin({ ...request, pin: credential });

            if (res.approved) {
                onApproved(res.approval);
                closeModal();
            } else {
                setError(res.error || (credentialType === 'password' ? 'Invalid manager password' : 'Invalid Manager PIN'));
                setCredential('');
            }
        } catch (err) {
            setError('Verification failed');
            setCredential('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[700] flex items-center justify-center theme-modal-overlay p-2 sm:p-3">
                <div className="absolute inset-0" onClick={closeModal} />
                
                <motion.div
                    initial={{ y: "100%", scale: 1 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 1 }} transition={{ type: "spring", duration: 0.15 }}
                    className={`theme-modal-content w-full max-w-sm relative overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] ${isRTL ? 'text-right' : 'text-left'}`}
                >
                    <div className="p-5 sm:p-8 relative overflow-y-auto pos-scroll">
                        {/* Close button */}
                        <div className="absolute top-4 right-4">
                            <button onClick={closeModal} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all active:scale-90" aria-label={isRTL ? 'إغلاق' : 'Close'}>
                                <X size={22} />
                            </button>
                        </div>

                        <div className="text-center mb-6 sm:mb-8">
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6">
                                <div className="absolute inset-0 bg-amber-500/10 rounded-[2rem] shadow-[0_0_20px_rgba(245,158,11,0.2)]" />
                                <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-amber-500 rounded-[2rem] flex items-center justify-center shadow-lg border border-amber-400">
                                    {isCredentialComplete && !loading ? <Unlock className="w-8 h-8 sm:w-10 sm:h-10 text-white" /> : <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                                </div>
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-main uppercase tracking-tighter leading-tight">
                                {isRTL ? 'تأكيد الصلاحية' : 'SecurID Access'}
                            </h2>
                            <div className="mt-3 flex justify-center">
                                <span className="text-[10px] font-black text-amber-600 bg-amber-600/10 px-4 py-1.5 rounded-full border border-amber-600/20 uppercase tracking-widest">
                                    {isRTL ? 'مطلوب إذن مدير' : 'MANAGER_AUTH'}
                                </span>
                            </div>
                            <p className="mt-3 sm:mt-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                                {actionName.replace(/_/g, ' ')}
                            </p>
                        </div>

                        {error && (
                            <motion.p 
                                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                className="text-rose-500 text-[10px] font-black uppercase tracking-widest text-center mb-5 sm:mb-8 bg-rose-500/10 py-3 rounded-2xl border border-rose-500/20 px-4"
                            >
                                {error}
                            </motion.p>
                        )}

                        <form onSubmit={event => { event.preventDefault(); void handleSubmit(); }} className="space-y-3">
                            <input
                                type="password"
                                inputMode={credentialType === 'password' ? 'text' : 'numeric'}
                                autoComplete={credentialType === 'password' ? 'current-password' : 'off'}
                                autoFocus
                                maxLength={credentialType === 'password' ? 128 : 6}
                                value={credential}
                                onChange={event => setCredential(credentialType === 'password' ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder={credentialType === 'password' ? (isRTL ? 'اكتب باسورد المدير' : 'Enter manager password') : (isRTL ? 'اكتب PIN المدير' : 'Enter manager PIN')}
                                aria-label={credentialType === 'password' ? (isRTL ? 'باسورد المدير' : 'Manager password') : (isRTL ? 'PIN المدير' : 'Manager PIN')}
                                className={`h-14 w-full rounded-2xl border border-border/40 bg-elevated/50 px-5 text-center font-mono text-2xl font-black text-main outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 ${credentialType === 'pin' ? 'tracking-[0.45em]' : 'tracking-normal'}`}
                            />
                            <button 
                                type="submit"
                                disabled={!isCredentialComplete || loading}
                                className={`h-14 w-full rounded-2xl flex items-center justify-center gap-2 text-sm font-black transition-all shadow-lg active:scale-95 ${isCredentialComplete && !loading ? 'bg-primary text-white shadow-primary/30 border border-primary hover:bg-primary-hover' : 'bg-elevated text-muted opacity-50 cursor-not-allowed'}`}
                            >
                                {loading ? <div className="w-7 h-7 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>{isRTL ? 'تأكيد' : 'Verify'}</span><ChevronRight size={22} className={isRTL ? 'rotate-180' : ''} /></>}
                            </button>
                        </form>
                        
                        <div className="mt-5 sm:mt-8 text-center">
                            <div className="flex items-center justify-center gap-2 opacity-30">
                                <Fingerprint size={16} />
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">{isRTL ? 'تأمين بواسطة Xen' : 'SECURED BY XEN'}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
