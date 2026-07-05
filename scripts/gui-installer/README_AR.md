# بناء نسخة العميل

من جهاز التطوير:

```powershell
npm run release:client
```

لو `DATABASE_URL` في `.env` مش هو قاعدة البيانات الحالية:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gui-installer\build-gui-installer.ps1 -DatabaseUrl "postgresql://user:password@localhost:5432/restoflow_erp"
```

الناتج:

```text
artifacts\gui-installer\RestoFlow-ERP-GUI-Setup-1.1.0.exe
```

انقل الملف للعميل وشغله كـ Administrator.

العميل يختار:

- App port
- DATABASE_URL لقاعدة بيانات العميل
- Print bridge
- WhatsApp Web
- Restore included data

لو restore أو migration فشل، setup يكمل. الأخطاء تظهر في:

```text
C:\RestoFlow\INSTALL_RESULT.txt
C:\RestoFlow\logs\setup-agent.log
```
