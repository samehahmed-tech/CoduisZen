RestoFlow - Advance Business Date

الاستخدام:
1) فك ضغط ZIP بالكامل.
2) تأكد أن الكاشير لا يستخدم النظام.
3) شغل Advance Business Date.bat.
4) وافق Yes على رسالة UAC.
5) راجع الفروع والتاريخ الحالي، ثم اكتب ADVANCE.
6) انتظر SUCCESS، ثم افتح النظام وتاريخ اليوم الجديد شغال.

الأداة تعمل بدون SQL Server Management Studio.
تكتشف مكان تثبيت RestoFlow وبيانات قاعدة البيانات تلقائياً.
تأخذ Backup كامل ومتحقق منه قبل التعديل.
تحذف التقرير الغلط المقفول بالتاريخ المستهدف (لو موجود) ثم تغير business_date.
لا تمس Orders وPayments وStock وسجل Audit بالحذف.
تضيف Audit باسم BUSINESS_DATE_ADVANCED_BY_FIX ثم تعيد تشغيل النظام.

مكان Backup وLog داخل مجلد تثبيت RestoFlow ERP.
