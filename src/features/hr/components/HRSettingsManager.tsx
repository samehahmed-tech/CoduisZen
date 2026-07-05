import React, { useEffect, useMemo, useState } from 'react';
import {
    Briefcase,
    Building2,
    FolderTree,
    Pencil,
    Plus,
    Search,
    Trash2,
    UsersRound,
    X,
} from 'lucide-react';
import { useToast } from '@/components/common/ToastProvider';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { hrExtendedApi } from '../../../../services/api/hr';

type OrgUnit = {
    id: string;
    branchId?: string | null;
    name: string;
    nameAr?: string;
    parentId?: string | null;
    isActive?: boolean;
};

type JobTitle = {
    id: string;
    title?: string;
    name?: string;
    nameAr?: string;
    isActive?: boolean;
};

type OrgUnitFormState = {
    id?: string;
    name: string;
    nameAr: string;
    parentId: string;
    isActive: boolean;
    unitType: 'management' | 'section';
};

type JobTitleFormState = {
    id?: string;
    name: string;
    nameAr: string;
    isActive: boolean;
};

const emptyOrgUnitForm = (unitType: OrgUnitFormState['unitType'] = 'management', parentId = ''): OrgUnitFormState => ({
    name: '',
    nameAr: '',
    parentId,
    isActive: true,
    unitType,
});

const emptyJobTitleForm = (): JobTitleFormState => ({
    name: '',
    nameAr: '',
    isActive: true,
});

const titleName = (jobTitle: JobTitle) => jobTitle.nameAr || jobTitle.title || jobTitle.name || jobTitle.id;

