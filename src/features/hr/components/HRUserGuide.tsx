import React from 'react';
import { BookOpen, CalendarDays, CheckCircle2, Clock, FileText, Fingerprint, Users, Wallet } from 'lucide-react';

const guideSections = [
    {
        title: 'تجهيز الموظفين',
        icon: Users,
        points: [
            'أنشئ الإدارات ثم الأقسام من إعدادات الأقسام.',
            'أضف المسميات الوظيفية العامة مثل كاشير، شيف، مدير فرع.',
            'افتح ملف الموظف وحدد الفرع، القسم، المسمى، الراتب، وكود البصمة.',
        ],
    },
    {
        title: 'المستندات',
        icon: FileText,
        points: [
            'أضف عقود، بطاقات، شهادات صحية، أو رخص من ملف الموظف.',
            'استخدم رابط Google Drive أو ملف مرفوع حسب المتاح.',
            'سجل تاريخ الانتهاء للمستندات التي تحتاج تجديد.',
        ],
    },
    {
        title: 'البصمة والحضور',
        icon: Fingerprint,
        points: [
            'تأكد أن ماكينة البصمة Online من صفحة أجهزة البصمة.',
            'اسحب البصمات ثم راجع عدد المحفوظ والمتجاهل.',
            'اربط أكواد البصمة غير المعروفة بملفات الموظفين.',
        ],
    },
    {
        title: 'الجدولة والورديات',
        icon: CalendarDays,
        points: [
            'أنشئ قالب وردية صباحي أو مسائي أو ممتد لليوم التالي.',
            'أنشئ خطة أسبوعية ووزع الورديات على شبكة الموظفين.',
            'اعتمد الخطة بعد التأكد من عدم وجود تعارضات.',
        ],
    },
    {
        title: 'مراجعة الحضور',
        icon: Clock,
        points: [
            'راجع دخول وخروج اليوم والتأخير والأوفر تايم.',
            'عالج الجلسات المفتوحة والاستثناءات قبل المرتبات.',
            'لا تغلق الرواتب وفيه مشكلات حضور عالية.',
        ],
    },
    {
        title: 'الرواتب والإغلاق',
        icon: Wallet,
        points: [
            'أنشئ دورة رواتب للشهر المطلوب ثم اضغط احتساب.',
            'راجع المكافآت والخصومات والسلف ومركز مراجعة الرواتب.',
            'صدر شيت الرواتب ثم أغلق الدورة واعتمدها.',
        ],
    },
];

const monthlyChecklist = [
    'كل الموظفين لهم فرع وقسم ومسمى وظيفي.',
    'كل موظف فعلي له كود بصمة صحيح.',
    'لا توجد بصمات غير مربوطة.',
    'لا توجد جلسات حضور مفتوحة.',
    'المكافآت والجزاءات والسلف تم اعتمادها أو رفضها.',
    'شيت الرواتب تم تصديره ومراجعته قبل الإغلاق.',
];

const quickQuestions = [
    ['الموظف مش ظاهر؟', 'راجع الفرع المختار وحالة الموظف، وتأكد أنه نشط داخل نفس الفرع.'],
    ['البصمة لا تظهر على الموظف؟', 'راجع كود البصمة في ملف الموظف وطابقه مع الكود القادم من ماكينة البصمة.'],
    ['في بصمات تحتاج ربط؟', 'افتح ملف الموظف الصحيح وأدخل كود البصمة، ثم راجع الحضور مرة أخرى.'],
    ['الراتب طلع صفر؟', 'راجع الراتب الأساسي أو أجر الساعة، وتأكد أن الموظف داخل دورة الرواتب.'],
    ['الأوفر تايم غير محسوب؟', 'راجع سياسة الحضور، وقت نهاية الوردية، وحد بداية احتساب الأوفر تايم.'],
    ['لا أستطيع إغلاق الرواتب؟', 'افتح مركز مراجعة الرواتب وعالج أي blocker ثم اضغط احتساب مرة أخرى.'],
];

export default function HRUserGuide() {
    return (
        <div className="min-h-screen bg-app text-main" dir="rtl">
            <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 lg:px-8">
                <header className="flex flex-col gap-4 border-b border-border/30 pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-600">
                            <BookOpen size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight lg:text-3xl">دليل تشغيل الموارد البشرية</h1>
                            <p className="mt-1 text-xs font-bold text-muted">خطوات عملية لإدارة الموظفين، الحضور، الورديات، المستندات، والرواتب.</p>
                        </div>
                    </div>
                    <a
                        href="/docs/HR_USER_GUIDE_AR.md"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-black hover:bg-elevated"
                    >
                        فتح النسخة الكاملة
                    </a>
                </header>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {guideSections.map((section) => (
                        <div key={section.title} className="rounded-2xl border border-border bg-card p-5">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                                    <section.icon size={20} />
                                </div>
                                <h2 className="text-base font-black">{section.title}</h2>
                            </div>
                            <div className="space-y-3">
                                {section.points.map((point) => (
                                    <div key={point} className="flex gap-2 text-sm font-bold leading-6 text-muted">
                                        <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />
                                        <span>{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>

                <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                    <h2 className="mb-4 text-lg font-black text-emerald-700">قائمة مراجعة نهاية الشهر</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                        {monthlyChecklist.map((item) => (
                            <div key={item} className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-card/70 p-3 text-sm font-bold">
                                <CheckCircle2 size={16} className="text-emerald-600" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <h2 className="mb-4 text-lg font-black">أسئلة متكررة</h2>
                        <div className="space-y-3">
                            {quickQuestions.map(([question, answer]) => (
                                <div key={question} className="rounded-xl border border-border bg-app p-4">
                                    <h3 className="text-sm font-black">{question}</h3>
                                    <p className="mt-2 text-xs font-bold leading-6 text-muted">{answer}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5">
                        <h2 className="mb-4 text-lg font-black">مسار تشغيل الرواتب</h2>
                        <div className="space-y-3">
                            {[
                                'حدد تاريخ بداية ونهاية الدورة.',
                                'اضغط دورة جديدة ثم اختارها من الجدول.',
                                'اضغط مزامنة الحضور ثم احتساب.',
                                'راجع مركز مراجعة الرواتب.',
                                'صدر شيت الرواتب الشامل.',
                                'اضغط إغلاق واعتماد بعد انتهاء المراجعة.',
                            ].map((step, index) => (
                                <div key={step} className="flex gap-3 rounded-xl border border-border bg-app p-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">{index + 1}</span>
                                    <p className="text-sm font-bold leading-6">{step}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
