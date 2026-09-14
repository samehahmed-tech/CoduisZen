import React, { useState } from 'react';

interface CalculatorWidgetProps {
    onClose?: () => void;
    isCompact?: boolean;
}

const CalculatorWidget: React.FC<CalculatorWidgetProps> = ({ onClose, isCompact }) => {
    const [display, setDisplay] = useState('0');
    const [equation, setEquation] = useState('');

    const evaluateExpression = (input: string): number => {
        const tokens = input.match(/\d+(\.\d+)?|[+\-*/()]/g) || [];
        if (tokens.join('') !== input.replace(/\s+/g, '')) {
            throw new Error('Invalid expression');
        }

        const output: string[] = [];
        const operators: string[] = [];
        const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

        for (const token of tokens) {
            if (/^\d+(\.\d+)?$/.test(token)) {
                output.push(token);
                continue;
            }
            if (token in precedence) {
                while (
                    operators.length > 0 &&
                    operators[operators.length - 1] in precedence &&
                    precedence[operators[operators.length - 1]] >= precedence[token]
                ) {
                    output.push(operators.pop() as string);
                }
                operators.push(token);
                continue;
            }
            if (token === '(') {
                operators.push(token);
                continue;
            }
            if (token === ')') {
                while (operators.length > 0 && operators[operators.length - 1] !== '(') {
                    output.push(operators.pop() as string);
                }
                if (operators.pop() !== '(') {
                    throw new Error('Mismatched parentheses');
                }
            }
        }

        while (operators.length > 0) {
            const op = operators.pop() as string;
            if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
            output.push(op);
        }

        const stack: number[] = [];
        for (const token of output) {
            if (/^\d+(\.\d+)?$/.test(token)) {
                stack.push(Number(token));
                continue;
            }
            const b = stack.pop();
            const a = stack.pop();
            if (a === undefined || b === undefined) throw new Error('Invalid expression');
            if (token === '+') stack.push(a + b);
            else if (token === '-') stack.push(a - b);
            else if (token === '*') stack.push(a * b);
            else if (token === '/') {
                if (b === 0) throw new Error('Division by zero');
                stack.push(a / b);
            }
        }

        if (stack.length !== 1 || Number.isNaN(stack[0])) throw new Error('Invalid expression');
        return stack[0];
    };

    const handleInput = (char: string) => {
        if (char === 'C') {
            setDisplay('0');
            setEquation('');
        } else if (char === '=') {
            try {
                const value = evaluateExpression(equation);
                const result = Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, '');
                setDisplay(result);
                setEquation(result);
            } catch {
                setDisplay('Error');
                setEquation('');
            }
        } else {
            const newEquation = equation === '0' || display === 'Error' ? char : equation + char;
            setEquation(newEquation);
            setDisplay(newEquation);
        }
    };

    const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', 'C', '=', '+'];

    return (
        <div className={`${isCompact ? 'p-2' : 'p-6'} bg-elevated border border-border rounded-[1.5rem] shadow-2xl w-full  bg-opacity-90 animate-in zoom-in duration-150`}>
            {onClose && (
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Scientific Terminal</span>
                    <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-xs font-black uppercase">Close</button>
                </div>
            )}
            <div className={`${isCompact ? 'p-3 mb-3' : 'p-6 mb-6'} bg-app/50 rounded-xl text-right overflow-hidden border border-border shadow-inner`}>
                <p className={`${isCompact ? 'text-[8px]' : 'text-[10px]'} text-primary font-bold uppercase tracking-widest mb-0.5 opacity-70`}>{equation || '0'}</p>
                <p className={`${isCompact ? 'text-xl' : 'text-4xl'} font-black text-main truncate font-mono tracking-tighter`}>{display}</p>
            </div>
            <div className={`grid grid-cols-4 ${isCompact ? 'gap-1.5' : 'gap-4'}`}>
                {keys.map(k => (
                    <button
                        key={k}
                        onClick={() => handleInput(k)}
                        className={`
              ${isCompact ? 'h-10 text-sm rounded-xl' : 'h-16 text-lg rounded-2xl'} flex items-center justify-center font-black transition-all active:scale-90
              ${k === '=' ? 'bg-primary text-white col-span-1 shadow-lg shadow-primary/20 ring-1 ring-white/10' :
                                k === 'C' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20' :
                                    ['/', '*', '-', '+'].includes(k) ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20' :
                                        'bg-card text-main border border-border hover:border-primary/50 shadow-sm'}
            `}
                    >
                        {k}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CalculatorWidget;
