# RestoFlow Client Ops

ملفات تشغيل سريعة لكل عميل.

- `Create-Empty-Client-DB.bat`: يعمل قاعدة بيانات فاضية UTF-8 ويوزر التطبيق.
- `Restore-Client-DB.bat`: يرجع backup PostgreSQL custom. يمسح DB الهدف بعد تأكيد `RESTORE`.
- `Restart-RestoFlow.bat`: يعيد تشغيل السيرفر والـ supervisor.

لعميل جديد بداتا فاضية:

1. شغل `Create-Empty-Client-DB.bat`.
2. حط `DATABASE_URL` في `C:\RestoFlow\.env`.
3. شغل installer أو migration.
4. شغل `Restart-RestoFlow.bat`.
