# Backup / Restore DR Drill

## الهدف

إثبات أن نسخة SQL Server قابلة للاسترجاع، وليس الاكتفاء بـ`RESTORE VERIFYONLY`.
الـdrill يأخذ نسخة `COPY_ONLY + CHECKSUM` من قاعدة الاختبار، يستعيدها في قاعدة مؤقتة، يفحص وجود الجداول، ثم يحذف قاعدة الـdrill فقط. ملف الـbackup يظل محفوظًا للمراجعة.

## الحماية

السكربت يرفض التنفيذ إلا إذا:

- `TEST_DATABASE_URL` موجود واسم القاعدة `RestoFlow_Test`.
- `ALLOW_TEST_DATABASE=1`.
- اسم الهدف يبدأ بـ`RestoFlow_DR_`.

لذلك لا يمكن استخدام `DATABASE_URL` أو `CoduisZen` كمصدر للـdrill.

## التشغيل على Windows / SQL Server المحلي

```powershell
$env:TEST_DATABASE_URL='Server=.\CODUISZEN;Database=RestoFlow_Test;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server};TrustServerCertificate=Yes;'
$env:ALLOW_TEST_DATABASE='1'
npm run ops:backup-restore-drill
```

يمكن تحديد اسم مؤقت بعينه عند الحاجة:

```powershell
$env:DRILL_DATABASE_NAME='RestoFlow_DR_manual_001'
npm run ops:backup-restore-drill
```

## دليل آخر تشغيل

في 2026-10-26 نجح drill كامل:

- المصدر: `RestoFlow_Test`.
- الهدف: `RestoFlow_DR_20261026072430`.
- `verified=true` و`restored=true` و`cleanedUp=true`.
- قاعدة الإنتاج `CoduisZen` لم تُستخدم.

## ما لا يثبته هذا الـdrill

لا يثبت وحده RPO/RTO أو استرجاع ملفات uploads على جهاز آخر أو failover متعدد الخوادم؛ هذه اختبارات staging/production منفصلة.
