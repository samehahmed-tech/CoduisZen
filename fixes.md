# تقرير شامل UX + تجاوب + محاذاة + داتابيز + أفاتار
التاريخ: 2026-10-07 — إجمالي ~334 ملاحظة من تدقيق 4 فرق + تحليل DB + bug أفاتار header.

## 0) إصلاحات منجزة أثناء التدقيق
- أفاتار header: صور محلية per-terminal فقط + دمج currentUser ناقص → مزامنة سيرفر (`user_avatars_v1`) + overlay دخول/قوائم.
- تسجيل خروج؟ لا. لا شيء آخر نفذ — باقي بنود مقترحة أدناه.

## 1) UX حرجة: تدميري بلا تأكيد (أولوية P0)
- ButcheryManager:189 نشر مخزون مباشر بلا confirm.
- WastageManager:120 تسجيل خصم مخزون مباشر.
- PrinterManager:720 purge مهام بلا confirm.
- SchedulingManager:390 نسخ أسبوع يمسح شيفتات بلا confirm/undo.
- useInventoryWorkspace:544 تصفير مخزون فرع كامل بتأكيد واحد بلا undo.
- PayrollManager:739 إغلاق دورة نهائي بلا confirm. AttendanceManager:805 إقفال شهري نهائي بلا confirm.
- HRHub:1023 أرشفة مستند حذف بلا confirm. PayrollManager:443 فشل مراجعة صامت null.
- ReservationsHub:127 إلغاء/عدم حضور بلا confirm. ComplaintsInbox:205 غلق/فتح بلا confirm.
- WhatsAppHub:337 reset جلسة مدمر بلا confirm. DispatchHub:67 فشل سواقين صامت. DriverDashboard:145 silent fetch.
- MailHub:245 star/archive بلا toast. POS:409 تبديل فرع يمسح سلة ثم toast (اعكس: confirm أولا).
- PickupScreen:297 تسليم واحد بلا confirm/undo. TableManagementModal:514 reset طاولة يلغي طلب نشط فورا.
- TreasuryHub:146/277 رفض voucher/تحويل بلا confirm (اعتماد فيه confirm). Finance:563 + Expenses:290 اعتماد مالي مباشر بلا confirm.
- Reports:293 popup محظور صامت. TrackOrder:87 not-found بلا retry.
- KDS:1078 أرقام كيبورد تخطف كتابة (guard ضيق). MenuProfitCenter:128 اختصارات تضرب والدرج مفتوح.
- ItemDrawer:779 بحث مكونات بلا كيبورد. RecipeManager:442 تبديل صنف يرمي BOM متسخ بلا confirm. Production:535 صف history بلا كيبورد.
- RolesPermissions:869 زر معطل بلا سبب. WhatsAppHub:610 زر معطل بلا سبب. DayCloseHub:517 طول سبب 8 عند submit فقط.
- SetupWizard:510 bootstrap نهائي بلا confirm أخير. MenuSetupWizard:128 استيراد فارغ يعدي. ReceiptDesigner:1113 حفظ وهمي toast بلا persist.
- ItemTable:89 خلية div بلا كيبورد. BiometricDeviceManager:854/1642 confirm بدائي + درج جهة غلط RTL.
- DataMigrationWizard:33 قراءة ملف كاملة ذاكرة + zone غير كيبورد + رفع بلا نسبة/إلغاء. HRUserGuide:93 رابط خام + 81 RTL ثابت + 103 بلا فهرس + 141 FAQ غير قابلة طي.
- UserManagement:422 صف tr بلا كيبورد. TaskChecklistManager:179 checkbox مخفي بلا focus. ZonesManager:272 فلتر بلا aria.
- ThemeLab:20 مصفوفة كلها صح وهمية. Login:724 خطأ بلا role=alert. Login:532 autofocus مزدوج.
- CallCenter:406 طلب وكيل آخر (تحذير موجود — أبقه).


## 2) تجاوب RSP: أهداف لمس 44px (P0 — utility عام واحد)
- KDS:1287,1308,1366 toggle/finish/input. PickupScreen:493,503,480,522 HUD. TableMap:328,539. Kiosk:248,250,364 X.
- RefundManager:308 (28px),240 tabs. TreasuryHub:276. DriversHub:390,423,479. DriverDashboard:662 stats,1009 POD.
- ReservationsHub:186,228,195. ComplaintsInbox:142,190,201,213. MailHub:351. WhatsAppHub:109,511. CRM:356. TrackOrder:148.
- HRHub:1492,1528. PayrollManager:1304 selects. AttendanceManager:1881,1852. ZonesManager:328. ButcheryManager:302.
- WastageManager:179. PlatformAggregator:265,269,296. PrinterManager:857 (+808 gap). ShiftManagementDrawer:229,261.
- FinanceP1Hub:126,232. ThemeLab:379. SetupWizard:779,918. MenuSetupWizard:278. MenuProfitCenter:811,920. ItemDrawer:372,510,844.
- RecipeManager:491,522. CallCenter:286 X. POS:2728,2295 خصم/فلاتر. OrdersCenter:879 toggle.
- إصلاح: `.touch44{min-height:44px;min-width:44px}` + p-3 أيقونات + chips py-3.

## 3) مودالات موبايل (P0 — كلاس موحد modal-full-mobile)
CallCenter:143,145 سائق. StockRequests:467. Production:578. Finance:1225. DayCloseHub:1492. SettingsHub:2065,2066.
RolesPermissions:847. MailHub:637. حجز:269. HRHub:1558. MenuManager:873. MenuSetupWizard:301. ButcheryManager:469.
WastageManager:289. PlatformAggregator:283. ThemeLab:663,683. ReservationsHub:269. CRM:532. DispatchHub:524 + DriverDashboard:1009 POD (كيبورد يغطي input → fullscreen + resize).
Login:400 landscape قصير + 471 blobs + 478 كارت (fullscreen جزئي).

