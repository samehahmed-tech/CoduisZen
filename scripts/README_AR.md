# Final Setup

Installer موحّد لويندوز. يثبت Server أو Cashier، ينشئ قاعدة SQL Server فاضية، يثبت Print Bridge، ويحافظ على الداتا والإعدادات عند التحديث.

متطلبات جهاز العميل: Windows x64 مدعوم من SQL Server 2022، صلاحية Administrator، وقرص به 4.2GB على الأقل لتثبيت SQL Express ومكونات النظام. الحزمة Offline ولا تحتاج Node أو npm أو Inno Setup على جهاز العميل.

## بناء النسخة الكاملة

نزّل الملفات الرسمية التالية وثبّت Inno Setup 6 على جهاز البناء:

- SQL Server Express 2022 x64 offline media: `SQLEXPR_x64_ENU.exe`
- Microsoft ODBC Driver 18 x64: `msodbcsql.msi`
- Microsoft Visual C++ x64 Redistributable: `vc_redist.x64.exe`

ثم ابنِ الحزمة:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sameh-installer\build-sameh-installer.ps1 -SqlExpressInstaller "C:\Installers\SQLEXPR_x64_ENU.exe" -OdbcDriverInstaller "C:\Installers\msodbcsql.msi" -VCRedistInstaller "C:\Installers\vc_redist.x64.exe"
```

الناتج:

```text
artifacts\sameh-installer\Final Setup.exe
```

البناء يرفض أي ملف prerequisite غير موقّع بتوقيع Microsoft صالح، ويرفض إنتاج حزمة clean-PC ناقصة.
ملف `Final Setup.exe` نفسه يحتاج شهادة Code Signing موثوقة قبل التسليم التجاري؛ بدونها قد يعرض Windows SmartScreen تحذيراً رغم سلامة المحتوى.

تشغيل نفس Setup بإصدار أحدث يعمل Upgrade تلقائي. ملفات البرنامج تتحدث، بينما `.env` وSQL DB تظل كما هي.
حدّث السيرفر أولاً ثم أجهزة الكاشير بنفس ملف Setup، حتى يظل Print Bridge مربوطًا بالتوكن المدمج في الحزمة.

## اختيار الجهاز

- **Server:** يثبت Visual C++ وODBC 18 وSQL Express عند الحاجة، وينشئ قاعدة `CoduisZen` الفارغة، ويطبّق الـschema، وينشئ Backup متحققاً منه، ثم يشغّل API وPrint Bridge وMonitor.
- **Cashier:** يطلب IP السيرفر فقط، يربط النظام، ويشغّل Print Bridge للطابعات USB/LAN وMonitor.
- Print Bridge لا يحتاج `Branch ID`: يسحب أوامر الطباعة العامة، ويستخدم الطابعة المحددة أو طابعة Windows الافتراضية تلقائياً.
- طابعات LAN المباشرة على Port `9100` تطبع العربي كصورة Raster متوافقة `ESC * 24-dot`؛ تم اختبارها فعلياً مع كارت `JK-E02` بدون تداخل سطور.

السجلات: `C:\Program Files\Sameh\RestoFlow ERP\logs\installer.log`.

## الاسترداد التلقائي

- لا تظهر رسالة نجاح على جهاز السيرفر إلا بعد اتصال API بقاعدة البيانات فعلياً.
- Tasks الخاصة بـSupervisor وMonitor وWatchdog تُنشأ بعد تجهيز SQL وقاعدة البيانات.
- Watchdog يفحص الخدمات كل دقيقة، يشغّل خدمة SQL عند توقفها، ويمنع حلقات إعادة التشغيل المتكررة.
- Supervisor وMonitor وWatchdog وPrint Bridge تعمل مخفية بدون نوافذ `node` أو `cmd` على سطح المكتب.
- Monitor يحدّث حالة API وقاعدة البيانات وWhatsApp وطابور الطباعة والبريدج كل 10 ثوانٍ، ويعرض آخر الأخطاء الحقيقية.
- Monitor يحتوي إصلاحاً شاملاً، إعادة تشغيل الخدمات، كشف طابعات Windows، وتجربة طباعة مباشرة.
- يدعم SQL Express باسم `CODUISZEN` أو `SQLEXPRESS` أو Default Instance.
- يكتشف SQL لو تم تثبيته لاحقاً، يصلح `DATABASE_URL`، يشغّل SQL service، ثم يعيد تشغيل الخدمات.
- يعيد إنشاء Tasks المفقودة تلقائياً ويعرض الإصلاحات المنفذة.
- ملفات السجل تدور تلقائياً عند 5MB وتحتفظ بالنسخة السابقة `.1`.
- Uninstall يوقف العمليات ويحذف Tasks وقواعد Firewall الخاصة بالنظام، ولا يحذف قاعدة SQL أو النسخ الاحتياطية.
- يحذف Tasks القديمة `RestoFlow Supervisor` و`RestoFlow Supervisor Logon` و`RestoflowPrintBridge`.
- ينقل `.env` و`backups` وWhatsApp session من `C:\RestoFlow` ثم يحذف ملفات البرنامج القديمة. قاعدة SQL لا تُحذف.

## النسخ الاحتياطي والاسترجاع

من جهاز السيرفر، افتح PowerShell كمسؤول داخل مجلد التثبيت:

```powershell
.\runtime\node.exe .\runtime\database-backup.cjs
```

الأمر ينشئ ملف `.bak` داخل `backups` ثم يشغّل `RESTORE VERIFYONLY` تلقائياً. لا تعتمد أي نسخة لا ترجع `"verified":true`.

الاسترجاع يوقف اتصالات قاعدة البيانات الحالية ويستبدل بياناتها. أوقف خدمات RestoFlow أولاً، ثم نفّذ فقط بعد أخذ نسخة جديدة والتأكد من اسم الملف:

```powershell
.\runtime\node.exe .\runtime\database-restore.cjs --file="C:\Program Files\Sameh\RestoFlow ERP\backups\CoduisZen-example.bak" --confirm=RESTORE
```

بدون `--confirm=RESTORE` يرفض السكربت التنفيذ ولا يغيّر قاعدة البيانات.

## نقل الكتالوج من PostgreSQL القديم

على جهاز يقدر يتصل بقاعدة PostgreSQL القديمة، شغّل `scripts\sameh-installer\data-export\Export PostgreSQL Catalog SQL.bat`. الناتج ملف باسم `RestoFlow-Catalog-Import-<date>.sql` بدون كلمة مرور أو بيانات اتصال.

انقل ملف SQL إلى جهاز العميل، ثم افتح من قائمة Start:

`Sameh Installer > Import Catalog SQL File`

اختر الملف واكتب `IMPORT`. الأداة تأخذ Backup متحققاً منه، وتشغّل الملف على قاعدة `CoduisZen` داخل Transaction واحدة، ثم تعيد تشغيل النظام. أي خطأ يلغي كل تغييرات النقل.

- Port Guard يوقف فقط عمليات Node القديمة التابعة لـRestoFlow على Port `3001`، ويعرض اسم أي برنامج غريب يحجز البورت بدون قتله.
- زر **فحص وإصلاح شامل** يتحقق من Hash الملفات الحرجة، يستعيد التالف، يصلح Tasks وFirewall، ثم يعيد تشغيل الخدمات.
- API يبدأ ويعرض الواجهة حتى لو SQL/DB غير جاهزة؛ Health يظهر `degraded` بدل `ECONNREFUSED`.
- Schema Doctor يضيف الأعمدة الناقصة بأمان ولا يحذف الجداول أو البيانات الموجودة.
