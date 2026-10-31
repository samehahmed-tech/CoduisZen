import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { aiApi } from '../../services/api/ai';
import { useAIWidgetStore } from '../../stores/useAIWidgetStore';
import { useAuthStore } from '../../stores/useAuthStore';

const PULSE_INTERVAL_MS = 15 * 60 * 1000;
const PULSE_DELAY_MS = 45 * 1000;

const AIAutonomyPulse: React.FC = () => {
    const location = useLocation();
    const language = useAuthStore((state) => state.settings.language || 'en') as 'ar' | 'en';
    const branchId = useAuthStore((state) => state.settings.activeBranchId || 'default');
    const addWidget = useAIWidgetStore((state) => state.addWidget);
    const toggleAssistant = useAIWidgetStore((state) => state.toggleAssistant);

    useEffect(() => {
        let cancelled = false;
        let interval: number | undefined;
        const storageKey = `restoflow-ai-pulse:${branchId}`;

        const runPulse = async () => {
            if (cancelled) return;
            const previous = Number(sessionStorage.getItem(storageKey) || 0);
            if (Date.now() - previous < PULSE_INTERVAL_MS) return;
            const status = await aiApi.getRuntimeStatus().catch(() => null);
            if (cancelled || !status?.enabled) return;
            sessionStorage.setItem(storageKey, String(Date.now()));

            const moduleName = location.pathname.split('/').filter(Boolean).pop() || 'dashboard';
            const prompt = language === 'ar'
                ? `اعمل فحصًا تشغيليًا هادئًا للفرع الحالي داخل وحدة ${moduleName}. استخدم بيانات النظام الحديثة. أعد تنبيهًا واحدًا فقط إذا وجدت مشكلة عالية الأهمية أو فرصة واضحة تتطلب انتباه المستخدم الآن، وإلا أعد النص NO_ALERT. لا تقترح إجراءً خطيرًا ولا تدّعي تنفيذ أي شيء. اجعل التنبيه مختصرًا وعمليًا.`
                : `Run a quiet operational pulse for the current branch in the ${moduleName} module. Use fresh system data. Return one alert only for a high-signal issue or clear opportunity that needs attention now; otherwise return exactly NO_ALERT. Do not suggest risky execution or claim anything was executed. Keep it concise and practical.`;
            const response = await aiApi.chat({ message: prompt, lang: language, context: { surface: moduleName, mode: 'proactive-pulse' } }).catch(() => null);
            const text = String(response?.text || '').trim();
            if (cancelled || !text || text === 'NO_ALERT' || text.includes('NO_ALERT')) return;
            addWidget({
                type: 'insight',
                content: text,
                actionLabel: language === 'ar' ? 'فتح المساعد للتفاصيل' : 'Open assistant for details',
                onAction: () => toggleAssistant(true),
            });
        };

        const start = window.setTimeout(() => {
            void runPulse();
            interval = window.setInterval(() => void runPulse(), PULSE_INTERVAL_MS);
        }, PULSE_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(start);
            if (interval) window.clearInterval(interval);
        };
    }, [addWidget, branchId, language, location.pathname, toggleAssistant]);

    return null;
};

export default AIAutonomyPulse;