## 4) hover-only مخفي لمس + جداول تفيض
- OrdersCenter:820,828 إجراءات/تقدم طلب hover فقط. SuppliersPage:113. ItemTable:259.
- جداول min-w تفيض: MovementsPage:186 (1100),360 (1180). HRHub:1423 (980). PayrollManager:1205 (1460). AttendanceManager:1860 (1120).
- Procurement:499 clip. CRM:295 مقصوص بلا scroll. Expenses:576 (630 ثابت). MenuManager:945 (760). ZonesManager:286 (820 cards أفضل).
- WarehousesPage:186 transfers. StockRequests:341 (560 داخل scroll مقبول — أبقه). Production:459. ItemTable:120 (10 أعمدة).
- إصلاح: overflow-x-auto + بطاقات موبايل للحرجة + إظهار دائم coarse.


## 5) RTL ومعالجة اتجاه (P1)
- POS:2795 أيقونة left-5. SuppliersPage:41 search + 278 text-right ثابت. MenuProfitCenter:772 chevron + MenuManager:790 + MenuSetupWizard:240 X + PrinterManager:628 + ShiftManagementDrawer:331 left ثابتة → start/end + rtl:rotate-180.
- Dashboard:862 + 1427 dir=ltr/min-w ثابت. TrackOrder:83 dir=rtl ثابت. HRUserGuide:81 عربي فقط. BiometricDeviceManager:1642 درج جهة غلط.
- TaskChecklistManager:86 tracking لاتيني يكسر عربي. DataMigrationWizard:111 mono بلا wrap.

## 6) محاذاة جداول ALIGN (P1 — قاعدة: أرقام end + tabular-nums, عناوين = خلايا, لا text-left ثابت)
- Procurement:500,582 text-left + 520 أعداد + 659 مبالغ. WarehousesPage:186 text-left + 142 بلا tabular-nums.
- PayrollManager:1206,1605 thead + 1002,1260,1617 مبالغ. ZenPeople:331 thead + 373,442,611 mono بلا tabular.
- StockRequests:345 th يسار مقابل td وسط. MovementsPage:240 مبالغ وسط. StockCountsPage:255 أرقام وسط.
- SuppliersPage:80 actions يمين يكسر LTR. HRHub:1432 th يسار داخل جدول يمين.
- SuppliersPage:60 شبكة 2col + 73 جدول بلا scroll + WarehousesPage:61 min 300px + RecipeManager:396 شبكة 2col + TreasuryHub:237,312 + SettingsHub:1439,1674 + DriversHub:365 + MailHub:174 + Finance:704 + DayCloseHub:847,913 + Expenses:387,360 + ReservationsHub:269 + KDS:1154 + PickupScreen:522 + TableMap:835,879 + Dashboard:848,1427 + Login:400,471,478 + SchedulingManager:475,562,544 + Biometric:1068 + ZonesManager:242 + Procurement:450 + WastageManager:166 + PlatformAggregator:223 + TableMap:925 + MenuManager:703,779 + PrinterManager:543,808 + ShiftDrawer:375 + FinanceP1Hub:54 + ThemeLab:632 + SetupWizard:587,663 + MenuSetupWizard:303 + HRGuide:103 + UserManagement:442,494 + TaskChecklist:56 + MigrationWizard:117,135 + WhatsApp:406 + CRM:298 + Complaints:269 — كلها أعلاه بتفصيل السطور.

## 7) داتابيز DB (P0 حرجة أولا)
- [حرج] cascade يمسح أدلة مال: payments.order_id:471 + order_items:430 + payment_sessions:484 + journal_lines:1101 — احذف cascade أو امنع حذف أوردرات مدفوعة.
- [حرج] settings كمخزن عمليات: refundService:177 مصفوفة مرتجعات + read-modify-write:93 + inventoryIntelligence:331 — سباق وفقدان + نمو بلا حد → جدول refunds مخصص.
- [حرج] أموال real/float: orders.total:368 + payments.amount:473 + driver_cash_ledger:1333 — numeric(14,2).
- [حرج] drift كود/DB: delivery_zones lat/lng (أصلحناها runtime — ثبت migration) + refund_records:1916,1926 + settings value:1368 + butchery_templates:1857 غائبة من sql-server-schema.sql.
- فهارس ناقصة ساخنة: audit_logs:894 + fiscal_logs:918 + driver_telemetry_latest:1312 + driver_cash_ledger:1327 + orders(branch,date,status):406.
- FK ناقصة: orders.table_id:345 + driver_id:387 + shift_id:402 + delivery_address_id:351.
- nullable يفجر كود: orders.created_at:396 (refundService:235 new Date(null)).
- id مختلط int/nvarchar: delivery_zones:1262 + customer_addresses:210 + shift_assignments:2351.
- تدقيق ناقص: drivers بلا updatedAt:1275 + checkins بلا created/updated:1341.

## 8) bug أفاتار header (مؤكد + مُصلح)
- سبب: صور per-terminal فقط (localStorage) + دمج currentUser ناقص → صورة مستخدم آخر/جهاز آخر لا تظهر هيدر.
- إصلاح: خريطة سيرفر `user_avatars_v1` (settings API) + حفظ عند إنشاء/تعديل + overlay دخول/قوائم + localStorage fallback offline.

## 9) خطة تنفيذ مقترحة
1. utilities عامة (touch44, modal-full-mobile, confirm مخصص) — تغلق ~150.
2. confirms تدميري + P0 DB (cascade, refunds table, numeric, migration, indexes).
3. hover-touch + RTL + ALIGN جداول.
4. toasts/skeletons/retries + نواقص UX.

