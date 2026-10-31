# Competitive P0 Slice: Sensitive Mutation Audit Coverage

## Objective

رفع قابلية التتبع للعمليات الإدارية والتشغيلية الحساسة التي ما زالت خارج domain audit، مع الحفاظ على عدم تسجيل الأسرار أو بيانات العملاء الحساسة، ثم قياس التغطية واختبار البناء.

## Ordered slices

### Slice 1 — Administration and tenant state

- [x] إضافة domain audit للفروع، الأدوار، الإعدادات، والاشتراكات.
- [x] تسجيل المعرّفات والتغييرات المسموح بها فقط، دون مفاتيح أو عناوين خوادم أو قيم إعدادات حساسة.
- [x] التحقق المرحلي: typecheck وlint وaudit:coverage؛ التحقق الكامل للـslice بعد checkpoint موحد.

### Slice 2 — Guest operations

- [x] إضافة domain audit للحجوزات وقائمة الانتظار.
- [x] فرض branch scope على waitlist، والتحقق من branch ownership عند تحديث سجل بالمعرّف، وعدم تسجيل أرقام الهاتف الخام في payload.

### Slice 3 — Remaining P0 routes

- [x] تغطية دورة الطابعات، عمليات setup الحساسة، وفحص سلامة الـAudit، وإعدادات/عمليات Paymob وWhatsApp، والميزانيات وعمليات fiscal بعد مراجعة كل payload.
- [x] تغطية المستخدمين، الإعدادات المتقدمة، والتكاملات الإدارية المتبقية؛ أصبح القياس التفصيلي لكل الـ51 route الداخلية 100%.

### Slice 4 — Integration and bridge verification

- [x] تأمين public operator screens: إزالة رقم الهاتف من payload، وإضافة branch-scoped signed audit لـ`bump` و`handover` مع regression tests.
- [x] تحصين ADMS: عدم بث سجلات البصمة الخام أو معرفات المستخدمين، بث branch-scoped للعدد فقط، signed audit للـpayload المقبول، ورفض الجهاز غير المسجل.
- [x] تحصين Attendance Bridge: register/claim/complete/backup/ingest تحمل signed audit branch-scoped ببيانات aggregate فقط.
- [x] تحصين Talabat/Aggregator webhooks وإدارة webhook endpoints: النتائج المقبولة والمكررة تحمل signed audit، وCRUD لا يعيد secrets أو header values.
- [ ] مراجعة signed audit للـADMS وAttendance Bridge وpublic screens وwebhooks مع اختبارات HMAC/token end-to-end.
- [ ] تشغيل integration suite بقاعدة اختبار معزولة، ثم تحديث القياس بعد إثبات runtime وليس static linkage فقط.
- [ ] عدم اعتبار baseline middleware بديلًا عن before/after domain audit.

## Acceptance criteria

- كل mutation في الشرائح المنفذة ينتج signed domain audit بعد نجاح العملية.
- payloads لا تحتوي secrets أو IPs أو أرقام هواتف خام أو سجلات خام.
- `npm run audit:coverage` يعطي قياسًا موثقًا، حتى لو بقيت ملفات أخرى غير مغطاة.
- typecheck وlint وunit tests وserver build ناجحة.

## Risks

| Risk | Mitigation |
|---|---|
| تسريب قيمة إعداد حساسة | تسجيل key metadata فقط، وحجب القيمة بالكامل |
| تضخيم الـaudit بالبيانات الشخصية | استخدام IDs/counts/status بدل الاسم والهاتف والقيم الخام |
| اختلاف branch scope بين المسارات | الاعتماد على `effectiveBranchId` أو branchId الموثوق من العملية |
