import React from 'react';
import { Check } from 'lucide-react';

interface Step {
    key: string;
    label: string;
    icon?: React.FC<{ size?: number; className?: string }>;
}

interface StepperProps {
    steps: Step[];
    currentStep: number;
    onStepClick?: (index: number) => void;
}

/**
 * Multi-step progress indicator for forms and wizards.
 *
 * Usage:
 *   <Stepper steps={[{ key: 'info', label: 'Info' }, { key: 'review', label: 'Review' }]} currentStep={1} />
 */
const Stepper: React.FC<StepperProps> = ({ steps, currentStep, onStepClick }) => {
    return (
        <div className="flex items-center w-full">
            {steps.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === currentStep;
                const Icon = step.icon;
                const isClickable = onStepClick && isDone;

                return (
                    <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                            <button
                                onClick={() => isClickable && onStepClick(i)}
                                disabled={!isClickable}
                                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-all ${isDone ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : isActive ? 'bg-primary text-white shadow-sm shadow-primary/20 scale-110' : 'bg-elevated/40 text-muted border border-border/50'} ${isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
                            >
                                {isDone ? <Check size={16} /> : Icon ? <Icon size={14} /> : i + 1}
                            </button>
                            <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-primary' : isDone ? 'text-emerald-500' : 'text-muted'}`}>
                                {step.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`flex-1 h-[2px] mx-2 rounded-full transition-colors ${isDone ? 'bg-emerald-500' : 'bg-border/50'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default Stepper;
