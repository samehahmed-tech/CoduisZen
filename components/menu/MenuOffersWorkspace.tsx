import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Gift, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { Offer } from '../../types';

interface Props {
    menuId: string;
    scheduledOnly?: boolean;
    lang: string;
    currency: string;
}

const blankOffer = (): Offer => ({
    id: `offer-${Date.now()}`,
    title: '',
    titleAr: '',
    description: '',
    descriptionAr: '',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    isActive: true,
});

const MenuOffersWorkspace: React.FC<Props> = ({ menuId, scheduledOnly = false, lang, currency }) => {
    const storageKey = `restoflow.menu.offers.${menuId}`;
    const [offers, setOffers] = useState<Offer[]>([]);
    const [draft, setDraft] = useState<Offer | null>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            const parsed: unknown = saved ? JSON.parse(saved) : [];
            setOffers(Array.isArray(parsed) ? parsed : []);
        } catch {
            setOffers([]);
        }
    }, [storageKey]);

    const persist = (next: Offer[]) => {
        setOffers(next);
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            // The working state remains usable if browser storage is unavailable.
        }
    };

    const visibleOffers = useMemo(
        () => offers.filter((offer) => scheduledOnly ? Boolean(offer.schedule?.startDate) : true),
        [offers, scheduledOnly],
    );

    const saveDraft = () => {
        if (!draft?.title.trim() && !draft?.titleAr?.trim()) return;
        const next = offers.some((offer) => offer.id === draft.id)
            ? offers.map((offer) => offer.id === draft.id ? draft : offer)
            : [draft, ...offers];
        persist(next);
        setDraft(null);
    };

    return (
        <section className="menu-offers-workspace">
            <div className="menu-offers-heading">
                <div>
                    <span className="menu-profit-page-eyebrow">{scheduledOnly ? (lang === 'ar' ? 'الحملات القادمة' : 'UPCOMING CAMPAIGNS') : (lang === 'ar' ? 'إدارة العروض' : 'OFFER MANAGEMENT')}</span>
                    <h2>{scheduledOnly ? (lang === 'ar' ? 'العروض المجدولة' : 'Scheduled offers') : (lang === 'ar' ? 'العروض والخصومات' : 'Offers & discounts')}</h2>
                    <p>{lang === 'ar' ? 'أنشئ العرض وحدد قيمته ووقت ظهوره دون مغادرة المنيو.' : 'Create, price, activate and schedule promotions without leaving the menu.'}</p>
                </div>
                <button type="button" className="menu-profit-primary-action" onClick={() => setDraft(blankOffer())}>
                    <Plus size={17} />{lang === 'ar' ? 'عرض جديد' : 'New offer'}
                </button>
            </div>

            {visibleOffers.length ? (
                <div className="menu-offers-grid">
                    {visibleOffers.map((offer) => (
                        <article key={offer.id} className="menu-offer-card">
                            <div className="menu-offer-card-top">
                                <span className="menu-offer-icon"><Gift size={18} /></span>
                                <span className={offer.isActive ? 'is-live' : 'is-paused'}>{offer.isActive ? (lang === 'ar' ? 'نشط' : 'Live') : (lang === 'ar' ? 'متوقف' : 'Paused')}</span>
                            </div>
                            <h3>{lang === 'ar' ? (offer.titleAr || offer.title) : offer.title}</h3>
                            <p>{lang === 'ar' ? (offer.descriptionAr || offer.description || 'بدون وصف') : (offer.description || 'No description')}</p>
                            <strong>{offer.discountType === 'PERCENTAGE' ? `${offer.discountValue}%` : offer.discountType === 'FIXED' ? `${offer.discountValue} ${currency}` : offer.discountType}</strong>
                            {offer.schedule?.startDate && (
                                <div className="menu-offer-schedule"><CalendarClock size={14} /><span>{offer.schedule.startDate}{offer.schedule.endDate ? ` — ${offer.schedule.endDate}` : ''}</span></div>
                            )}
                            <div className="menu-offer-actions">
                                <button type="button" onClick={() => persist(offers.map((item) => item.id === offer.id ? { ...item, isActive: !item.isActive } : item))}><Power size={14} />{offer.isActive ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Activate')}</button>
                                <button type="button" onClick={() => setDraft({ ...offer })} aria-label={lang === 'ar' ? 'تعديل العرض' : 'Edit offer'}><Pencil size={14} /></button>
                                <button type="button" className="is-danger" onClick={() => persist(offers.filter((item) => item.id !== offer.id))} aria-label={lang === 'ar' ? 'حذف العرض' : 'Delete offer'}><Trash2 size={14} /></button>
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <div className="menu-offers-empty">
                    <span><Gift size={26} /></span>
                    <h3>{scheduledOnly ? (lang === 'ar' ? 'لا توجد عروض مجدولة' : 'No scheduled offers') : (lang === 'ar' ? 'ابدأ أول عرض' : 'Create your first offer')}</h3>
                    <p>{lang === 'ar' ? 'العروض تظهر هنا فور إنشائها ويمكنك تفعيلها أو جدولتها.' : 'Offers appear here as soon as they are created, ready to activate or schedule.'}</p>
                    <button type="button" onClick={() => setDraft(blankOffer())}><Plus size={15} />{lang === 'ar' ? 'إنشاء عرض' : 'Create offer'}</button>
                </div>
            )}

            {draft && (
                <div className="menu-offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-editor-title">
                    <button className="menu-offer-backdrop" onClick={() => setDraft(null)} aria-label={lang === 'ar' ? 'إغلاق' : 'Close'} />
                    <div className="menu-offer-editor">
                        <div className="menu-offer-editor-head">
                            <div><span>{lang === 'ar' ? 'عرض ترويجي' : 'PROMOTION'}</span><h3 id="offer-editor-title">{lang === 'ar' ? 'بيانات العرض' : 'Offer details'}</h3></div>
                            <button type="button" onClick={() => setDraft(null)}><X size={18} /></button>
                        </div>
                        <div className="menu-offer-form">
                            <label><span>{lang === 'ar' ? 'اسم العرض' : 'Offer name'}</span><input autoFocus value={lang === 'ar' ? (draft.titleAr || '') : draft.title} onChange={(event) => setDraft({ ...draft, ...(lang === 'ar' ? { titleAr: event.target.value, title: draft.title || event.target.value } : { title: event.target.value }) })} /></label>
                            <label><span>{lang === 'ar' ? 'الوصف' : 'Description'}</span><textarea rows={3} value={lang === 'ar' ? (draft.descriptionAr || '') : draft.description} onChange={(event) => setDraft({ ...draft, ...(lang === 'ar' ? { descriptionAr: event.target.value, description: draft.description || event.target.value } : { description: event.target.value }) })} /></label>
                            <div className="menu-offer-form-grid">
                                <label><span>{lang === 'ar' ? 'نوع الخصم' : 'Discount type'}</span><select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value as Offer['discountType'] })}><option value="PERCENTAGE">{lang === 'ar' ? 'نسبة مئوية' : 'Percentage'}</option><option value="FIXED">{lang === 'ar' ? 'قيمة ثابتة' : 'Fixed amount'}</option><option value="BUNDLE">{lang === 'ar' ? 'باقة' : 'Bundle'}</option><option value="BOGO">{lang === 'ar' ? 'اشترِ واحصل' : 'Buy one, get one'}</option></select></label>
                                <label><span>{lang === 'ar' ? 'القيمة' : 'Value'}</span><input type="number" min="0" value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: Number(event.target.value) })} /></label>
                                <label><span>{lang === 'ar' ? 'يبدأ' : 'Starts'}</span><input type="date" value={draft.schedule?.startDate || ''} onChange={(event) => setDraft({ ...draft, schedule: { startDate: event.target.value, endDate: draft.schedule?.endDate || '' } })} /></label>
                                <label><span>{lang === 'ar' ? 'ينتهي' : 'Ends'}</span><input type="date" value={draft.schedule?.endDate || ''} onChange={(event) => setDraft({ ...draft, schedule: { startDate: draft.schedule?.startDate || '', endDate: event.target.value } })} /></label>
                            </div>
                        </div>
                        <div className="menu-offer-editor-actions"><button type="button" onClick={() => setDraft(null)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="button" className="menu-profit-primary-action" onClick={saveDraft}>{lang === 'ar' ? 'حفظ العرض' : 'Save offer'}</button></div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default MenuOffersWorkspace;
