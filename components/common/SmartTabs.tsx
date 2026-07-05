import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_SECTIONS } from './navigation';
import { useAuthStore } from '../../stores/useAuthStore';

interface SmartTabsProps {
    paths: string[];
    activePath: string;
}

const SmartTabs: React.FC<SmartTabsProps> = ({ paths, activePath }) => {
    const navigate = useNavigate();
    const lang = useAuthStore(s => s.settings.language) || 'en';

    const getLabel = (path: string) => {
        for (const section of NAV_SECTIONS) {
            const match = section.items.find(i => i.path === path);
            if (match) return lang === 'ar' ? match.labelAr : match.label;
        }
        return path;
    };

    if (paths.length === 0) return null;

    return (
        <div className="smart-tabs">
            {paths.map(p => {
                const label = getLabel(p);
                const isActive = activePath === p;
                return (
                    <button
                        key={p}
                        onClick={() => navigate(p)}
                        className={`smart-tab ${isActive ? 'active' : ''}`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

export default SmartTabs;

