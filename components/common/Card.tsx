import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    padding?: 'sm' | 'md' | 'lg' | 'none';
    hover?: boolean;
    onClick?: () => void;
}

const PADDING: Record<string, string> = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
};

/**
 * Base Card component matching the design system.
 *
 * Usage:
 *   <Card padding="md" hover><p>Content</p></Card>
 *   <Card onClick={openDetail} className="cursor-pointer">...</Card>
 */
const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', hover = false, onClick }) => (
    <div
        onClick={onClick}
        className={`glass-card rounded-[1.8rem] shadow-sm ${PADDING[padding]} ${hover ? 'hover:shadow-md hover:border-primary/20 hover:-translate-y-1 transition-all duration-150' : 'transition-colors duration-150'} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
        {children}
    </div>
);

export default Card;
