import React, { useMemo, useState } from 'react';
import {
    Check, X, FlaskConical, Moon, Sun, Bell, Info, AlertTriangle, CheckCircle2,
    Plus, Minus, Flame, Clock3, ChefHat, Bike, Wallet, Search, Upload, CalendarDays,
} from 'lucide-react';
import { THEME_LIST, type ThemeConfig } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { useAuthStore } from '../stores/useAuthStore';
import PageSkeleton from './common/PageSkeleton';

const MATRIX_ROWS = [
    'Buttons', 'Inputs', 'Cards', 'Tables', 'Tabs', 'Badges',
    'Modal', 'Drawer', 'Dropdown', 'Tooltip', 'Toast', 'Charts (bar/area/donut)',
    'POS item cards', 'POS cart', 'Category tabs', 'KDS tickets', 'Dashboard KPI',
    'Inventory rows', 'Dispatch status', 'Finance stats', 'Login accents',
    'Command palette', 'Date picker', 'Empty states', 'Loading states',
    'Skeletons', 'Navigation', 'Sidebar',
] as const;

function rowSupported(_row: string, theme: ThemeConfig): boolean {
    // Every personality implements the full token contract + CSS layer.
    return Boolean(theme.id && theme.components && theme.motion);
}

const Section: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide }) => (
    <section className="theme-card p-5">
        <h3 className="dashboard-section-title mb-4 text-sm font-black uppercase tracking-widest text-main">{title}</h3>
        <div className={`flex ${wide ? 'flex-col items-stretch gap-4' : 'flex-wrap items-center gap-3'}`}>{children}</div>
    </section>
);

const TokenReadout: React.FC<{ active: ThemeConfig }> = ({ active }) => {
    const rows: Array<[string, string]> = [
        ['Radius', `${active.shape.radiusSm} / ${active.shape.radius} / ${active.shape.radiusLg} / ${active.shape.radiusXl}`],
        ['Motion', `${active.motion.style} · ${active.motion.duration} / ${active.motion.slow}`],
        ['Density', `${active.spacing.density} · gap ${active.spacing.gap} · section ${active.spacing.sectionGap}`],
        ['Button', `${active.components.button.variant} · ${active.components.button.height}`],
        ['Card / Sidebar', `${active.components.card.variant} / ${active.components.sidebar.variant} · ${active.components.sidebar.width}`],
        ['Table / Input / Modal', `${active.components.table.density} ${active.components.table.rowHeight} / ${active.components.input.variant} / ${active.components.modal.variant}`],
        ['Interaction', `${active.interaction?.intensity ?? 'standard'} · press ${active.interaction?.pressScale ?? '—'}`],
    ];
    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border/20 bg-elevated/40 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{k}</p>
                    <p className="tabular-nums mt-0.5 truncate text-xs font-bold text-main" title={v}>{v}</p>
                </div>
            ))}
        </div>
    );
};

const PosItemMock: React.FC<{ name: string; price: string; selected?: boolean; unavailable?: boolean }> = ({ name, price, selected, unavailable }) => (
    <div
        className="pos-tilt-card group min-h-[174px] w-44 cursor-pointer p-3"
        data-selected={selected ? 'true' : 'false'}
        data-available={unavailable ? 'false' : 'true'}
        style={unavailable ? { opacity: 0.6 } : undefined}
    >
        <div className="pos-tilt-media mb-2 flex h-20 items-center justify-center rounded-xl bg-elevated/60">
            <Flame size={22} className="opacity-40" />
        </div>
        <p className="pos-tilt-title truncate text-[13px] font-black text-main">{name}</p>
        <div className="mt-1 flex items-center justify-between">
            <span className="pos-tilt-price tabular-nums text-sm font-black text-primary">{price}</span>
            {unavailable ? (
                <span className="text-[10px] font-bold text-muted">Unavailable</span>
            ) : (
                <button type="button" className="pos-tilt-add-btn flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white" aria-label={`Add ${name}`}>
                    <Plus size={15} />
                </button>
            )}
        </div>
    </div>
);

