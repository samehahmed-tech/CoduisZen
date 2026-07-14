RestoFlow ERP - دليل Final Setup 1.1.8

التثبيت على Windows نظيف:
1) انسخ Final Setup.exe إلى الجهاز.
2) كليك يمين ثم Run as administrator.
3) اختر جهاز السيرفر الرئيسي. اترك Print Bridge محددًا.
4) انتظر رسالة نجاح التثبيت. تثبيت SQL Express قد يستغرق عدة دقائق.
5) افتح http://127.0.0.1:3001/setup وأنشئ حساب المالك وبيانات المطعم والفرع.
6) بعد الإنهاء سجل الدخول بحساب المالك.

حسابات الإنقاذ التي يراجعها Setup فعليًا:
- SUPER_ADMIN PIN: 202626
- CASHIER PIN: 111111
وجود حسابات الإنقاذ لا يمنع إنشاء المالك لأول مرة. لأمان العميل غيّر أو عطّل PIN الإنقاذ بعد التسليم إذا لم تكن تحتاجه.

ما يثبته ويضبطه Setup تلقائيًا:
- SQL Server Express وODBC Driver 18 وVisual C++ Runtime عند الحاجة.
- قاعدة بيانات CoduisZen والجداول الناقصة بدون حذف بيانات Upgrade.
- واجهة Production والسيرفر وPrint Bridge.
- Supervisor وMonitor وWatchdog وScheduled Tasks مخفية وتعمل على البطارية.
- تنظيف Tasks وعمليات RestoFlow القديمة، ونسخة احتياطية قبل Upgrade.
- فحص Database وAPI وAdmin/Cashier login وBridge قبل إعلان النجاح.

الطابعات:
- Network: أدخل IP الطابعة في صفحة الطابعات واجعل طابعة الإيصال Primary Cashier.
- USB: ثبّت تعريف الشركة المصنّعة أولًا وتأكد أن Windows Test Page تعمل، ثم اختر USB واسم الطابعة.
- الإيصالات 80mm تدعم العربي واللوجو وQR والإجمالي والقص. بعض تعريفات USB غير ESC/POS قد لا تدعم القص الخام.

مشاكل سريعة:
- SmartScreen: اختر More info ثم Run anyway؛ الملف غير موقّع بشهادة تجارية حاليًا.
- Port 3001 محجوز ببرنامج آخر: أغلق البرنامج ثم شغّل Setup ثانية. Setup يغلق عمليات RestoFlow القديمة فقط.
- الطابعة لا تظهر USB: ثبّت تعريفها، اطبع Windows Test Page، ثم أعد تشغيل Print Bridge من Sameh System Monitor.
- Network printer لا تطبع: تأكد أن IP صحيح وثابت وأن الجهاز والطابعة على نفس الشبكة وأن Port 9100 متاح.
- لو ظهر تحذير Restart Required بعد تثبيت متطلب Microsoft، أعد تشغيل Windows مرة واحدة.

ملفات التشخيص داخل مجلد التثبيت:
- logs\installer.log
- logs\supervisor.log
- INSTALL_ERROR.txt أو INSTALL_WARNINGS.txt
- Sameh System Monitor من سطح المكتب.
