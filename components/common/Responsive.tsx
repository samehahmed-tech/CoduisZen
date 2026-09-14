import React from 'react';

interface ResponsiveProps {
    children: React.ReactNode;
}

/**
 * Show content only on desktop (?1024px).
 * Usage: <DesktopOnly><AdvancedFilters /></DesktopOnly>
 */
export const DesktopOnly: React.FC<ResponsiveProps> = ({ children }) => (
    <div className="hidden lg:block">{children}</div>
);

/**
 * Show content only on mobile (<1024px).
 * Usage: <MobileOnly><SimplifiedView /></MobileOnly>
 */
export const MobileOnly: React.FC<ResponsiveProps> = ({ children }) => (
    <div className="block lg:hidden">{children}</div>
);

/**
 * Show content only on tablet+ (?768px).
 */
export const TabletUp: React.FC<ResponsiveProps> = ({ children }) => (
    <div className="hidden md:block">{children}</div>
);

/**
 * Show content only on mobile (<768px).
 */
export const MobileOnlySmall: React.FC<ResponsiveProps> = ({ children }) => (
    <div className="block md:hidden">{children}</div>
);