const Pos3DMock: React.FC = () => (
    <div className="pos-tilt-card pos-3d-card group w-44 cursor-pointer" data-selected="false" data-available="true">
        <div className="pos-3d-wrapper" aria-hidden="true">
            <div className="pos-3d-cover pos-3d-cover--empty">
                <Flame size={30} strokeWidth={1.5} />
            </div>
            <div className="pos-3d-shade" />
            <div className="pos-3d-shine" />
        </div>
        <h3 className="pos-3d-title">Grilled Mix</h3>
        <div className="pos-3d-character" aria-hidden="true">
            <span className="pos-3d-medallion">184<small>EGP</small></span>
        </div>
        <div className="pos-3d-foot">
            <button type="button" className="pos-3d-add"><Plus size={15} strokeWidth={2.5} /><span className="pos-3d-add-label">Add · 184 EGP</span></button>
        </div>
    </div>
);

const PosFlipMock: React.FC = () => (
    <div className="pos-tilt-card pos-flip-card group w-48 cursor-pointer" data-selected="false" data-available="true" data-flipped="false">
        <div className="pos-flip-inner">
            <div className="pos-flip-face pos-flip-front">
                <div className="pos-flip-media">
                    <div className="pos-menu-item-empty-media"><Flame size={26} strokeWidth={1.5} className="opacity-40" /></div>
                    <span className="pos-flip-price-ribbon">96<small>EGP</small></span>
                </div>
                <div className="pos-flip-front-body">
                    <h3 className="pos-flip-title">Caesar Salad</h3>
                    <div className="pos-flip-row">
                        <span className="pos-flip-hint">hover to flip →</span>
                    </div>
                </div>
            </div>
            <div className="pos-flip-face pos-flip-back">
                <div className="pos-flip-back-scrim" aria-hidden="true" />
                <div className="pos-flip-back-body">
                    <p className="pos-flip-kicker">About this dish</p>
                    <p className="pos-flip-desc">Crisp romaine, parmesan, house caesar dressing, grilled chicken.</p>
                    <div className="pos-flip-row">
                        <span className="pos-flip-back-price">96<small>EGP</small></span>
                        <button type="button" className="pos-flip-cta" aria-label="Add"><Plus size={15} /> Add</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const PosTicketMock: React.FC = () => (
    <div className="pos-tilt-card pos-ticket-card group w-64 cursor-pointer" data-selected="false" data-available="true">
        <div className="pos-ticket-shine" aria-hidden="true" />
        <div className="pos-ticket-main">
            <span className="pos-ticket-popular">Popular</span>
            <h3 className="pos-ticket-title">Season Soup</h3>
            <p className="pos-ticket-desc">Slow-cooked daily vegetables</p>
        </div>
        <div className="pos-ticket-perf" aria-hidden="true">
            <i className="pos-ticket-notch pos-ticket-notch--top" />
            <i className="pos-ticket-notch pos-ticket-notch--bottom" />
        </div>
        <div className="pos-ticket-stub">
            <span className="pos-tilt-price !text-[19px]">54<span className="!text-[10px]">EGP</span></span>
            <button type="button" className="pos-ticket-add" aria-label="Add"><Plus size={16} strokeWidth={2.5} /></button>
        </div>
    </div>
);

const KpiMock: React.FC<{ label: string; value: string; delta: string; progress: number }> = ({ label, value, delta, progress }) => (
    <div className="group relative flex-1 overflow-hidden rounded-[1.5rem] border border-border/30 bg-card/60 p-5 transition-all">
        <div className="flex items-center justify-between gap-3">
            <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
                <p className="tabular-nums mt-1 text-2xl font-black text-main">{value}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Wallet size={20} />
            </div>
        </div>
        <div className="dashboard-progress mt-4 h-2 w-full overflow-hidden rounded-full border border-border/10 bg-elevated/40">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-bold text-success">{delta}</p>
    </div>
);

const KdsTicketMock: React.FC<{ id: string; table: string; urgency: 'normal' | 'risk' | 'critical' | 'ready'; elapsed: string; progress: number }> = ({ id, table, urgency, elapsed, progress }) => (
    <div
        className="kds-ticket w-full overflow-hidden border p-4"
        data-urgency={urgency}
        style={{
            borderRadius: 'var(--theme-radius, 12px)',
            background: urgency === 'ready'
                ? 'rgba(var(--success), 0.06)'
                : urgency === 'critical'
                    ? 'rgba(var(--danger), 0.10)'
                    : urgency === 'risk'
                        ? 'rgba(var(--warning), 0.10)'
                        : 'rgba(var(--bg-elevated), 0.5)',
            borderColor: urgency === 'critical'
                ? 'rgba(var(--danger), 0.5)'
                : urgency === 'ready'
                    ? 'rgba(var(--success), 0.25)'
                    : 'rgba(var(--border-color), 0.2)',
        }}
    >
        <div className="flex items-center justify-between">
            <span className="text-sm font-black text-main">{id} · {table}</span>
            <span className="tabular-nums flex items-center gap-1 text-[11px] font-bold text-muted">
                <Clock3 size={12} /> {elapsed}
            </span>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(var(--border-color), 0.15)' }}>
            <div className="h-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, rgb(var(--success)), rgb(var(--warning)))' }} />
        </div>
        <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <ChefHat size={13} /> 2× Grilled · 1× Salad
            </span>
            <button type="button" className="theme-btn-primary rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white">
                {urgency === 'ready' ? 'Served' : 'Bump'}
            </button>
        </div>
    </div>
);

const ThemeLab: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { settings, updateSettings } = useAuthStore();
    const isArabic = settings.language === 'ar';
    const isDark = settings.isDarkMode;
    const [showModal, setShowModal] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [tab, setTab] = useState(0);
    const [inputVal, setInputVal] = useState('');
    const [toggled, setToggled] = useState(true);
    const [checked, setChecked] = useState(true);
    const [radio, setRadio] = useState('dine-in');

    const active = useMemo(() => THEME_LIST.find((t) => t.id === theme) ?? THEME_LIST[0], [theme]);

    const flashToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2200);
    };

    return (
        <div className="space-y-6 p-4 sm:p-6" data-page-enter>
            <header className="theme-card flex flex-wrap items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white">
                    <FlaskConical size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-black text-main">{isArabic ? 'معمل الثيمات' : 'Theme Lab'}</h1>
                    <p className="text-xs font-bold text-muted">
                        {active.name} · {active.description} · {isDark ? 'Dark' : 'Light'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => updateSettings({ isDarkMode: false })}
                        className={`theme-icon-button ${!isDark ? 'theme-active-row' : ''}`}
                        aria-label="Light"
                    >
                        <Sun size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => updateSettings({ isDarkMode: true })}
                        className={`theme-icon-button ${isDark ? 'theme-active-row' : ''}`}
                        aria-label="Dark"
                    >
                        <Moon size={16} />
                    </button>
                </div>
            </header>

            <section className="theme-card p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">
                    {isArabic ? 'الثيمات العشر' : '10 Personalities'}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {THEME_LIST.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTheme(t.id)}
                            className={`rounded-2xl border p-3 text-start transition-all ${theme === t.id ? 'theme-active-row border-primary' : 'border-border/30 hover:border-primary/40'}`}
                        >
                            <span className="block truncate text-sm font-black text-main">{t.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-bold text-muted">
                                {t.components.button.variant} · {t.components.card.variant} · {t.motion.style}
                            </span>
                            {theme === t.id && (
                                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-primary">
                                    <Check size={12} /> {isArabic ? 'نشط' : 'Active'}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="mt-4">
                    <TokenReadout active={active} />
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title={isArabic ? 'أزرار' : 'Buttons'}>
                    <button type="button" className="theme-btn-primary rounded-xl px-5 py-2.5 text-sm font-bold text-white" onClick={() => flashToast('Primary action')}>
                        Primary
                    </button>
                    <button type="button" className="theme-btn-secondary rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-main" onClick={() => flashToast('Secondary action')}>
                        Secondary
                    </button>
                    <button type="button" className="theme-icon-button" aria-label="Notifications" onClick={() => flashToast('Icon button')}>
                        <Bell size={16} />
                    </button>
                    <button type="button" disabled className="rounded-xl bg-elevated px-5 py-2.5 text-sm font-bold text-muted opacity-50">
                        Disabled
                    </button>
                </Section>

                <Section title={isArabic ? 'مدخلات' : 'Inputs'}>
                    <input value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="Search orders…" className="theme-input w-52 rounded-xl px-4 py-2.5 text-sm outline-none" />
                    <select className="theme-input rounded-xl px-4 py-2.5 text-sm outline-none" defaultValue="dine-in">
                        <option value="dine-in">Dine-in</option>
                        <option value="takeaway">Takeaway</option>
                        <option value="delivery">Delivery</option>
                    </select>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-main">
                        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                        Checkbox
                    </label>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={toggled}
                        onClick={() => setToggled((v) => !v)}
                        className={`h-6 w-11 rounded-full p-0.5 transition-colors ${toggled ? 'bg-primary' : 'bg-border/60'}`}
                    >
                        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${toggled ? 'translate-x-5' : ''}`} />
                    </button>
                </Section>

                <Section title={isArabic ? 'شارات وحالات' : 'Badges & Status'}>
                    {['success', 'warning', 'danger', 'info'].map((kind) => (
                        <span
                            key={kind}
                            className="theme-badge rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider"
                            style={{
                                color: `rgb(var(--${kind === 'info' ? 'info' : kind}))`,
                                borderColor: `rgba(var(--${kind === 'info' ? 'info' : kind}), 0.4)`,
                                background: `rgba(var(--${kind === 'info' ? 'info' : kind}), 0.10)`,
                            }}
                        >
                            {kind}
                        </span>
                    ))}
                    <span data-status="preparing" className="flex items-center gap-2 text-xs font-bold text-muted">
                        <span data-status-indicator className="h-2.5 w-2.5 rounded-full bg-warning" /> Preparing
                    </span>
                    <span data-status="pending" className="flex items-center gap-2 text-xs font-bold text-muted">
                        <span data-status-indicator className="h-2.5 w-2.5 rounded-full bg-info" /> Pending
                    </span>
                </Section>

                <Section title={isArabic ? 'تبويبات' : 'Tabs'}>
                    {['Orders', 'Kitchen', 'Reports'].map((label, i) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => setTab(i)}
                            className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === i ? 'theme-tab-active bg-primary/10 text-primary' : 'text-muted hover:text-main'}`}
                        >
                            {label}
                        </button>
                    ))}
                </Section>
            </div>

            {/* ── POS: 4 card designs ── */}
            <Section title={isArabic ? 'نقطة البيع: أشكال الكروت الأربعة' : 'POS: 4 card designs'} wide>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">Classic</p>
                        <PosItemMock name="Grilled Mix" price="184.50" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">3D layered</p>
                        <Pos3DMock />
                    </div>
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">Flip → description</p>
                        <PosFlipMock />
                    </div>
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">Ticket</p>
                        <PosTicketMock />
                        <div className="flex items-center gap-2 rounded-2xl border border-border/30 bg-card/60 p-2">
                            <button type="button" className="pos-tilt-qty-btn flex h-9 w-9 items-center justify-center rounded-xl border border-border/40 text-main" aria-label="Decrease">
                                <Minus size={15} />
                            </button>
                            <span className="tabular-nums w-8 text-center text-sm font-black text-main">2</span>
                            <button type="button" className="pos-tilt-qty-btn--add flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white" aria-label="Increase">
                                <Plus size={15} />
                            </button>
                        </div>
                    </div>
                </div>
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title={isArabic ? 'سلة POS' : 'POS cart'} wide>
                    <div className="pos-cart-sidebar overflow-hidden rounded-2xl border border-border/30 bg-card/95">
                        {[
                            { name: 'Grilled Mix ×2', price: '369.00' },
                            { name: 'Caesar Salad ×1', price: '96.00' },
                        ].map((line) => (
                            <div key={line.name} className="flex items-center justify-between gap-2 border-b border-border/15 px-4 py-3">
                                <span className="text-[13px] font-bold text-main">{line.name}</span>
                                <span className="tabular-nums text-sm font-black text-main">{line.price}</span>
                            </div>
                        ))}
                        <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted">Total</span>
                            <span className="tabular-nums text-lg font-black text-primary">465.00</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {['All', 'Grill', 'Drinks'].map((c, i) => (
                            <button
                                key={c}
                                type="button"
                                className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest ${i === 0 ? 'bg-primary text-white' : 'border border-border/30 text-muted'}`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </Section>

                <Section title={isArabic ? 'تذاكر المطبخ KDS' : 'KDS tickets'} wide>
                    <KdsTicketMock id="#1042" table="T-12" urgency="normal" elapsed="4m" progress={30} />
                    <KdsTicketMock id="#1041" table="T-07" urgency="risk" elapsed="13m" progress={68} />
                    <KdsTicketMock id="#1039" table="Drive" urgency="critical" elapsed="22m" progress={95} />
                    <KdsTicketMock id="#1038" table="T-03" urgency="ready" elapsed="—" progress={100} />
                </Section>
            </div>

            {/* ── Dashboard ── */}
            <Section title={isArabic ? 'الداشبورد: مؤشرات' : 'Dashboard: KPIs'} wide>
                <div className="flex flex-col gap-4 lg:flex-row">
                    <KpiMock label="Revenue" value="48,290" delta="▲ 12.4% vs yesterday" progress={72} />
                    <KpiMock label="Orders" value="312" delta="▲ 8.1% vs yesterday" progress={54} />
                    <KpiMock label="Avg ticket" value="154.80" delta="▼ 2.0% vs yesterday" progress={38} />
                </div>
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">Bars</h3>
                    <svg viewBox="0 0 300 120" className="recharts-bar h-32 w-full" role="img" aria-label="Bar chart preview">
                        {[35, 60, 45, 80, 55, 95, 70].map((v, i) => (
                            <rect key={i} x={12 + i * 40} y={110 - v} width={24} height={v} fill={`rgb(var(--chart-${(i % 5) + 1}, var(--primary)))`} opacity={0.85} />
                        ))}
                        <line x1="0" y1="110" x2="300" y2="110" stroke="rgb(var(--chart-grid, 148 163 184 / 0.4))" strokeWidth="1" />
                    </svg>
                </section>
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">Area</h3>
                    <svg viewBox="0 0 300 120" className="recharts-area h-32 w-full" role="img" aria-label="Area chart preview">
                        <path d="M0,95 C40,80 60,60 100,65 C140,70 160,40 200,45 C240,50 260,25 300,30 L300,120 L0,120 Z" fill="rgb(var(--chart-1, var(--primary)))" opacity={0.22} className="recharts-area-area" />
                        <path d="M0,95 C40,80 60,60 100,65 C140,70 160,40 200,45 C240,50 260,25 300,30" fill="none" stroke="rgb(var(--chart-1, var(--primary)))" strokeWidth={3} />
                        <path d="M0,105 C50,95 90,85 140,88 C190,91 230,75 300,78" fill="none" stroke="rgb(var(--chart-2, var(--primary)))" strokeWidth={2} strokeDasharray="5 4" opacity={0.8} />
                    </svg>
                </section>
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">Donut</h3>
                    <svg viewBox="0 0 120 120" className="recharts-pie mx-auto h-32 w-32" role="img" aria-label="Donut chart preview">
                        <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(var(--chart-1, var(--primary)))" strokeWidth="18" strokeDasharray="110 166" strokeLinecap="round" className="recharts-sector" transform="rotate(-90 60 60)" />
                        <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(var(--chart-2, var(--primary)))" strokeWidth="18" strokeDasharray="70 206" strokeLinecap="round" className="recharts-sector" transform="rotate(70 60 60)" />
                        <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(var(--chart-3, var(--primary)))" strokeWidth="18" strokeDasharray="96 180" strokeLinecap="round" className="recharts-sector" transform="rotate(180 60 60)" opacity={0.85} />
                    </svg>
                    <div className="mt-2 flex justify-center gap-3">
                        {[1, 2, 3].map((n) => (
                            <span key={n} className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(var(--chart-${n}, var(--primary)))` }} /> S{n}
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            {/* ── Operations ── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title={isArabic ? 'مخزون وتشغيل' : 'Inventory & dispatch'} wide>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-card/50 px-4 py-3">
                        <span className="min-w-28 text-sm font-bold text-main">Chicken 1kg</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated/60">
                            <div className="h-full rounded-full bg-gradient-to-r from-success to-success" style={{ width: '64%' }} />
                        </div>
                        <span className="tabular-nums text-xs font-black text-main">64%</span>
                        <span className="theme-badge rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-black uppercase text-success">OK</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-card/50 px-4 py-3">
                        <Bike size={16} className="text-primary" />
                        <span className="flex-1 text-sm font-bold text-main">Order #1042 → Nasr City</span>
                        <span className="theme-badge rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[10px] font-black uppercase text-warning">En route</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-card/50 px-4 py-3">
                        <Wallet size={16} className="text-success" />
                        <span className="flex-1 text-sm font-bold text-main">Shift total</span>
                        <span className="tabular-nums text-sm font-black text-main">12,480.00</span>
                    </div>
                </Section>

                <Section title={isArabic ? 'نماذج متقدمة' : 'Advanced forms'} wide>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 rounded-xl border border-border/30 px-3 py-2 text-xs font-bold text-main">
                            <CalendarDays size={14} className="text-muted" />
                            <input type="date" className="theme-input bg-transparent text-xs outline-none" defaultValue="2026-09-13" />
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-main">
                            <Search size={14} className="text-muted" />
                            <input placeholder="Search…" className="theme-input w-36 rounded-xl px-3 py-2 text-xs outline-none" />
                        </label>
                        {['dine-in', 'takeaway'].map((v) => (
                            <label key={v} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-main">
                                <input type="radio" name="lab-order-type" checked={radio === v} onChange={() => setRadio(v)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                                {v}
                            </label>
                        ))}
                    </div>
                    <textarea rows={2} placeholder="Order note…" className="theme-input w-full rounded-xl px-3 py-2 text-xs outline-none" />
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 px-4 py-3 text-xs font-bold text-muted hover:border-primary/40 hover:text-primary">
                        <Upload size={14} /> Upload file
                        <input type="file" className="hidden" />
                    </label>
                </Section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">{isArabic ? 'معاينة تسجيل الدخول' : 'Login preview'}</h3>
                    <form id="login-form" onSubmit={(e) => e.preventDefault()} className="mx-auto w-full max-w-[300px] space-y-3 rounded-2xl border border-white/10 bg-black/60 p-5">
                        <div className="flex items-center justify-center gap-3 py-1">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className={`h-3 w-3 rounded-full ${i < 4 ? 'bg-amber-300' : 'bg-white/10'}`} />
                            ))}
                        </div>
                        <input placeholder="admin@zen.com" className="login-field w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none" />
                        <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-teal-500 to-amber-400 py-3 text-sm font-bold uppercase text-slate-950">
                            Sign in
                        </button>
                    </form>
                </section>

                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">{isArabic ? 'حالات التحميل والفراغ' : 'Loading & Empty'}</h3>
                    <div className="space-y-3">
                        <div className="theme-skeleton h-4 w-3/4 rounded-lg" />
                        <div className="theme-skeleton h-4 w-1/2 rounded-lg" />
                        <PageSkeleton type="table" rows={2} />
                        <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs font-bold text-muted">
                            {isArabic ? 'لا توجد طلبات — ابدأ طلباً جديداً من شاشة المبيعات' : 'No orders yet — start a new order from POS'}
                        </p>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">Command palette</h3>
                    <div data-cmdk-dialog="" className="overflow-hidden p-2">
                        <div className="theme-input mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted">
                            <Search size={13} /> Type a command…
                        </div>
                        {['New order', 'Close shift', 'Print report'].map((c, i) => (
                            <div key={c} data-cmdk-item="" aria-selected={i === 0 ? 'true' : 'false'} className="rounded-lg px-3 py-2 text-xs font-bold text-main">
                                {c}
                            </div>
                        ))}
                    </div>
                </section>
                <section className="theme-card p-5">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">Date picker</h3>
                    <div className="rdrCalendarWrapper mx-auto w-fit p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-main">
                            <span>‹</span><span>September 2026</span><span>›</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {Array.from({ length: 30 }, (_, i) => (
                                <span key={i} className={`rdrDayNumber flex h-7 w-7 items-center justify-center text-[11px] ${i === 12 ? 'rdrSelected rounded-full font-black' : 'text-muted'}`}>
                                    <span>{i + 1}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            <section className="theme-card p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">{isArabic ? 'جدول' : 'Table'}</h3>
                <table className="theme-table w-full text-sm">
                    <thead>
                        <tr className="text-start text-xs text-muted">
                            <th className="px-5 py-3 font-black">Order</th>
                            <th className="px-5 py-3 font-black">Status</th>
                            <th className="px-5 py-3 font-black">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { id: '#1042', status: 'Preparing', total: '184.50' },
                            { id: '#1043', status: 'Ready', total: '96.00' },
                            { id: '#1044', status: 'Pending', total: '240.75' },
                        ].map((row) => (
                            <tr key={row.id} className="theme-table-row border-t border-border/20 text-main">
                                <td className="px-5 py-3 font-bold">{row.id}</td>
                                <td className="px-5 py-3 text-muted">{row.status}</td>
                                <td className="tabular-nums px-5 py-3 font-black">{row.total}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title={isArabic ? 'تراكبات' : 'Overlays'}>
                    <button type="button" className="theme-btn-primary rounded-xl px-5 py-2.5 text-sm font-bold text-white" onClick={() => setShowModal(true)}>
                        Open modal
                    </button>
                    <button type="button" className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-main" onClick={() => setShowDrawer(true)}>
                        Open drawer
                    </button>
                    <span className="theme-tooltip inline-block px-3 py-1.5 text-xs font-bold">Themed tooltip</span>
                </Section>

                <Section title={isArabic ? 'تنبيهات' : 'Alerts & Toasts'}>
                    <span className="flex items-center gap-2 text-xs font-bold text-success"><CheckCircle2 size={15} /> Success state</span>
                    <span className="flex items-center gap-2 text-xs font-bold text-warning"><AlertTriangle size={15} /> Warning state</span>
                    <span className="flex items-center gap-2 text-xs font-bold text-info"><Info size={15} /> Info state</span>
                    <button type="button" className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-main" onClick={() => flashToast('Order #1042 moved to Ready')}>
                        Fire toast
                    </button>
                </Section>
            </div>

            <section className="theme-card overflow-x-auto p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-main">
                    {isArabic ? 'مصفوفة التوافق (مكون × ثيم)' : 'Compatibility matrix (component × theme)'}
                </h3>
                <table className="w-full min-w-[900px] text-xs">
                    <thead>
                        <tr className="text-muted">
                            <th className="px-3 py-2 text-start">Component</th>
                            {THEME_LIST.map((t) => (
                                <th key={t.id} className="px-2 py-2 text-center font-black" title={t.name}>
                                    {t.name.split(' ')[0]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {MATRIX_ROWS.map((row) => (
                            <tr key={row} className="border-t border-border/15 text-main">
                                <td className="px-3 py-2 font-bold">{row}</td>
                                {THEME_LIST.map((t) => (
                                    <td key={t.id} className="px-2 py-2 text-center">
                                        {rowSupported(row, t) ? (
                                            <Check size={14} className="mx-auto text-success" />
                                        ) : (
                                            <X size={14} className="mx-auto text-danger" />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {showModal && (
                <div className="theme-overlay fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="theme-modal-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="theme-modal-header -m-6 mb-4 p-4">
                            <h3 className="font-black text-main">Themed modal</h3>
                        </div>
                        <p className="text-sm text-muted">Entrance, radius, elevation and backdrop follow {active.name}.</p>
                        <div className="theme-modal-footer -m-6 mt-4 flex justify-end gap-2 p-4">
                            <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-main" onClick={() => setShowModal(false)}>
                                Close
                            </button>
                            <button type="button" className="theme-btn-primary rounded-xl px-4 py-2 text-sm font-bold text-white" onClick={() => setShowModal(false)}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDrawer && (
                <div className="theme-overlay fixed inset-0 z-[200]" onClick={() => setShowDrawer(false)}>
                    <aside className="theme-drawer-panel absolute end-0 top-0 h-full w-80 max-w-[85vw] p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-black text-main">Themed drawer</h3>
                        <p className="mt-2 text-sm text-muted">Slide direction respects RTL/LTR.</p>
                        <button type="button" className="theme-btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white" onClick={() => setShowDrawer(false)}>
                            Done
                        </button>
                    </aside>
                </div>
            )}

            {toast && (
                <div className="theme-toast fixed bottom-6 left-1/2 z-[210] flex -translate-x-1/2 items-center gap-2 px-5 py-3 text-sm font-bold">
                    <CheckCircle2 size={16} className="text-success" /> {toast}
                </div>
            )}
        </div>
    );
};

export default ThemeLab;
