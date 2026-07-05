import React from 'react';
import { AlertCircle } from 'lucide-react';

interface InputFieldProps {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    icon?: React.FC<{ size?: number; className?: string }>;
    className?: string;
}

/**
 * Styled InputField with label, error display, helper text, and icon support.
 *
 * Usage:
 *   <InputField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} required />
 *   <InputField label="Amount" value={amt} onChange={setAmt} icon={DollarSign} helperText="Enter amount in LE" />
 */
const InputField: React.FC<InputFieldProps> = ({
    label, error, helperText, required, type = 'text', value, onChange, placeholder, disabled, icon: Icon, className = '',
}) => {
    const hasError = !!error;

    return (
        <div className={`space-y-1.5 ${className}`}>
            {label && (
                <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] flex items-center gap-1">
                    {label}
                    {required && <span className="text-rose-500">*</span>}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <Icon size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${hasError ? 'text-rose-500' : 'text-muted'}`} />
                )}
                <input
                    type={type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-3.5 py-2.5 glass-input rounded-xl text-xs font-bold text-main placeholder-muted/60 outline-none transition-all duration-150 ${hasError ? '!border-rose-500/50 focus:!ring-rose-500/20 focus:!ring-2' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
            </div>
            {error && (
                <p className="text-[9px] text-rose-500 font-bold flex items-center gap-1">
                    <AlertCircle size={10} /> {error}
                </p>
            )}
            {!error && helperText && (
                <p className="text-[8px] text-muted">{helperText}</p>
            )}
        </div>
    );
};

export default InputField;
