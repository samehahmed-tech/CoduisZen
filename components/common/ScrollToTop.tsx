import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

const ScrollToTop: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const scrollContainer = document.querySelector('.overflow-y-auto');
        if (!scrollContainer) return;

        const handler = () => setVisible(scrollContainer.scrollTop > 400);
        scrollContainer.addEventListener('scroll', handler, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handler);
    }, []);

    const scrollUp = () => {
        const scrollContainer = document.querySelector('.overflow-y-auto');
        scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <button onClick={scrollUp}
            className={`fixed bottom-20 xl:bottom-8 right-6 z-40 w-10 h-10 rounded-xl bg-card border border-border shadow-xl flex items-center justify-center text-muted hover:text-primary hover:border-primary/40 transition-all duration-150 ${visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
            aria-label="Scroll to top">
            <ChevronUp size={18} />
        </button>
    );
};

export default ScrollToTop;
