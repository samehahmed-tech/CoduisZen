// Development-only visual fixture: real shared styles, no authentication or business data.
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { THEME_LIST } from '../theme/tokens';
import { ThemePreview, THEME_DESCRIPTIONS_AR } from '../components/ThemePreview';
import '../styles/themes/meridian.css';
import '../styles/themes/command.css';
import '../styles/themes/glassline.css';
import '../styles/themes/canvas.css';
import '../styles/themes/fluent-pro.css';
import '../styles/themes/material-x.css';
import '../styles/themes/obsidian.css';
import '../styles/themes/tiles.css';
import '../styles/themes/acrylic.css';
import '../styles/themes/touch.css';

function Review() {
    const [id, setId] = useState('meridian');
    const [dark, setDark] = useState(false);
    const config = THEME_LIST.find(item => item.id === id)!;
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = id;
        root.classList.toggle('dark', dark);
        root.style.colorScheme = dark ? 'dark' : 'light';
        const variables = {
            '--theme-radius': config.shape.radius, '--theme-radius-lg': config.shape.radiusLg,
            '--theme-shadow-card': config.shadows.card, '--theme-shadow-hover': config.shadows.hover,
            '--theme-button-height': config.components.button.height, '--theme-button-padding': config.components.button.padding,
            '--theme-input-height': config.components.input.height, '--theme-blur': config.surfaces.blur,
            '--theme-font-weight': String(config.typography.fontWeight), '--theme-duration': config.motion.duration,
            '--theme-ease': config.motion.easing, '--theme-table-row-height': config.components.table.rowHeight,
            '--pos-theme-card-badge-bg': 'rgb(var(--bg-elevated))', '--pos-theme-card-action-text': 'var(--text-main)',
        };
        Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));
    }, [id, dark, config]);
    return <div style={{minHeight:'100dvh', background:'rgb(var(--bg-app))', color:'rgb(var(--text-main))'}}>
        <header style={{padding:'16px', display:'flex', flexWrap:'wrap', gap:'12px', alignItems:'center', borderBottom:'1px solid rgb(var(--border-color))'}}>
            <strong>RestoFlow · معاينة الثيمات</strong>
            <label>الثيم <select aria-label="الثيم" value={id} onChange={e => setId(e.target.value)}>{THEME_LIST.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button className="theme-btn theme-btn-secondary" onClick={() => setDark(!dark)}>{dark ? 'الوضع الفاتح' : 'الوضع الداكن'}</button>
            <small>بيانات توضيحية — مكونات مشتركة</small>
        </header>
        <div className="dx" style={{padding:'clamp(12px, 3vw, 40px)', minHeight:'90vh'}}>
            <nav style={{display:'flex', flexWrap:'wrap', gap:'12px', marginBottom:'24px'}} aria-label="التنقل">
                <button className="sidebar-nav-item sidebar-nav-item-active">لوحة التحكم</button><button className="sidebar-nav-item">الطلبات</button><button className="sidebar-nav-item">المخزون</button>
            </nav>
            <section className="theme-card" style={{padding:'28px', marginBottom:'24px'}}><span style={{color:'rgb(var(--text-muted))'}}>نظرة على نشاط المطعم</span><h1 style={{fontSize:'28px',margin:'8px 0'}}>كل التفاصيل. رؤية أوضح.</h1><p>{config.name} · {THEME_DESCRIPTIONS_AR[config.id]}</p></section>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap:'20px', marginBottom:'28px'}}>
                {['إجمالي المبيعات','الطلبات اليوم','متوسط الفاتورة','رضا العملاء'].map((label, i) => <section className="dx-metric" key={label} style={{padding:'24px'}}><p style={{color:'rgb(var(--text-muted))'}}>{label}</p><h2 style={{fontSize:'30px',margin:'12px 0'}}>{['24,850','186','134','98%'][i]}</h2><span style={{color:'rgb(var(--text-muted))'}}>مقارنة بالفترة السابقة</span></section>)}
            </div>
            <section className="theme-card" style={{padding:'24px', marginBottom:'24px'}}><h2 style={{fontSize:'20px',marginBottom:'16px'}}>طلبات قيد التنفيذ</h2><div style={{display:'flex', flexWrap:'wrap', gap:'12px',marginBottom:'20px'}}><input className="theme-input" aria-label="بحث الطلبات" placeholder="ابحث برقم الطلب…"/><button className="theme-btn theme-btn-primary">طلب جديد +</button><button className="theme-btn theme-btn-secondary">تصدير التقرير</button></div><div style={{overflowX:'auto'}}><table className="theme-table" style={{width:'100%',textAlign:'start'}}><thead><tr><th>الطلب</th><th>النوع</th><th>الإجمالي</th></tr></thead><tbody>{[1,2,3].map(n => <tr key={n}><td>#{1040+n}</td><td>داخل المطعم</td><td>240 ج.م</td></tr>)}</tbody></table></div></section>
            <section className="theme-card zen-gold" style={{padding:'24px', marginBottom:'24px'}}><span className="gd-eyebrow">MAISON · فحص نقطة البيع</span><h3>قهوة عربية</h3><span className="gd-price">85 ج.م</span><button className="gd-add" data-available="true" style={{display:'block',width:'100%',marginTop:'16px'}}>إضافة للطلب</button></section>
            <section className="theme-lab-simple"><h2 style={{fontSize:'24px',marginBottom:'16px'}}>عشر هويات للنظام</h2><div className="theme-lab-theme-grid">{THEME_LIST.map(item => <button key={item.id} className="theme-lab-theme-card" aria-pressed={item.id === id} onClick={() => setId(item.id)}><ThemePreview theme={item}/><strong>{item.name}</strong><p>{THEME_DESCRIPTIONS_AR[item.id]}</p></button>)}</div></section>
        </div>
    </div>;
}
createRoot(document.getElementById('root')!).render(<Review />);
