RestoFlow - Reopen Business Day 2026-07-21

الاستخدام:
1) فك ضغط ZIP بالكامل.
2) تأكد أن الكاشير لا يستخدم النظام.
3) شغل Reopen Business Day.bat.
4) وافق Yes على رسالة UAC.
5) راجع اسم الفرع والتاريخ، ثم اكتب REOPEN بالحروف الكبيرة.
6) انتظر SUCCESS، ثم افتح النظام وتأكد أن Business Date هو 2026-07-21.

الأداة تعمل بدون SQL Server Management Studio.
تكتشف مكان تثبيت RestoFlow وبيانات قاعدة البيانات تلقائياً.
تأخذ Backup كامل ومتحقق منه قبل التعديل.
ترفض التنفيذ إذا بدأ أي Order أو Shift بتاريخ 2026-07-22.
تحذف تقرير الإغلاق الخطأ فقط، وتترك Orders وPayments وStock وسجل Audit بدون حذف.
تضيف Audit باسم DAY_REOPENED_BY_FIX ثم تعيد تشغيل النظام وتفحص اتصال قاعدة البيانات.

مكان Backup وLog داخل مجلد تثبيت RestoFlow ERP.