export default function HRSettingsManager() {
    const { success, error } = useToast();
    const { confirm } = useConfirm();

    const [departments, setDepartments] = useState<OrgUnit[]>([]);
    const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
    const [search, setSearch] = useState('');
    const [showOrgUnitModal, setShowOrgUnitModal] = useState(false);
    const [showJobTitleModal, setShowJobTitleModal] = useState(false);
    const [orgUnitForm, setOrgUnitForm] = useState<OrgUnitFormState>(() => emptyOrgUnitForm());
    const [jobTitleForm, setJobTitleForm] = useState<JobTitleFormState>(() => emptyJobTitleForm());
    const [saving, setSaving] = useState<'orgUnit' | 'jobTitle' | null>(null);

    const refresh = async () => {
        const [departmentRows, jobTitleRows] = await Promise.all([
            hrExtendedApi.getDepartments(),
            hrExtendedApi.getJobTitles(),
        ]);
        setDepartments(departmentRows || []);
        setJobTitles(jobTitleRows || []);
    };

    useEffect(() => {
        refresh().catch((fetchError: any) => error(fetchError?.message || 'فشل تحميل إعدادات الهيكل الوظيفي'));
    }, []);

    const departmentMap = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
    const searchNeedle = search.trim().toLowerCase();

    const managements = useMemo(() => departments
        .filter((department) => !department.parentId)
        .sort((a, b) => (a.nameAr || a.name).localeCompare(b.nameAr || b.name, 'ar')), [departments]);

    const sections = useMemo(() => departments
        .filter((department) => Boolean(department.parentId))
        .sort((a, b) => (a.nameAr || a.name).localeCompare(b.nameAr || b.name, 'ar')), [departments]);

    const sectionsByManagement = useMemo(() => {
        const map = new Map<string, OrgUnit[]>();
        sections.forEach((section) => {
            const parentId = section.parentId || '';
            map.set(parentId, [...(map.get(parentId) || []), section]);
        });
        return map;
    }, [sections]);

    const visibleManagements = useMemo(() => {
        return managements.filter((management) => {
            const childSections = sectionsByManagement.get(management.id) || [];
            const haystack = [
                management.name,
                management.nameAr,
                ...childSections.flatMap((section) => [section.name, section.nameAr]),
            ].join(' ').toLowerCase();
            return !searchNeedle || haystack.includes(searchNeedle);
        });
    }, [managements, searchNeedle, sectionsByManagement]);

    const visibleJobTitles = useMemo(() => {
        return jobTitles
            .filter((jobTitle) => {
                const haystack = [jobTitle.title, jobTitle.name, jobTitle.nameAr].join(' ').toLowerCase();
                return !searchNeedle || haystack.includes(searchNeedle);
            })
            .sort((a, b) => titleName(a).localeCompare(titleName(b), 'ar'));
    }, [jobTitles, searchNeedle]);

    const legacySections = useMemo(() => {
        return sections.filter((section) => section.parentId && !departmentMap.has(section.parentId));
    }, [departmentMap, sections]);

    const stats = useMemo(() => ({
        managements: managements.length,
        sections: sections.length,
        titles: jobTitles.length,
        activeTitles: jobTitles.filter((jobTitle) => jobTitle.isActive !== false).length,
    }), [jobTitles, managements.length, sections.length]);

    const openManagementModal = (management?: OrgUnit) => {
        setOrgUnitForm(management ? {
            id: management.id,
            name: management.name || '',
            nameAr: management.nameAr || '',
            parentId: '',
            isActive: management.isActive !== false,
            unitType: 'management',
        } : emptyOrgUnitForm('management'));
        setShowOrgUnitModal(true);
    };

    const openSectionModal = (section?: OrgUnit, management?: OrgUnit) => {
        if (section) {
            setOrgUnitForm({
                id: section.id,
                name: section.name || '',
                nameAr: section.nameAr || '',
                parentId: section.parentId || '',
                isActive: section.isActive !== false,
                unitType: 'section',
            });
        } else {
            const fallbackManagement = management || visibleManagements[0] || managements[0];
            setOrgUnitForm(emptyOrgUnitForm('section', fallbackManagement?.id || ''));
        }
        setShowOrgUnitModal(true);
    };

    const openJobTitleModal = (jobTitle?: JobTitle) => {
        setJobTitleForm(jobTitle ? {
            id: jobTitle.id,
            name: jobTitle.title || jobTitle.name || '',
            nameAr: jobTitle.nameAr || '',
            isActive: jobTitle.isActive !== false,
        } : emptyJobTitleForm());
        setShowJobTitleModal(true);
    };

    const handleSaveOrgUnit = async () => {
        const unitLabel = orgUnitForm.unitType === 'management' ? 'الإدارة' : 'القسم';
        if (!orgUnitForm.name.trim()) {
            error(`اكتب اسم ${unitLabel} أولا`);
            return;
        }
        if (orgUnitForm.unitType === 'section' && !orgUnitForm.parentId) {
            error('اختر الإدارة التي يتبع لها القسم');
            return;
        }
        setSaving('orgUnit');
        try {
            await hrExtendedApi.createDepartment({
                id: orgUnitForm.id,
                name: orgUnitForm.name.trim(),
                nameAr: orgUnitForm.nameAr.trim() || orgUnitForm.name.trim(),
                parentId: orgUnitForm.unitType === 'section' ? orgUnitForm.parentId : undefined,
                isActive: orgUnitForm.isActive,
            });
            await refresh();
            setShowOrgUnitModal(false);
            success(orgUnitForm.id ? `تم تحديث ${unitLabel}` : `تمت إضافة ${unitLabel}`);
        } catch (saveError: any) {
            error(saveError?.message || `تعذر حفظ ${unitLabel}`);
        } finally {
            setSaving(null);
        }
    };

    const handleDeleteOrgUnit = async (unit: OrgUnit) => {
        const isManagement = !unit.parentId;
        const childCount = sectionsByManagement.get(unit.id)?.length || 0;
        if (isManagement && childCount > 0) {
            error('لا يمكن حذف إدارة قبل نقل أو حذف الأقسام التابعة لها');
            return;
        }
        const ok = await confirm({
            title: isManagement ? 'حذف إدارة' : 'حذف قسم',
            message: `سيتم حذف "${unit.name}". هل تريد المتابعة؟`,
            confirmText: 'حذف',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await hrExtendedApi.deleteDepartment(unit.id);
            await refresh();
            success(isManagement ? 'تم حذف الإدارة' : 'تم حذف القسم');
        } catch (deleteError: any) {
            if (String(deleteError?.message || '').includes('DEPARTMENT_HAS_CHILDREN')) {
                error('لا يمكن حذف إدارة قبل نقل أو حذف الأقسام التابعة لها');
                return;
            }
            error(deleteError?.message || 'تعذر الحذف');
        }
    };

    const handleSaveJobTitle = async () => {
        if (!jobTitleForm.name.trim()) {
            error('اكتب اسم المسمى الوظيفي أولا');
            return;
        }
        setSaving('jobTitle');
        try {
            await hrExtendedApi.createJobTitle({
                id: jobTitleForm.id,
                name: jobTitleForm.name.trim(),
                nameAr: jobTitleForm.nameAr.trim() || jobTitleForm.name.trim(),
                isActive: jobTitleForm.isActive,
            });
            await refresh();
            setShowJobTitleModal(false);
            success(jobTitleForm.id ? 'تم تحديث المسمى الوظيفي' : 'تمت إضافة المسمى الوظيفي');
        } catch (saveError: any) {
            error(saveError?.message || 'تعذر حفظ المسمى الوظيفي');
        } finally {
            setSaving(null);
        }
    };

    const handleDeleteJobTitle = async (jobTitle: JobTitle) => {
        const ok = await confirm({
            title: 'حذف مسمى وظيفي',
            message: `سيتم حذف "${jobTitle.title || jobTitle.name}".`,
            confirmText: 'حذف',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await hrExtendedApi.deleteJobTitle(jobTitle.id);
            await refresh();
            success('تم حذف المسمى الوظيفي');
        } catch (deleteError: any) {
            error(deleteError?.message || 'تعذر حذف المسمى الوظيفي');
        }
    };

    const managementOptions = managements.filter((management) => (
        orgUnitForm.id ? management.id !== orgUnitForm.id : true
    ));

    return (
        <div className="min-h-screen w-full bg-app px-4 py-5 md:px-6 lg:px-8" dir="rtl">
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
                <div className="overflow-hidden rounded-[28px] border border-border/40 bg-card shadow-sm">
                    <div className="flex flex-col gap-5 px-5 py-5 md:px-7 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-3">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/40 bg-elevated text-main">
                                <FolderTree size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight text-main md:text-3xl">إعدادات الأقسام</h1>
                                <p className="mt-2 max-w-3xl text-sm font-bold text-muted">
                                    إدارة الهيكل الداخلي: إدارات، أقسام تابعة لها، ومسميات وظيفية عامة مستقلة.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => openManagementModal()} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-black text-main transition hover:border-main/30 hover:text-main">
                                <Building2 size={16} />
                                إضافة إدارة
                            </button>
                            <button onClick={() => openSectionModal()} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-black text-main transition hover:border-main/30 hover:text-main">
                                <UsersRound size={16} />
                                إضافة قسم
                            </button>
                            <button onClick={() => openJobTitleModal()} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-main px-4 text-sm font-black text-app transition disabled:opacity-60">
                                <Plus size={16} />
                                إضافة مسمى وظيفي
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-3 border-t border-border/30 px-5 py-4 md:grid-cols-2 xl:grid-cols-4 md:px-7">
                        {[
                            { label: 'الإدارات', value: stats.managements, icon: Building2, tone: 'text-blue-600 dark:text-blue-300' },
                            { label: 'الأقسام', value: stats.sections, icon: UsersRound, tone: 'text-emerald-600 dark:text-emerald-300' },
                            { label: 'المسميات الوظيفية', value: stats.titles, icon: Briefcase, tone: 'text-violet-600 dark:text-violet-300' },
                            { label: 'مسميات مفعلة', value: stats.activeTitles, icon: FolderTree, tone: 'text-amber-600 dark:text-amber-300' },
                        ].map((item) => (
                            <div key={item.label} className="rounded-2xl border border-border/30 bg-app/40 px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold text-muted">{item.label}</p>
                                        <p className="mt-2 text-2xl font-black tracking-tight text-main">{item.value}</p>
                                    </div>
                                    <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-card ${item.tone}`}>
                                        <item.icon size={18} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-[24px] border border-border/40 bg-card px-4 py-4 md:px-5">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" size={17} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="ابحث باسم الإدارة أو القسم أو المسمى الوظيفي"
                            className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 pr-11 text-sm font-bold text-main outline-none transition focus:border-main/30"
                        />
                    </label>
                </div>

                <section className="overflow-hidden rounded-[28px] border border-border/40 bg-card shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-border/30 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                        <div>
                            <h2 className="text-lg font-black text-main">المسميات الوظيفية العامة</h2>
                            <p className="mt-1 text-xs font-bold text-muted">اختار المسمى للموظف بشكل مستقل عن القسم التابع له.</p>
                        </div>
                        <button onClick={() => openJobTitleModal()} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-main px-4 text-xs font-black text-app transition">
                            <Plus size={14} />
                            إضافة مسمى وظيفي
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2 px-5 py-4 md:px-6">
                        {visibleJobTitles.map((jobTitle) => (
                            <div key={jobTitle.id} className="inline-flex items-center gap-2 rounded-2xl border border-border/40 bg-app px-3 py-2 text-xs font-black text-main">
                                <Briefcase size={14} className="text-violet-500" />
                                <span>{titleName(jobTitle)}</span>
                                {jobTitle.isActive === false && <span className="text-muted">موقوف</span>}
                                <button onClick={() => openJobTitleModal(jobTitle)} className="text-muted transition hover:text-blue-600" title="تعديل المسمى">
                                    <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteJobTitle(jobTitle)} className="text-muted transition hover:text-rose-600" title="حذف المسمى">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                        {visibleJobTitles.length === 0 && (
                            <p className="w-full rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs font-bold text-muted">لا توجد مسميات وظيفية مطابقة.</p>
                        )}
                    </div>
                </section>

                <div className="space-y-5">
                    {visibleManagements.map((management) => {
                        const childSections = sectionsByManagement.get(management.id) || [];
                        return (
                            <section key={management.id} className="overflow-hidden rounded-[28px] border border-border/40 bg-card shadow-sm">
                                <div className="flex flex-col gap-4 border-b border-border/30 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/35 bg-elevated text-main">
                                            <Building2 size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-lg font-black text-main">{management.nameAr || management.name}</h2>
                                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${management.isActive !== false ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
                                                    {management.isActive !== false ? 'نشط' : 'موقوف'}
                                                </span>
                                            </div>
                                            {management.nameAr && management.nameAr !== management.name && (
                                                <p className="mt-1 text-xs font-bold text-muted">{management.name}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => openSectionModal(undefined, management)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border bg-app px-3 text-xs font-black text-main transition hover:border-main/30 hover:text-main">
                                            <Plus size={14} />
                                            قسم
                                        </button>
                                        <button onClick={() => openManagementModal(management)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:border-main/30 hover:text-main" title="تعديل الإدارة">
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => handleDeleteOrgUnit(management)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:border-rose-300 hover:text-rose-600" title="حذف الإدارة">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="divide-y divide-border/30">
                                    {childSections.map((section) => (
                                        <div key={section.id} className="px-5 py-4 md:px-6">
                                            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                                                <div className="flex min-w-0 items-start gap-3">
                                                    <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/35 bg-elevated text-main">
                                                        <UsersRound size={17} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-sm font-black text-main">{section.nameAr || section.name}</h3>
                                                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${section.isActive !== false ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
                                                                {section.isActive !== false ? 'نشط' : 'موقوف'}
                                                            </span>
                                                        </div>
                                                        {section.nameAr && section.nameAr !== section.name && (
                                                            <p className="mt-1 text-xs font-bold text-muted">{section.name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => openSectionModal(section)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:border-main/30 hover:text-main" title="تعديل القسم">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeleteOrgUnit(section)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:border-rose-300 hover:text-rose-600" title="حذف القسم">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {childSections.length === 0 && (
                                        <div className="px-6 py-10 text-center text-sm font-black text-muted">
                                            لا توجد أقسام تحت هذه الإدارة.
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}

                    {visibleManagements.length === 0 && (
                        <div className="rounded-[28px] border border-dashed border-border/60 bg-card px-6 py-14 text-center text-sm font-black text-muted">
                            لا توجد إدارات مطابقة للفلاتر الحالية.
                        </div>
                    )}

                    {legacySections.length > 0 && (
                        <section className="overflow-hidden rounded-[28px] border border-amber-300/50 bg-card shadow-sm">
                            <div className="border-b border-border/30 px-5 py-4 md:px-6">
                                <h2 className="text-lg font-black text-main">أقسام تحتاج ربط بإدارة</h2>
                            </div>
                            <div className="space-y-3 px-5 py-4 md:px-6">
                                {legacySections.map((section) => (
                                    <div key={section.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-app/40 px-4 py-3">
                                        <span className="text-sm font-black text-main">{section.nameAr || section.name}</span>
                                        <button onClick={() => openSectionModal(section)} className="inline-flex h-9 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-xs font-black text-main">
                                            <Pencil size={13} />
                                            ربط بإدارة
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {showOrgUnitModal && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" onClick={() => setShowOrgUnitModal(false)}>
                    <div className="w-full max-w-2xl rounded-[28px] border border-border/50 bg-card shadow-lg" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4 md:px-6">
                            <div>
                                <h3 className="text-lg font-black text-main">
                                    {orgUnitForm.id ? 'تعديل' : 'إضافة'} {orgUnitForm.unitType === 'management' ? 'إدارة' : 'قسم'}
                                </h3>
                            </div>
                            <button onClick={() => setShowOrgUnitModal(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:text-main">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
                            {!orgUnitForm.id && (
                                <label className="col-span-full space-y-2">
                                    <span className="text-xs font-black text-main">النوع</span>
                                    <select
                                        value={orgUnitForm.unitType}
                                        onChange={(event) => setOrgUnitForm((current) => ({ ...current, unitType: event.target.value as OrgUnitFormState['unitType'], parentId: event.target.value === 'management' ? '' : current.parentId }))}
                                        className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-black text-main outline-none transition focus:border-main/30"
                                    >
                                        <option value="management">إدارة</option>
                                        <option value="section">قسم تابع لإدارة</option>
                                    </select>
                                </label>
                            )}
                            <label className="space-y-2">
                                <span className="text-xs font-black text-main">الاسم</span>
                                <input value={orgUnitForm.name} onChange={(event) => setOrgUnitForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-bold text-main outline-none transition focus:border-main/30" />
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black text-main">الاسم العربي</span>
                                <input value={orgUnitForm.nameAr} onChange={(event) => setOrgUnitForm((current) => ({ ...current, nameAr: event.target.value }))} className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-bold text-main outline-none transition focus:border-main/30" />
                            </label>
                            {orgUnitForm.unitType === 'section' && (
                                <label className="space-y-2">
                                    <span className="text-xs font-black text-main">الإدارة</span>
                                    <select value={orgUnitForm.parentId} onChange={(event) => setOrgUnitForm((current) => ({ ...current, parentId: event.target.value }))} className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-black text-main outline-none transition focus:border-main/30">
                                        <option value="">اختر الإدارة</option>
                                        {managementOptions.map((management) => (
                                            <option key={management.id} value={management.id}>
                                                {management.nameAr || management.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <label className="col-span-full flex items-center gap-3 rounded-2xl border border-border/40 bg-app/40 px-4 py-3 text-sm font-black text-main">
                                <input type="checkbox" checked={orgUnitForm.isActive} onChange={(event) => setOrgUnitForm((current) => ({ ...current, isActive: event.target.checked }))} />
                                مفعّل ويظهر للاستخدام
                            </label>
                        </div>
                        <div className="flex flex-col gap-3 border-t border-border/30 px-5 py-4 md:flex-row md:justify-end md:px-6">
                            <button onClick={() => setShowOrgUnitModal(false)} className="h-11 rounded-2xl border border-border bg-app px-4 text-sm font-black text-main transition hover:bg-border/40">إلغاء</button>
                            <button onClick={handleSaveOrgUnit} disabled={saving === 'orgUnit'} className="h-11 rounded-2xl bg-main px-5 text-sm font-black text-app transition disabled:opacity-60">
                                {saving === 'orgUnit' ? 'جار الحفظ...' : 'حفظ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showJobTitleModal && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" onClick={() => setShowJobTitleModal(false)}>
                    <div className="w-full max-w-2xl rounded-[28px] border border-border/50 bg-card shadow-lg" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4 md:px-6">
                            <div>
                                <h3 className="text-lg font-black text-main">{jobTitleForm.id ? 'تعديل مسمى وظيفي' : 'إضافة مسمى وظيفي'}</h3>
                            </div>
                            <button onClick={() => setShowJobTitleModal(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-app text-muted transition hover:text-main">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
                            <label className="space-y-2">
                                <span className="text-xs font-black text-main">اسم المسمى</span>
                                <input value={jobTitleForm.name} onChange={(event) => setJobTitleForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-bold text-main outline-none transition focus:border-main/30" />
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black text-main">الاسم العربي</span>
                                <input value={jobTitleForm.nameAr} onChange={(event) => setJobTitleForm((current) => ({ ...current, nameAr: event.target.value }))} className="h-11 w-full rounded-2xl border border-border/40 bg-app px-4 text-sm font-bold text-main outline-none transition focus:border-main/30" />
                            </label>
                            <label className="col-span-full flex items-center gap-3 rounded-2xl border border-border/40 bg-app/40 px-4 py-3 text-sm font-black text-main">
                                <input type="checkbox" checked={jobTitleForm.isActive} onChange={(event) => setJobTitleForm((current) => ({ ...current, isActive: event.target.checked }))} />
                                المسمى مفعّل ويظهر للاختيار
                            </label>
                        </div>
                        <div className="flex flex-col gap-3 border-t border-border/30 px-5 py-4 md:flex-row md:justify-end md:px-6">
                            <button onClick={() => setShowJobTitleModal(false)} className="h-11 rounded-2xl border border-border bg-app px-4 text-sm font-black text-main transition hover:bg-border/40">إلغاء</button>
                            <button onClick={handleSaveJobTitle} disabled={saving === 'jobTitle'} className="h-11 rounded-2xl bg-main px-5 text-sm font-black text-app transition disabled:opacity-60">
                                {saving === 'jobTitle' ? 'جار الحفظ...' : 'حفظ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
