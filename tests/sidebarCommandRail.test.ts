import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootFile = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
const component = rootFile('components/common/ContextRail.tsx');
const css = rootFile('styles/layout/context-rail-v2.css');
const legacyCss = rootFile('styles/layout/sidebar.css');

describe('CODUIS XEN command rail contract', () => {
  it('uses theme-aware kinetic effects without width-driven hover animation', () => {
    expect(css).toContain('--rail-v2-glow: rgb(var(--accent))');
    expect(css).toContain('clip-path: inset(');
    expect(css).toContain('.sidebar-nav-glow');
    expect(css).toContain('@keyframes rail-v2-click-wave');
    expect(css).not.toMatch(/:hover[^{}]*\{[^{}]*width:/s);
  });

  it('provides pointer-following glow and persistent click feedback hooks', () => {
    expect(component).toContain('handleRailPointerMove');
    expect(component).toContain('handleToggleSidebar');
    expect(component).toContain('if (pinned) {');
    expect(component).toContain('setSelectionClosing(true)');
    expect(component).toContain('event.currentTarget.blur()');
    expect(component).toContain('sidebar-section-index');
    expect(component).toContain('sidebar-nav-item-clicked');
    expect(component).toContain('sidebar-nav-ripple');
    expect(component.match(/event\.currentTarget\.blur\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(component).toContain('window.setTimeout(() => setSelectionClosing(false), 420)');
  });

  it('places workspace headings and their controlled pages in a single scrollable hierarchy', () => {
    expect(component).toContain('selectedSectionId');
    expect(component).toContain('sidebar-workspace-tree');
    expect(component).toContain('sidebar-workspace-trigger');
    expect(component).toContain('aria-expanded={expanded}');
    expect(component).toContain('hidden={!expanded}');
    expect(component).not.toContain('sidebar-domain-switcher');
    expect(component).not.toContain('sidebar-domain-grid');
    expect(css).toContain('.sidebar-workspace-pages[hidden] { display: none !important; }');
  });

  it('keeps accessibility and reduced-motion fallbacks', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-motion="off"]');
  });

  it('treats the mobile rail as a focused drawer', () => {
    expect(component).toContain("document.body.style.overflow = mobileOpen ? 'hidden' : previousOverflow");
    expect(component).toContain('xl:hidden fixed inset-0');
    expect(component).toContain('xl:translate-x-0');
    expect(component).toContain("matchMedia('(min-width: 1024px)')");
    expect(css).toContain('.workspace-rail-v2 .sidebar-pin-btn { display: none !important; }');
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).toContain('@media (min-width: 1024px) and (max-width: 1279px)');
    expect(css).toMatch(/\.workspace-rail\.workspace-rail-v2\s*\{\s*position:\s*fixed\s*!important;/s);
    expect(css).toMatch(/\.workspace-shell:has\(> \.workspace-rail-v2\) > main\s*\{[\s\S]*?width:\s*100%\s*!important;/s);
    expect(css).toContain('margin-inline: 0 !important;');
  });

  it('collapses the rail after every final quick action on desktop and mobile', () => {
    expect(component).toContain('closeRailAfterSelection');
    expect(component).toContain('setMobileOpen(false)');
    expect(component).toContain('setSidebarCollapsed(true)');
    expect(component).toContain('runRailAction(onOpenCommand)');
    expect(component).toContain('runRailAction(toggleAssistant)');
    expect(component).toContain("runRailAction(() => navigateTransition('/theme-lab'))");
  });

  it('reserves content space only when the sidebar is actually rendered', () => {
    expect(css).toContain('.workspace-shell:has(> .workspace-rail-v2) > main');
    expect(css).not.toContain('.workspace-shell > main,');
    expect(css).not.toContain('.workspace-shell:not(:has(.rail-pinned)) > main');

    expect(legacyCss).toContain('.workspace-shell:has(> .workspace-rail)>main');
    expect(legacyCss).toContain('.workspace-shell:has(> .workspace-rail) > main');
    expect(legacyCss).not.toContain('.workspace-shell>main {');
    expect(legacyCss).not.toContain('.workspace-shell > main {');
    expect(legacyCss).not.toContain('.workspace-shell:not(:has(.rail-pinned)) > main');
  });
});
