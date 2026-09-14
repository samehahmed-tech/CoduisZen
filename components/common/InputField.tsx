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
                <label className="text-xs font-bold text-muted flex items-center gap-1">
                    {label}
                    {required && <span className="text-rose-500" aria-hidden="true">*</span>}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <Icon size={15} className={`absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150 ${hasError ? 'text-rose-500' : 'text-muted'}`} />
                )}
                <input
                    type={type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? undefined : undefined}
                    className={`w-full ${Icon ? 'ps-9' : 'ps-3.5'} pe-3.5 py-2.5 min-h-[40px] glass-input theme-input rounded-xl text-[13px] font-semibold text-main placeholder-muted/60 outline-none ${hasError ? '!border-rose-500/60' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
            </div>
            {error && (
                <p role="alert" className="ux-field-error text-xs text-rose-500 font-semibold flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" /> {error}
                </p>
            )}
            {!error && helperText && (
                <p className="text-[11px] text-muted leading-relaxed">{helperText}</p>
            )}
        </div>
    );
};

export default InputField;
