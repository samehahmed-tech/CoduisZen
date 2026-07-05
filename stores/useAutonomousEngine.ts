import { create } from 'zustand';

interface KPIs {
    revenueDrop: boolean;
    orderDelaySpikes: boolean;
    peakLoad: boolean;
}

interface AutonomousState {
    kpis: KPIs;
    setKPI: (key: keyof KPIs, value: boolean) => void;
    // Decision Engine inputs
    decisionEngine: {
        evaluateAction: (actionType: 'safe' | 'medium' | 'risky') => 'auto-execute' | 'suggest' | 'require-approval';
    };
}

export const useAutonomousEngine = create<AutonomousState>((set) => ({
    kpis: {
        revenueDrop: false,
        orderDelaySpikes: false,
        peakLoad: false,
    },
    setKPI: (key, value) => set((state) => ({ kpis: { ...state.kpis, [key]: value } })),
    decisionEngine: {
        evaluateAction: (actionType) => {
            if (actionType === 'safe') return 'auto-execute';
            if (actionType === 'medium') return 'suggest';
            return 'require-approval';
        }
    }
}));
