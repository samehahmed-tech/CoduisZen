# RestoFlow Competitive Roadmap

## الهدف

تحويل RestoFlow من نظام واسع المميزات إلى منصة تشغيل ERP للمطاعم تنافس Foodics وToast وOdoo وLightspeed وOracle Simphony في الاعتمادية والتكاملات والتشغيل المحلي والذكاء والأمان.

الخطة لا تضيف شاشات عشوائية؛ الأولوية هي تثبيت المال والبيانات والتشغيل، ثم بناء قدرات المنصة، ثم التفوق التجاري.

## تعديل النطاق — 2026-10-28

بناءً على قرار المنتج، تم تأجيل أي عمل يعتمد على شراكة أو اعتماد خارجي (Paymob، Talabat، وباقي المنصات) مؤقتًا. لا تُحسب هذه البنود كعائق أمام تقدم المنتج الداخلي. الأولوية الحالية هي: موثوقية التثبيت والتحديث، التشغيل Offline وConflict Center، اعتماد الأجهزة فعليًا، ثم Customer 360/loyalty والطلبات العامة والتنبؤات. تعود تكاملات الشركاء بعد تثبيت العقود ونقاط الاختبار الرسمية.

## الوضع الحالي

- production frontend/server build ناجح حاليًا؛ frontend ما زال يصدر تحذيرًا عن chunks كبيرة ودورة في manual chunks.
- 244 ملف unit و547 اختبار unit ناجحة، بالإضافة إلى 66 ملف security و141 اختبار security؛ وبعد ترقية Vitest أصبح SQL integration يمر بـ295/295 ملفًا و662/662 اختبارًا. آخر بوابة unit كاملة بعد تشديد Offline payment وday-close guard: 244/244 ملفًا و547/547 اختبارًا، وtypecheck ناجح.
- typecheck وlint ناجحان حاليًا بحد Node 8GB.
- `npm run audit:coverage` يثبت تغطية mutation baseline بنسبة 100% (54/54 route files ضمن النطاق؛ 8 integration/bridge routes مستثناة من القياس التفصيلي).
- توجد مسارات ومكونات كثيرة للمخزون والمالية وHR والتوصيل والتكاملات والذكاء الاصطناعي.
- وثائق hardening وUAT واسعة، لكنها لا تثبت وحدها أن كل الرحلات جاهزة إنتاجيًا.
- توجد خطة غير مرتبطة للـ Theme Engine داخل tasks/plan.md؛ هذه الخطة مستقلة عنها ولا تستبدلها.
- تحديث تشغيلي 2026-10-28: تم إصلاح رفض hotfix على النسخ المثبتة القديمة؛ الـapplier يزامن launch gate مع أسرار الإنتاج، يصلح `.env` مع backup، ويستخدم `API_PORT` الفعلي. آخر حزمة 1.1.40 (`RestoFlow-HotFix-1.1.40-certified-20261028.zip`) تحققت من 8,577 ملفًا، وتشمل QR/public ordering وbirthday schema، و`installerHotfixContract` يمر 3/3. التطبيق على `C:\Program Files` ما زال يتطلب تشغيل الملف كمسؤول؛ الجلسة الحالية غير مرفوعة الصلاحيات.
- تحديث تحقق 2026-10-28: بعد تشغيل آمن على `RestoFlow_Test`، اجتازت `npm run test:integration -- --run` عدد `132/132` ملفًا و`669/669` اختبارًا (exit 0)، بما فيها SQL E2E للـQR modifiers والأحجام. الجولة الأولى كشفت schema drift في `birth_date` عند استيراد `server/app` مباشرة؛ تم إصلاحه بإجبار تهيئة marketing schema قبل CRM/order، والدليل في `docs/integration-evidence-2026-10-28.md`. قاعدة التشغيل `CoduisZen` لم تُلمس.

## مبادئ التنفيذ

1. لا نضيف ميزة فوق مسار مالي أو صلاحيات غير موثوق.
2. كل مرحلة تنتهي بشريحة رأسية تعمل من قاعدة البيانات حتى الواجهة والاختبار.
3. وجود route أو table لا يساوي اكتمال الميزة.
4. كل تكامل خارجي له retry وidempotency وdead-letter وobservability.
5. كل رقم في AI أو التقارير يرجع إلى مصدر قابل للتتبع.
6. كل migration قابلة للتراجع ولا تعمل على الإنتاج تلقائيًا.
7. `LedgerEngine` يستخدم correlation ثابتًا وSQL Server transaction lock لمنع تكرار posting عند retry، و`reverseEntry` يعيد استخدام transaction واحدة للقيد والعكس؛ وGL idempotency أصبحت branch-aware (`reference + referenceType + branchId`)؛ إثبات السباق الفعلي ما زال ضمن integration checkpoint.

---

## Phase 0: خط الأساس

### Task 0.1: إصلاح بوابة التحقق

**الهدف:** جعل typecheck وlint وbuild قابلة للتشغيل داخل CI.

**القبول:**
- [x] npm run typecheck ينجح دون OOM.
- [x] npm run lint ينجح.
- [x] npm run build ينجح (frontend/server).
- [x] حفظ baseline أولي لحجم bundle من production build؛ ما زال تحسين chunks الكبيرة بند أداء مستقل.
- [x] Excel lazy-load: تم تحويل `exceljs` إلى dynamic import داخل compatibility layer؛ build بعد التغيير يثبت عدم وجود مرجع `excel-export` من page-menu/page-inventory، فتُحمّل حزمة ~939KB فقط عند read/write صريح. بقي تحذير الحجم لأنه يقيس الحزمة المؤجلة نفسها لا التحميل الأولي.

**التحقق:** typecheck، lint، build.

**الاعتماديات:** لا شيء.

### Task 0.2: عزل الاختبارات وقاعدة البيانات

**القبول:**
- [x] كل database-backed test command يستخدم قاعدة اختبار معزولة؛ unit/security contract suites لا تحتاج اتصال قاعدة بيانات وتبقى بدونها عمدًا. الدليل الحالي: SQL integration كامل على `RestoFlow_Test` يمر بـ295/295 ملفًا و662/662 اختبارًا.
- [x] فشل آمن إذا كانت connection string إنتاجية؛ guard يرفض غياب قاعدة الاختبار أو تطابقها مع runtime أو اسم قاعدة التشغيل.
- [x] commands واضحة لـ unit وintegration وE2E؛ integration/E2E لديهما preflight قبل تشغيل Vitest.
- [x] test database guard موجود ويرفض التشغيل غير الآمن؛ الفحص الفعلي توقف آمنًا بـ`UNSAFE_TEST_DATABASE|TEST_DATABASE_URL_REQUIRED` قبل إنشاء pool لأن `TEST_DATABASE_URL` غير مضبوط. تكامل SQL Server نفسه يظل بند UAT منفصلًا يحتاج قاعدة اختبار فعلية.

**الحالة الحالية:** عند غياب `TEST_DATABASE_URL` يتوقف الأمر مبكرًا برسالة `UNSAFE_TEST_DATABASE|TEST_DATABASE_URL_REQUIRED` ولا يلمس `DATABASE_URL`. اختبارات guard وCI contract الحالية (8 اختبارات) ناجحة، أما suite SQL الكاملة فتظل غير معتمدة حتى توفير اتصال اختبار معزول وتشغيلها فعليًا.

**الاعتماديات:** 0.1.

### Checkpoint 0

- [x] typecheck/lint/build أخضر.
- [x] قاعدة الاختبار معزولة ومتحقق منها عبر preflight فعلي؛ التشغيل غير المهيأ رُفض قبل أي اتصال.
- [x] لا يبدأ تغيير مالي قبل هذا checkpoint؛ تم اجتياز checkpoint فعليًا قبل تغييرات المسارات المالية، ثم إثباتها باختبارات SQL المعزولة.

---

## Phase 1: الأمان والحدود المالية

### Task 1.1: authorization وbranch isolation

**القبول:**
- [~] كل list/detail/export/report يفرض branch scope من الخادم — تمت إضافة/إثبات scope وصلاحيات مخزون لمسارات inventory intelligence وتقارير الهالك، بما فيها warehouse/session/item ownership، كما أصبح cache التحليلات والقائمة branch-aware، ونسخ أسعار القائمة يتحقق من source/destination allow-list، وأصبح delivery zones/available drivers/driver roster يستخدمون `effectiveBranchId`، كما أصبح إنشاء وتعديل السائقين وstatus/GPS/assignment محكومًا بالفرع الفعلي، وأصبحت قراءات Attendance devices/geofences/bridge/reports/sessions/exceptions/corrections وقراءات tables/zones تستخدم selectors خادمية تسمح بالاختيار العابر للفروع للـSUPER_ADMIN فقط، وأضيفت حماية CRUD لـWebhooks مع اختبار branch isolation؛ ما زالت مراجعة بقية التقارير والقوائم والتكاملات مطلوبة.
- [~] لا يعتمد الأمان على إخفاء الزر — أضيفت بوابة صلاحية مالية فعلية لقراءات الميزانيات وتقارير/تصديرات إغلاق اليوم، كما أصبحت بيانات تكلفة/وصفة/تسعير المنصات في القائمة وعناوين/معرفات بوابات الطابعات، وتكلفة/سعر شراء inventory barcode lookup تُخفى خادميًا عن غير المخولين، مع اختبارات route/privacy contracts؛ ما زالت مراجعة شاملة لكل read endpoint الحساس واختبارات runtime/E2E مطلوبة.
- [~] منع تعديل branchId أو userId خارج النطاق — branch middleware يثبت النطاق، وإنشاء الطلب أصبح يستخدم `effectiveBranchId` الخادمي قبل أي branchId في body، وإدارة المخازن تمنع إعادة إسناد مخزن قائم خارج `SUPER_ADMIN`؛ وفتح الوردية، الميزانية، إغلاق اليوم، الجرد، المشتريات، المرتجعات، وإعدادات النظام أصبحت تربط actor بالمستخدم المصادق عليه بدل body، بما في ذلك الاسم الظاهر للطالب/المعتمد؛ ما زالت مراجعة كل mutation التي تقبل userId وcross-branch tests مطلوبة.
- [~] cross-branch tests لكل وحدة حرجة — أضيف branch binding خادمي لـpublic KDS/packing mutations (`bump`/`handover`) مع تحديث الشاشات واختبار contract، كما أزيل bypass الخاص بـ`OWNER` من Attendance وHR Extended، وأصبح Attendance يطبع `effectiveBranchId` داخل body قبل mutations بالإضافة إلى حراسة قراءات/تصديرات التقارير، وأصبح Talabat يفلتر الطلبات والـvendors حسب الفرع ويقصر config الحساس على الإدارة العليا، وأصبحت إدارة branch topology محصورة بالإدارة العليا وتحديثات مدير الفرع branch-bound، كما أصبحت إعدادات delivery platforms العالمية محصورة بالإدارة العليا؛ ما زالت تغطية SQL/E2E لكل الوحدات الحرجة مطلوبة.

**الاعتماديات:** 0.2.

### Task 1.2: money وfinancial invariants

**القبول:**
- [x] exact decimal strategy موحدة في المسارات التي تمت مراجعتها (minor units).
- [~] كل posting يحقق debit = credit — GL والـLedger محميان مركزيًا، وإنشاء الطلب أصبح لا يثق في `isPaid/paidAmount` من العميل ويشتق حالة الدفع من payment rows الموجبة، وأصبحت قيود wallet deposit/payment وloyalty redemption branch-required وتفشل مغلقًا عند غياب الفرع؛ ما زالت مراجعة كل مصادر القيود مطلوبة.
- [x] retry لا ينشئ journal أو payment مكررًا؛ payment initiation يحجز مجموع الجلسات `initiated/pending/confirmed` داخل قفل الطلب، ويرفض over-reservation، وidempotent replay يرجع نفس `sessionId` بعقد ثابت.
- [~] كل حركة مالية تحمل source وactor وbranch وcorrelation id — تم تثبيت ذلك صراحةً لمسارات التحويل البنكي والتسوية وبطاقات الهدايا والقيود اليدوية والمشتريات وCOGS والمخزون والهالك والإنتاج والرواتب والخزينة والمحفظة والمرتجعات وتسويات الدرج، وأصبح PO/GRN وفواتير المورد يستخدمون authenticated actor بدل body userId مع effective branch scope، وأصبح POS order يستخدم correlation ثابتًا للـretry؛ أضيف fail-closed للمحفظة بحيث لا تُعدّل قبل branch ونجاح GL، وأصبح إنشاء المحفظة داخل transaction نفسها؛ ما زالت مراجعة أي posting غير مار عبر GL والتكامل الفعلي مطلوبة.
- [x] اختبارات بيع/شراء/مرتجع/مصروف/إقفال — أضيفت contract/pure coverage للسيناريوهات الخمسة وتوازن القيود، واجتازت SQL integration الكاملة على `RestoFlow_Test` (295/295 ملفًا، 662/662 اختبارًا).

**الاعتماديات:** 1.1.

### Task 1.3: payment وwebhook authority

**القبول:**
- [x] payment session مرتبطة بالطلب والفرع؛ الجلسات الجديدة تحفظ `branch_id`، والـlegacy rows تُعمل لها backfill من الطلب، وأي branch drift أثناء التأكيد/العكس يُرفض.
- [x] توقيع webhook والتحقق من العمر والحالة — Paymob HMAC يستخدم مقارنة constant-time مع freshness window وحالات stale/bad signature موثقة ومختبرة.
- [x] duplicate webhook لا يكرر الدفع أو القيد — replay/amount-mismatch contract وSQL integration test موجودان، واجتازت SQL integration الكاملة على قاعدة اختبار معزولة؛ اعتماد gateway الحقيقي ما زال بندًا منفصلًا.
- [x] callback الموقّع له freshness window؛ stale callbacks تُرفض ولا تدخل retry queue.
- [x] Paymob public webhook يفرّق بين bad HMAC (401)، stale callback (409 بلا retry)، وفشل settlement المؤقت (202 مع retry queue) باختبار controller 3/3.
- [~] فشل المزود لا يجعل الطلب paid أو refunded كذبًا — settlement يرفض callback غير الناجح، ومسار refund يعيد payment/session إلى الحالة السابقة عند exception أو response سلبي/غامض؛ أضيف regression contract، وما زال اختبار gateway/runtime الفعلي مطلوبًا.
- [~] dead-letter وإعادة معالجة آمنة — payment webhook وfiscal لديهما مسارات محمية، وfinance exceptions أصبحت branch-scoped في retry/dismiss وpayload list sanitized، وfinance/fiscal retry وmanual finance retry وETA dead-letter replay أصبحوا atomic-claim مع lease recovery، وقوائم finance/ETA لا تعيد payload الخام؛ payment webhook لا يدخل retry إلا لأخطاء البنية التحتية transient، وما زال توحيد replay وatomic claims لكل مسارات finance مطلوبًا.
- [x] طلب refund من جلسة الدفع يدخل دورة موافقة branch-scoped مع audit ولا يعلن نجاحًا خارجيًا قبل تنفيذ adapter موثق.
- [x] refund processing يملك claim لمنع التوازي وكشف reconciliation للحالات العالقة، ولا يعيد المحاولة تلقائيًا عندما تكون نتيجة المزود غير محسومة.
- [~] Paymob settlement وإنشاء payment session أصبحا ذريين ومحصّنين ضد replay/concurrent initiation عبر transaction وقفل order وidempotent insert؛ over-reservation وbranch provenance وduplicate callback مثبتة integration، وunified webhook أصبح fail-closed للمزودين غير المدعومين، كما أصبحت مطابقة callback references مربوطة بالـorder/session branch scope، وأصبح legacy checkout مربوطًا بالـorder والفرع والرصيد المتبقي، والـrefund يمر عبر session/approval workflow؛ ما زال adapter/refund end-to-end يحتاج تغطية أوسع.
- [~] Refund processing يتحقق من branch ownership، ويستخدم transaction واحدة لتحديث order وإنشاء refund payment بمعرّف حتمي؛ ما زال إثبات التوازي الفعلي وحالة gateway الحقيقية يحتاج integration DB.

**الاعتماديات:** 1.2.

### Task 1.4: audit وsecrets وsecurity baseline

**القبول:**
- [~] لا توجد أسرار hard-coded — تم منع fallback من PAYMENT_TOKEN_SECRET إلى JWT_SECRET ومن PUBLIC_QR_SECRET إلى TRACK_TOKEN_SECRET، وأصبح السرّان المخصصان مطلوبين في env validation؛ ما زالت مراجعة شاملة لأدوات التشغيل الخارجية مطلوبة.
- [x] logs لا تحتوي tokens أو بيانات دفع — logger المركزي وerror handler يستخدمان سياسة redaction موحدة تشمل authorization/token/password/secret/API keys/card/CVV/IBAN، مع contract test يمنع العودة إلى masking محلي ناقص.
- [x] refund service يعيد فحص branch ownership داخل approve/reject/process، وتكامل gateway يمرر branch context للخدمة؛ لم يعد الاعتماد على middleware وحده كافيًا للحماية.
- [x] إعداد بوابة الدفع يعمل فعليًا لـPaymob/Card/InstaPay: يحفظ الإعداد branch-aware ويسجل audit metadata بلا أسرار؛ المزودون غير الموثقين يرفضون برسالة capability واضحة بدل `NOT_IMPLEMENTED`.
- [x] إعداد بوابة الدفع يتحقق من كل `branchIds` المرسلة مقابل صلاحيات المستخدم قبل الحفظ؛ لا يكفي امتلاك صلاحية الفرع الأساسي لتوسيع الإعداد لفروع أخرى.
- [x] تثبيت `branchId` الخادمي بعد دمج body في إعداد بوابة الدفع؛ body لا يستطيع تجاوز الفرع الذي حسمه middleware حتى مع وجود query scope مختلف.
- [x] AI prompt safety: رسائل المستخدم الطويلة أو محاولات override/استخراج الأسرار عالية الثقة تُحجب، ورسالة المستخدم والـcontext تُرسل للنموذج داخل حدود `untrusted-data`؛ أضيفت اختبارات pure بدون اتصال خارجي.
- [x] AI branch isolation: `/ai/insights` و`/ai/forecast` يمران عبر `scopeBranchQuery`، والتحليلات تقيد orders بالفرع الخادمي المحسوم بدل الثقة في query وحده؛ أضيف contract test.
- [x] AI action branch authorization: `action-preview` و`action-execute` يرفضان أي `branchId/assignedBranchId` خارج نطاق المستخدم قبل guard أو mutation؛ أضيف policy وcontract tests وأُدخل اختبار السياسة في unit gate.
- [x] offline order payload conflict: queue لا يستبدل طلب CREATE بنفس المعرف إذا اختلف payload؛ يحوله إلى `CONFLICT` مع `IDEMPOTENCY_KEY_PAYLOAD_CONFLICT`، بينما تبقى تحديثات status الطبيعية قابلة للاستبدال؛ أضيفت pure tests.
- [~] audit يسجل before/after والفاعل والوقت والفرع؛ تم تغطية دورة الطلب الأساسية: إنشاء، تغيير حالة، تعديل العميل، تعديل العناصر، وتقسيم الطلب، مع payload آمن موقّع.
- [x] rate limits على login/webhooks/العمليات الحساسة — login وPIN لديهما throttle مستقل، والـAPI limiter عام، والـwebhook/hardware callbacks لديها limiter مستقل بحد أقل، وOAuth authorize/token لديهما bucket مستقل بحد 60 طلبًا/دقيقة مع اختبار 429؛ تم إصلاح عزل bucket الخاص بالـwebhooks.
- [x] webhook SSRF guard — endpoint URL يقتصر على HTTP(S) بلا credentials، ويُرفض private/local/metadata target مع إعادة فحص DNS قبل delivery.
- [x] webhook branch routing fail-closed — endpoint المرتبط بفرع لا يستقبل event بلا `branchId` أو event من فرع آخر.
- [x] webhook delivery history privacy — operator-facing delivery history redacts credentials, contact data, and payment/card fields while raw payload remains internal only for retry processing.
- [x] webhook retry lease — failed delivery retries claim rows with `RETRYING` + `next_retry_at`, recover expired claims, and close the original attempt only after delivery success/failure is known.
- [x] refund legacy branch fail-closed — records without branch ownership are inaccessible to non-SUPER_ADMIN callers.
- [x] security regression suite ناجحة — `npm run test:security` يشغّل 22 ملفًا و65 اختبارًا يغطي audit redaction، secrets، branch isolation، gateway/webhook/payment privacy وlog privacy.
- [x] Attendance Bridge لا يعيد استخدام Print Gateway credential، وله secret مستقل وproduction validation.
- [x] Audit HMAC يدعم key version ومفتاحًا سابقًا مؤقتًا أثناء rotation مع اختبار تحقق للسجلات القديمة.
- [x] كل mutation يمر عبر global auth boundary يحصل على signed request/result baseline، وقياس controller-level before/after أصبح متاحًا عبر `npm run audit:coverage`.
- [x] order lifecycle mutations الأساسية تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 33.3% (17/51 route files).
- [x] inventory mutations عالية الأثر (adjustment, receipt, transfer, wastage request/approval) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 37.3% (19/51 route files).
- [x] production lifecycle mutations (create, start, complete, cancel) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 39.2% (20/51 route files).
- [x] customer mutations (create, update, archive, address, loyalty redemption) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 41.2% (21/51 route files).
- [x] delivery lifecycle mutations (assign, pickup, deliver, fail, cash settlement) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 43.1% (22/51 route files).
- [x] KDS mutations (dispatch, ready, served, recall, handover, item toggle) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 45.1% (23/51 route files).
- [x] procurement mutations الأساسية (supplier create/update/deactivate وPO create/status/receipt) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 47.1% (24/51 route files).
- [x] shift/day-close mutations (open/close shift، تحديث business date، إغلاق/إعادة فتح اليوم) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 49% (25/51 route files).
- [x] finance approvals and controls (approval create/approve/reject، journal submit/approve/reverse، exception resolve، reconciliation، period close) تحمل domain audit موقّعًا؛ القياس الحالي ثابت عند 49% لأن route-to-controller linker يحتاج توسعة لاحتساب هذه الملفات.
- [x] HR core mutations (employee create/update/deactivate وattendance clock-in/clock-out) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 51% (26/51 route files).
- [x] attendance operations mutations (manual punch، correction request/approve/reject، exception resolve/assign/escalate) تحمل domain audit موقّعًا، وارتفعت التغطية التفصيلية إلى 52.9% (27/51 route files).
- [x] attendance device and synchronization mutations (device lifecycle، employee mappings، device sync/commit/settings، bridge sync/clear/restart، bulk sync، TXT import، auto-sync start/stop) تحمل domain audit موقّعًا، مع حجب IP وسجلات البصمة الخام من الـpayload؛ القياس الحالي ما زال 52.9% لأن route-to-controller linker لا يحتسب هذا الملف ضمن الملفات المغطاة بعد.
- [x] administrative domain mutations (branch lifecycle، role lifecycle/permission sync، settings updates، tenant subscriptions/onboarding) تحمل domain audit موقّعًا دون تسجيل server IP أو قيم الإعدادات أو permissions الخام؛ ارتفعت التغطية المقاسة إلى 60.8% (31/51 route files).
- [x] reservation and waitlist mutations تحمل domain audit موقّعًا، والـwaitlist أصبح يفرض branch isolation ويتحقق من ملكية الفرع قبل تحديث السجل؛ لا تُسجل أرقام الهاتف الخام، وارتفعت التغطية المقاسة إلى 64.7% (33/51 route files).
- [x] printer lifecycle mutations أصبحت branch-scoped وتتحقق من ملكية الفرع قبل التعديل/التعطيل، مع signed audit لا يسجل عنوان الجهاز؛ setup bootstrap/COA/reset وعمليات verify/tamper في Audit تحمل signed domain audit ببيانات وصفية فقط؛ ارتفعت التغطية المقاسة إلى 70.6% (36/51 route files).
- [x] Paymob configuration/checkout/refund تحمل signed audit بدون مفاتيح أو billing data، وWhatsApp engine/config/campaign/test/escalation mutations تحمل signed audit بدون أرقام الهواتف أو نص الرسائل؛ inbox/escalations أصبحت branch-scoped؛ ارتفعت التغطية المقاسة إلى 74.5% (38/51 route files).
- [x] budget mutations أصبحت branch-scoped وتتحقق من ملكية الميزانية قبل القراءة/التعديل/الحذف، وfiscal submit/retry/dismiss تحمل signed audit؛ ارتفعت التغطية المقاسة إلى 78.4% (40/51 route files).
- [x] aggregator provider config/test orders، delivery platform lifecycle، وTalabat config/order/catalog/outlet/promotion mutations تحمل signed audit دون تسجيل مفاتيح التكامل أو payloads الخام؛ ارتفعت التغطية المقاسة إلى 84.3% (43/51 route files).
- [x] call-center escalation/coaching/discount/retry mutations أصبحت branch-scoped وتحمل signed audit، وcampaign/coupon/complaint mutations تحمل signed audit مع حجب نصوص الرسائل وملاحظات الشكاوى من payload؛ ارتفعت التغطية المقاسة إلى 90.2% (46/51 route files).
- [x] deployment/image/mail/migration mutations تحمل signed audit؛ migration أصبح authenticated وbranch-scoped والـuser PIN يُحفظ كـhash فقط، و`audit-coverage` يثبت 100% (54/54) لملفات الـinternal mutation routes المشمولة؛ تبقى 8 integration/bridge routes مستثناة من القياس التفصيلي لحين اختبارها end-to-end.
- [x] audit signature hardening: تحقق HMAC أصبح constant-time مع رفض آمن للتوقيع المعدل أو malformed، وأضيف regression test مع branch tampering؛ مراجعة runtime الفعلية لـADMS/Bridge/public/webhooks ما زالت مطلوبة.
- public operator screens لا تُرجع customer phone، وعمليات KDS ticket bump وpacking handover أصبحت branch-scoped signed-audit؛ ما زالت مراجعة بقية public/integration routes واختبارات runtime مطلوبة.
- ADMS لا يبث raw biometric rows أو user identifiers؛ البث أصبح branch-scoped count-only، وpayload المقبول يسجل signed audit، والجهاز غير المسجل يُرفض؛ ما زالت اختبارات الجهاز الحقيقية وBridge E2E مطلوبة.
- Attendance Bridge register/claim/complete/backup/ingest أصبحت تسجل signed audit branch-scoped ببيانات aggregate فقط؛ ما زال اختبار bridge runtime وقاعدة الاختبار المعزولة مطلوبين.
- Talabat/Aggregator webhook processing وإدارة webhook endpoints أصبحت تحمل signed audit، وresponses الإدارية لا تعيد secrets أو قيم headers؛ ما زال runtime E2E للتكاملات مطلوبًا قبل إغلاق Slice 4.

**الاعتماديات:** 1.1 و1.3.

### Checkpoint 1

- [x] بيع ودفع ومرتجع ومصروف وإقفال بلا تكرار أو عدم توازن — SQL checkpoint coverage ناجحة في `financeCriticalPaths` و`dayCloseBusinessDate` و`dayCloseReopen` (5/5 tests)، مع full SQL integration 295/295 ملفًا و662/662 اختبارًا.
- [x] cross-branch وsecurity tests ناجحة — security suite 66/66 ملفًا و141/141 اختبارًا، وfull SQL integration 295/295 ملفًا و662/662 اختبارًا.
- [~] مراجعة repository gate موثقة في `docs/code-review-gate-2026-10-28.md` ونتيجتها PASS WITH FOLLOW-UP؛ الإغلاق الكامل ما زال يتطلب مراجعة بشرية من مهندس ثانٍ واختبارات UAT/runtime الخارجية.

---

## Phase 2: Offline وموثوقية الفرع

### Task 2.1: Offline Contract

**القبول:**
- [x] مصفوفة online/offline/recovery لـ POS/KDS/printer/payment/loyalty — موثقة في `tasks/offline-operational-matrix.md` مع فصل صريح بين evidence الحالي ومتطلبات UAT.
- [x] حدود الدفع Offline أصبحت fail-closed: الطلب أو status mutation لا يدخلان الطابور إلا بنقد، و`SPLIT` لا يُقبل إلا إذا كانت كل أجزائه نقدية؛ non-cash يرفض بـ`OFFLINE_NON_CASH_PAYMENT_UNSUPPORTED` قبل التخزين أو replay، مع contract tests.
- [x] رسائل واضحة لكل limitation — شريط الاتصال يعرض حدود النقد والدفع الإلكتروني والطباعة المحلية/الشبكية ومركز التعارضات بالعربي والإنجليزي، مع `role=status` و`aria-live`; اختبار UX `9/9` وtypecheck وlint للمسارات المعدلة ناجحة.
- [x] القرار محفوظ في docs: `tasks/offline-operational-matrix.md`.
- [~] كل adapters الحالية أصبحت مغطاة بـreplay smoke tests؛ شغّلت بوابة offline الحالية 10 ملفات و45/45 اختبارًا، وreplay يرفض اختلاف branch في envelope أو payload قبل الـAPI، مع assertion صريح بأن `IDEMPOTENCY_KEY_PAYLOAD_CONFLICT` وأخطاء الأعمال لا تتحول إلى `SYNCED`، وإعادة استخدام نفس Idempotency-Key مع أثر خادم واحد؛ ما زالت duplicate/conflict assertions المتخصصة لكل domain واختبار الأجهزة الفعلية مطلوبة.
- [~] retry policy أصبحت تضع branch/auth/unsupported/business errors في Conflict Center، ولا تعيد المحاولة إلا للأخطاء transient؛ أضيفت طبقة database recovery تغلق الـstale pool وتعيد الاتصال مرة واحدة لقراءات `SELECT` فقط، بينما الكتابات ذات الاستجابة المفقودة تفشل بأمان وتُترك لـtransaction/idempotency domain flow لمنع duplicate commit، مع regression tests (`5/5`). أصبح restart/hotfix يرسل `drain.request` ويمنع الطلبات الجديدة برسالة `SERVER_DRAINING` وينتظر الطلبات الجارية حتى 35 ثانية قبل force exit؛ runtime contract `8/8` وserver build ناجحان. ما زال انقطاع الشبكة الفعلي بين أجهزة الفرع واختبار الدفع/الإقفال في UAT مطلوبًا.
- [~] عند تحويل queue item إلى `CONFLICT` يتم الآن إلغاء `nextAttemptAt` ومسح قابلية الجدولة، مع اختبار lifecycle فعلي يثبت الفرق بين conflict و503 retry.
- [~] أوامر الـcentral deployment أصبحت تمر عبر نفس branch boundary ولا يتم acknowledge للأمر المخالف؛ ما زالت اختبارات التشغيل على شبكة ضعيفة وserver restart مطلوبة.
- [~] queue claim أصبح ذريًا داخل Dexie transaction مع إعادة فحص status/lease/retry قبل الإرسال، وأثبت اختبار multi-tab فعلي باتصالين IndexedDB مستقلين أن duplicate replay لا يحدث بين تبويبات POS؛ ما زال server restart واختبار شبكة ضعيفة ضمن UAT مطلوبين.
- [x] الطباعة المحلية أثناء Offline أصبحت تمر مباشرة إلى loopback hardware bridge للطابعات `LOCAL/WINDOWS/USB`، بينما `NETWORK/LAN` لا تُرسل محليًا وتنتظر server queue؛ اختبارات policy وfallback 4/4 و`node --check hardware-bridge/index.js` ناجحة.
- [x] local lease recovery contract أصبح مثبتًا: القفل القديم يُستعاد ويُرسل مرة واحدة، والقفل الحديث لا يُرسل من تبويب آخر؛ اختبارا recovery/active-lease أُضيفا إلى offline lifecycle، مع بقاء IndexedDB متعدد التبويبات وserver restart الحقيقيين ضمن UAT.
- [~] replay يرفض أي queue payload لا يطابق branch envelope أو الفرع النشط قبل استدعاء الـadapter؛ ما زالت مصفوفة التشغيل الكاملة واختبارات كل domain مطلوبة.

**الاعتماديات:** Checkpoint 1.

### Task 2.2: local branch runtime

**القبول:**
- [~] إنشاء وتعديل الطلب وإرساله للمطبخ محليًا — الطلبات غير المتزامنة تظهر الآن في KDS من IndexedDB عند فشل الخادم، بينما dispatch المحلي الكامل وتعديل الطلبات/عناصر التذكرة ما زالا يحتاجان عقدًا مستقلًا.
- [~] KDS يتلقى من local hub — أضيف fallback branch-scoped للطلبات المحلية، وhub فوري عبر `BroadcastChannel`/`storage` مع validation للنوع/العمر وdedupe، ومع Bump/Recall يدخلان `orderStatus` queue؛ ما زال الربط بين أجهزة فعلية عبر LAN وتعديل عناصر التذكرة غير مثبتين.
- [x] الطباعة تستمر محليًا للطابعات `LOCAL/WINDOWS/USB` عبر loopback bridge أثناء Offline؛ طابعات `NETWORK/LAN` تبقى server-queued، واستمرارية queue بعد إعادة تشغيل الـbridge ما زالت ضمن UAT.
- [~] عودة الشبكة تعمل sync مرة واحدة — أضيف single-flight guard test يثبت أن الاستدعاء المتوازي داخل التبويب لا يرسل الطلب مرتين؛ multi-tab/server-restart/network UAT ما زال مطلوبًا.
- [~] لا duplicate orders أو payments — queue dedupe أصبح ذريًا داخل Dexie transaction، وإعادة replay تستخدم idempotency key ثابتة، مع contract tests؛ ما زال إثبات التوازي بين أجهزة فعلية وSQL/E2E مطلوبًا.
- [x] سياسة الدفع أثناء Offline — تم ربط `assertOfflinePaymentPolicy` فعليًا بمسار queue ومسار replay؛ الكاش/البطاقات/المحافظ تُرفض قبل إنشاء أثر خادمي، والنقد وsplit النقدي فقط مسموحان. اختبار `offlineCoreReplay` يمر 8/8.

**الاعتماديات:** 2.1.

### Task 2.3: recovery وconflict center

**القبول:**
- [x] queue تعرض pending/failed/conflicted — شاشة Offline Conflict Center تعرض الحالات غير المتزامنة للفرع النشط وتفصل إحصاءات pending/failed/conflicts/synced.
- [x] retry آمن — failed retry يعيد العنصر إلى PENDING بعد branch assertion ويضع audit event، وconflict retry/merge/discard يعيد ضبط lease/retry metadata.
- [x] المدير يحل conflict بصلاحية — المسار محمي بصلاحية `CFG_OFFLINE_MODE`، وكل mutation يعيد التحقق من الفرع النشط.
- [x] كل resolve في audit — retry وmerge/retry/discard يضيفون audit queue item branch-bound قبل تغيير الحالة.
- [ ] اختبار server restart وانقطاع الشبكة أثناء الدفع والإقفال.
- [x] Day-close offline guard — العميل يرفض بدء الإقفال أو تغيير business date بدون اتصال حي برسالة `DAY_CLOSE_REQUIRES_ONLINE`، بينما يظل مسار الإقفال المتصل idempotent على الخادم؛ الاختبار 2/2.

**الاعتماديات:** 2.2.

### Checkpoint 2

- [ ] يوم تشغيل كامل online/offline/recovery بلا فقد أو تكرار.
- [ ] pilot داخلي على شبكة ضعيفة.

---

## Phase 3: التكاملات والأجهزة

### Task 3.1: Public API وDeveloper Portal

**القبول:**
- [~] OpenAPI للموارد العامة — أضيف `/api/v1/openapi.json` وContracts موثقة للـmenu/quote/order create/order detail/checkout/hours وQR capability flow وOAuth authorization/code exchange؛ live provider verification وSQL/UAT خارج الإغلاق النهائي.
- [x] OAuth/API keys وscopes — أضيفت إدارة مفاتيح دائمة من داخل API الإداري (`list/create/rotate/revoke`) وواجهة Security داخل النظام، مع hash-only وsecret مرة واحدة، scopes وbranch allow-list وlast-use وexpiry/revocation، وclient-credentials وrefresh rotation، وأضيف Authorization Code + S256 PKCE مع redirect allow-list، consent summary، branch delegation، one-time hashed codes وreplay protection؛ ما زال SQL/UAT الفعلي مطلوبًا.
- [x] versioning وbackward compatibility — أول surface تحت `/api/v1`، دون تغيير المسارات الحالية.
- [x] sandbox وsample app — أضيف sandbox read-only تحت `/api/v1/sandbox/orders` مع `sandbox:read` وبيانات ثابتة بلا PII أو دفع، ومثال Node 20 dependency-free يوضح OAuth وقراءة الطلبات وإنشاء Webhook اختياريًا.
- [x] rate limits وrequest ids — الـPublic API يمر عبر API limiter وrequest-context الحاليين؛ public webhook CRUD وOpenAPI docs وواجهة Webhook داخل Security أضيفت، مع بقاء OAuth advanced grants خارج النطاق الحالي.

**الاعتماديات:** Phase 1 و2.

### Task 3.2: integration runtime

**القبول:**
- [~] retry/backoff/idempotency موحدة — health يلخص حالة الإعداد بدون أسرار، وأضيفت policy مشتركة للـwebhooks وكل Talabat outbound (token/order/catalog/promotion/outlet) مع timeout وbounded retry؛ marketplace ingress أصبح idempotent مع fingerprint/replay/conflict SQL evidence (`2/2`)؛ aggregators inbound وتدفق Talabat يستخدمان الآن atomic `IN_PROGRESS` claim قبل side effects، ويرفض Talabat والـaggregators إعادة استخدام external order ID ببيانات مالية/فرع مختلف عبر payload fingerprint conflict، مع aggregator contract regression (`5/5`) وTalabat unit regression (`3/3`) وSQL concurrency/conflict evidence للـaggregator (`1/1`) وTalabat (`2/2`)؛ ETA outbound يستخدم الآن timeout وIdempotency-Key ثابتة وتصنيفًا مشتركًا يمنع retry لأخطاء 4xx الدائمة، وdeployment heartbeat يستخدم timeout وretry محدودًا وIdempotency-Key header بدون إرسال token في body، وOpenWA outbound يستخدم timeout صريحًا، وPaymob auth/order/payment-key/refund يستخدم timeout موحدًا بدون retry تلقائي لعمليات POST غير الآمنة؛ runtime policy regression (`3/3`) ناجح، بينما suites Paymob ذات mocks تحتاج إصلاح test-harness منفصل بسبب عدم توافق mock `server/db` مع setup العام؛ أضيف Paymob live auth probe اختياري، بينما باقي aggregators تحتاج نفس الترحيل أو endpoint موثق.
- [~] dead-letter وreplay آمن — payment webhook DLQ أصبح قابلًا للعرض كـmetadata فقط وإعادة الإدخال عبر endpoint مالي محمي بالفرع وatomic claim؛ وأضيف aggregator inbound DLQ metadata/replay مع إعادة normalization وbranch fail-closed؛ ما زال توحيد DLQ/replay على باقي connectors مطلوبًا.
- [~] health dashboard لكل provider — أضيفت لوحة داخل شاشة المنصات تعرض configured/connectivity وUNVERIFIED/ERROR وlatency مع refresh وحالات loading/error؛ ما زالت live probes الفعلية للـaggregators غير المتاحة دون endpoint موثق.
- [~] connector contract tests — أضيفت contract tests فعلية لـFawry/Stripe/Vodafone Cash وPaymob/InstaPay، ومعها inbound contracts لكل providers المعروفة في aggregators، مع normalization/status/auth/idempotency وpayload-conflict fingerprint؛ الـaggregator outbound contracts وlive provider verification ما زالت مطلوبة.

**الاعتماديات:** 3.1.

### Task 3.3: hardware certification

**القبول:**
- [x] test harness آلي للطابعات والكاش دراور والباركود والـ scales، مع فصل واضح بين دليل المحاكاة والاعتماد الفعلي؛ تشغيل `npm run hardware:certify` نجح، والدليل في `docs/hardware-certification-evidence-2026-10-28.md`.
- [x] مصفوفة قدرات توضح مسارات LOCAL/WINDOWS/USB مقابل NETWORK/LAN وما يلزم لإثبات كل جهاز.
- [ ] مصفوفة أجهزة فعلية معتمدة مع أدلة قبول قابلة لإعادة التشغيل.
- [x] customer display عام branch-scoped يعرض أرقام READY/DELIVERED الحديثة فقط بدون PII أو payment data؛ الـkiosk الداخلي موجود ويحتاج UAT كامل.
- [x] local printing أثناء offline للطابعات المحلية/USB/Windows؛ مسار الشبكة يحتاج server queue.
- [x] troubleshooting guide: أضيف `docs/troubleshooting-guide-ar.md` بخطوات تشخيص status/SLA، الجلسات، offline conflicts، الدفع وDLQ، الطباعة/KDS، اختلاف التقارير، وDR، مع حدود واضحة لما يحتاج UAT أو اعتماد أجهزة.

**الاعتماديات:** 2.2 و3.2.

### Task 3.4: marketplace وpartner onboarding

**القبول:**
- [ ] تسجيل partner وapp permissions.
- [ ] review/certification process.
- [ ] entitlement أو billing للتكامل.
- [ ] marketplace داخل الإدارة.

**الاعتماديات:** 3.1 و3.2.

### Checkpoint 3

- [ ] تكامل payment وdelivery وaccounting وmessaging مختبر.
- [ ] جهاز POS وطابعة وكاش دراور معتمدون.
- [ ] تكامل جديد يمكن بناؤه دون تعديل core.

---

## Phase 4: Commerce وCustomer Growth

### Task 4.1: online ordering وQR وkiosk

**القبول:**
- [~] Public Menu Contract تحت `/api/v1/branches/{branchId}/menu` يعرض published/available items مع branch/channel pricing موحّد، ويطبق availability days/time windows حسب timezone الفرع، وبدون cost/internal platform data؛ وأضيف Quote تحت `/orders`، ثم Public Order Creation تحت `POST /orders` بصلاحية `orders:write` و`Idempotency-Key` يمر عبر canonical pricing/inventory/KDS/finance pipeline ويظل unpaid، مع `/hours` وحالة `isOpen` ومنع الطلب خارج ساعات التشغيل؛ وأضيف QR capability flow مربوط بفرع/طاولة للـdine-in، وواجهة عامة `/qr/:branchId/:tableId` بقائمة وسلة وإرسال idempotent ورابط tracking؛ payment/checkout الخارجي مؤجل حسب نطاق المنتج الحالي.
- [x] QR table order وkiosk order: signed QR للـmenu وDINE_IN order مربوط بفرع/طاولة، وواجهة self-ordering kiosk ترسل `KIOSK` unpaid إلى canonical `placeOrder` مع branch scope؛ دعم QR modifiers والأحجام أصبح كاملًا من عرض الاختيارات إلى authoritative pricing ورفض tampering وحفظ الاختيار؛ اختبار SQL الفعلي `publicQrModifiers.test.ts` وregression core order اجتازا 15/15، وما زال UAT الفعلي واعتماد hardware مطلوبين.
- [~] payment وorder status — order detail/tracking projection privacy-safe ومختبر contract، وPaymob hosted checkout idempotent مع settlement path؛ live Paymob credentials/callback وSQL Server UAT ما زالا مطلوبين.
- [x] منع الطلب من صنف غير متاح أو فرع مغلق: quote وpublic order يفحصان branch activity/hours و`isMenuItemAvailableNow` قبل التسعير أو إنشاء الطلب؛ أضيف contract test، وما زال SQL/E2E مع ساعات وفروع حقيقية مطلوبًا.
- [x] analytics للقناة: `GET /analytics/channel-performance` يعرض revenue/order count/average ticket/cancellations حسب القناة مع branch/business-date scope؛ أضيف contract test، وما زال SQL/UAT الفعلي مطلوبًا.

**الاعتماديات:** Phase 1 و2 و3.

### Task 4.2: Customer 360 وloyalty

**القبول:**
- [~] identity resolution: canonical Egyptian phone policy، منع duplicate create عبر صيغ `+20/0020/بدون الصفر`، و`GET /api/customers/identity-candidates` بدرجات تطابق، و`GET /api/customers/identity-duplicates` لتقرير مراجعة read-only، وprivileged `POST /api/customers/:id/merge` داخل transaction مع source archive وaudit؛ ما زال SQL/UAT الفعلي واختبار rollback الكامل مطلوبين.
- [x] orders/points/wallet/gift card في ملف واحد عبر `GET /api/customers/:id/360`، مع عناوين العميل، ملخص آمن، آخر 20 طلبًا، وسجلات الولاء/المحفظة، وكلها branch-scoped.
- [~] Customer 360 و`refundService.getRefunds/getRefundById` يفضّلان الآن projection من جدول `refund_records` branch-scoped، ويدمجان settings legacy كـfallback deduplicated حسب refund ID مع count/value؛ أضيف dual-write لدورة الطلب/الموافقة/الرفض/المعالجة. تم تحسين Customer 360 لتمرير `orderIds` إلى SQL، وإضافة repair insert-only قابل لإعادة التشغيل مع Preview وانتظار اتصال SQL في cold-start واختبار SQL حقيقي، وإضافة pagination محدودة للمرتجعات مع مؤشرات كاملة؛ المتبقي migration النهائية وإزالة mirror وUAT.
- [x] loyalty قابلة للتدقيق عبر `loyalty_ledger` مع عرض السجل في CRM، ومنح/سحب النقاط يربطان الآن بمرجع الطلب الثابت لمنع replay داخل الـ transaction؛ أصبحت قراءة الرصيد داخل transaction، وخصم الاستبدال ذريًا بشرط الرصيد، ويدعم `Idempotency-Key` لمنع تكرار الاستبدال.
- [~] refund/clawback موجود مع حارس replay داخل الخدمة و`operation_key` unique filtered في SQL Server للعمليات الجديدة؛ اختبار refund integration الفعلي ومعالجة أي legacy duplicates ما زالا مطلوبين.
- [~] الفرع مقيّد في Customer 360 والطلبات والكروت؛ أضيف branch provenance لـ`loyalty_ledger` و`wallet_transactions` و`customer_wallets` مع repair migration، unique filtered index للمحفظة الجديدة، وفلترة Customer 360 واختبار SQL فعلي. عمليات المحفظة الجديدة أصبحت branch-scoped، بينما الأرصدة القديمة ذات `branch_id = NULL` محفوظة ومعلّمة `GLOBAL_LEGACY` ولا يتم توزيعها تخمينيًا؛ ما زالت سياسة ترحيل الرصيد التاريخي والنقاط وUAT متعددة الفروع مطلوبة.

**الاعتماديات:** 4.1 وPhase 1.

### Task 4.3: marketing automation

**القبول:**
- [~] segments/RFM/churn: RFM snapshots تُحسب عند إتمام الطلب، وأضيف `GET /api/reports/customer-rfm` branch-scoped و`POST /api/reports/customer-rfm/refresh` بحد أقصى 1000 عميل، صلاحية `OP_MANAGE_MARKETING` وsigned audit؛ ما زال churn attribution وSQL/UAT الفعليان مطلوبين.
- [~] journeys عبر WhatsApp/SMS/email/push: scheduler فعلي للحملات `SCHEDULED` أصبح يعمل كل دقيقة، يحل `ALL/VIP/INACTIVE_30_DAYS/NEW_CUSTOMERS_7_DAYS/BIRTHDAY_TODAY`، ويدعم شرائح RFM الحقيقية `CHAMPIONS/LOYAL/AT_RISK/ABOUT_TO_SLEEP/NEED_ATTENTION/LOST` مع branch scope، يفرض consent القنوي، ويستخدم idempotency لكل موعد؛ أضيف حقل `birth_date` اختياري مع migration وCRM field، وإعدادات أتمتة محفوظة ومراجعة signed audit؛ EMAIL/PUSH وprovider/UAT الفعليان ما زالا مطلوبين.
- [~] consent وunsubscribe: customerIds والـ explicit phone recipients والـ automated win-back يحترمون opt-out المعروف، وأضيف `PATCH /api/customers/:id/marketing-consent` مع global/channel preferences لـEmail/SMS/WhatsApp/Push، `marketingOptOutAt` وسجل audit موقّع؛ ما زال سجل consent/unsubscribe الخارجي ومزامنة provider وUAT مطلوبين.
- [~] campaign attribution وROI: orders تدعم `campaignId`/`utm_campaign` مع additive migration/index، والكوبونات تقبل `campaignId` وتملأ attribution عند الاستخدام، وتقرير ROI يحسب completed/delivered attributed revenue ويعرض stored estimate منفصلًا؛ end-to-end attribution UAT ما زال مطلوبًا.
- [~] deduplication: dispatch الحملة يدعم `Idempotency-Key` مع request-hash conflict، claim لمدة 24 ساعة، replay للنتيجة المكتملة ومنع concurrent duplicate dispatch؛ ما زال إثبات provider/SQL Server الفعلي مطلوبًا.

**الاعتماديات:** 4.2 و3.2.

### Checkpoint 4

- [ ] online-to-kitchen-to-customer رحلة كاملة.
- [~] reward/coupon والمرتجع — coupon discount و`usedCount` يحسبان داخل transaction، وأصبح `orders.coupon_code` و`coupon_discount_amount` مصدرين canonical، كما يوزّع item refund الخصم الكلي وخصم الكوبون والضريبة النهائية حتميًا ويحفظ metadata داخل `refund_records`؛ إلغاء الطلب يحرر claim الكوبون مرة واحدة atomically مع signed audit، بينما المرتجع لا يحرره تلقائيًا للحماية من الإساءة؛ loyalty award/clawback يعتمد صافي total ويدعم replay safety. ما زال يلزم SQL/UAT كامل يثبت refund allocation للكوبون/المكافأة.
- [ ] campaign لها consent وROI.

---

## Phase 5: Intelligence وBI

### Task 5.1: semantic metrics

**القبول:**
- [x] قاموس metrics رسمي: `server/services/metricCatalog.ts` و`GET /analytics/metrics/catalog` يعرضان التعريفات canonical.
- [x] مصدر كل KPI معروف: كل تعريف يتضمن formula وsource columns وdrill-down path.
- [~] business date/branch filters موحدة: analytics branch-performance أصبح يستخدم `effectiveBranchId` وparser مركزيًا لـ`businessDateFrom/To` مع فلترة `orders.businessDate`؛ بقية التقارير تحتاج migration لنفس policy.
- [~] drill-down من KPI إلى transaction: catalog يعلن مسارات drill-down canonical، لكن إثبات كل route end-to-end ما زال مطلوبًا.
- [x] reconciliation job read-only: مقارنة canonical orders مع daily BI snapshots عبر `analyticsService.reconcileBranchSnapshots` و`GET /analytics/reconciliation`؛ الإصلاح التلقائي متعمد أن يبقى منفصلًا حتى تتم مراجعة الفروق.

**الاعتماديات:** Phase 1 و4.

### Task 5.2: grounded AI assistant

**القبول:**
- [x] `/ai/insights` يعيد الفترة والفرع والمصدر والمقاييس وحداثة البيانات؛ أضيف contract test.
- [x] عند غياب البيانات يرجع رسالة deterministic ولا يستدعي AI بدل توليد استنتاج من أصفار؛ أضيف contract test.
- [x] actions الحساسة تحتاج confirmation وpermission: preview يعلن الحاجة للتأكيد، والتنفيذ يفرض `AI_EXECUTE` بعد permission وbranch guard؛ أضيفت policy وcontroller contract tests.
- [x] prompt injection وحماية البيانات مختبرة: prompt safety يحدد أنماط الحقن، يحد الطول، ويغلف بيانات الأعمال كـuntrusted context؛ أضيفت اختبارات contract.
- [x] فشل مزود AI لا يعطل التشغيل: `/ai/insights` يعيد fallback حتميًا مع حالة degraded واضحة، و`/ai/chat` لديه system-copilot fallback؛ أضيف contract test للـinsights.

**الاعتماديات:** 5.1.

### Task 5.3: forecasting وanomaly detection

**القبول:**
- [x] revenue forecast يعيد confidence محسوبة من R² مع سقف تغطية، و`dataAsOf`/`dataFreshnessHours`/مصدر صريح؛ أضيف contract test.
- [x] AI inventory forecast أصبح structured ويرجع branch scope، فترة البيانات، sample days، freshness، ومصدر `SALE_CONSUMPTION`، ويستخدم `orders.businessDate` عند ربط الحركة بالطلب مع date basis معلن، مع تغليف اسم الصنف والبيانات التاريخية كـuntrusted AI data، وحالات `INSUFFICIENT_DATA`/`DEGRADED_FALLBACK` عند عدم كفاية التاريخ أو تعطل المزود؛ أضيفت contract tests.
- [x] reorder recommendation تعرض سببًا، urgency، usage، days-to-stockout، وتكلفة تقديرية محسوبة من `costPrice` مع مصدر صريح؛ أضيف contract test.
- [x] anomaly في void/discount/refund/cash: `/analytics/anomalies` يحلل آخر 30 يومًا، يفرض branch scope، ويعيد severity/z-score/explanation/source؛ أضيفت اختبارات pure وroute contract.
- [x] قياس دقة التوقع: revenue forecast يعيد walk-forward holdout MAPE وعدد أيام الاختبار، أو `null` عند عدم كفاية التاريخ؛ أضيفت pure وcontract tests.
- [x] لا تنفيذ تلقائي خطير دون policy: كل AI mutation يتطلب permission/branch guard وconfirmation خادمي `AI_EXECUTE` بعد preview؛ أضيفت policy وcontroller contract tests.

**الاعتماديات:** 5.1 و5.2.

### Checkpoint 5

- [~] كل رقم AI يطابق التقرير: `/ai/insights` وrevenue forecast وinventory forecast أصبحت تحمل نطاقًا ومصادر موثقة؛ ما زالت مطابقة inventory consumption مع كل تقارير المخزون وE2E مطلوبة.
- [x] reorder/purchase recommendations تعرض `reason` و`explanation` صريحين بجانب urgency والبيانات الداعمة؛ أضيف contract test.

---

## Phase 6: Workforce وEnterprise

### Task 6.1: workforce optimization

- [~] labor forecast حسب المبيعات — أضيف endpoint محكوم بالفرع يحول توقع المبيعات إلى ساعات عمل وعدد موظفين مطلوبين اعتمادًا على نسبة المبيعات/ساعة من الحضور الفعلي، مع `confidence` و`dataQuality` و`source` ورفض التنبؤ عند عدم كفاية البيانات؛ ما زالت معايرة الـSLA حسب نوع الفرع والجدولة التلقائية الكاملة وUAT التشغيلية مطلوبة.
- [~] auto scheduling وقواعد الراحة والتعارض — محرك الجدولة يمنع التداخل، يرفض الوقت غير المكتمل، يفرض 11 ساعة راحة آمنة كحد أدنى، يدعم الورديات الليلية، ويتحقق من ملكية الخطة والموظف والفرع داخل الخدمة؛ أصبحت قراءة/إنشاء الخطط تستخدم `effectiveBranchId`، وأضيف `auto-preview` و`auto-apply` بتأكيد صريح وtransaction وسجل تدقيق وربط واجهة كاملة، كما أصبحت سياسة الحضور تحفظ `minimumRestMinutes` قابلة للزيادة حتى 24 ساعة مع migration وواجهة إعداد؛ ما زالت UAT التشغيلية وتحقق migration على SQL Server مطلوبين.
- [~] overtime/tips/attendance reconciliation — payroll now reconciles attendance overtime with approved manual overtime using a deterministic source/delta record; tip pools now validate pool/employee branch ownership, enforce atomic balanced allocation, scope payout/detail access، وتوفر endpoint رسمي لمراجعة حصص الـTips داخل دورة الرواتب مع `readyForPayrollPosting`; SQL/UAT وmigration المحاسبية النهائية للترحيل داخل payroll ما زالت مطلوبة.
- [~] approvals وpayroll audit trail — دورة الرواتب أصبحت تسجل إنشاء/حساب/إغلاق/إعادة فتح بسجل تدقيق موقّع ومربوط بالمستخدم والفرع والطلب، بينما اعتماد التعديلات التفصيلية للملفات والقواعد والتشغيل SQL/E2E ما زال مطلوبًا.

**الاعتماديات:** Phase 1 و5.3.

### Task 6.2: franchise وhead office

- [~] master data distribution — أضيف Head Office MVP لتوزيع branch pricing على عدة فروع مع Preview، تحقق كامل من الفروع، تأكيد صريح، transaction ذرّية، idempotency/replay آمن لطلبات الشبكة مع recovery يمنع بقاء المفتاح عالقًا، claim ذري لطلب الاعتماد يمنع التطبيق المكرر المتزامن، صلاحيات أدوار الإدارة العليا، وتدقيق موقّع؛ أضيفت واجهة HQ لإنشاء طلب المصدر/الوجهات/overwrite مع disclosure، ومعاينة مرئية لعدد العناصر التي ستُحدّث/تُنسخ/تُتخطى مع إبطال المعاينة عند تغيير المدخلات، ومسار اعتماد/رفض منفصل مع maker-checker، وربطت شاشة Approval Center بالمسار المركزي الصحيح وبقائمة مستقلة للإدارة العليا (تشمل CEO/COO دون صلاحيات تشغيل الفروع)، وأصبح overwrite المباشر مرفوضًا دون approval؛ توسيع النطاق إلى بقية master data وSQL/UAT ما زال مطلوبًا.
- [~] centralized menu/pricing مع branch overrides — نسخ قائمة الأسعار بين فرعين أصبح يتحقق من وجود الفرعين وصلاحية المصدر والوجهة، ويوفر Preview قبل التنفيذ، ويعمل داخل transaction واحدة مع audit؛ ما زال توسيع التوزيع إلى بقية master data وapproval workflow واختبار SQL/UAT مطلوبًا.
- [~] intercompany وroyalties — أضيفت معاينة Royalty محمية للإدارة العليا حسب business date، وendpoint ترحيل محمي بتأكيد صريح، mapping إلزامي لحسابات المصروف/الالتزام، transaction ذرّية، ومرجع `ROYALTY` idempotent لكل فرع وفترة؛ حسابات intercompany وSQL/UAT ما زالت مطلوبة.
- [~] consolidated reporting — أضيف تقرير أداء موحّد متعدد الفروع بفلترة `businessDate` ونطاق صلاحيات الإدارة العليا، مع UI وsource provenance؛ ما زال drill-down الكامل وSQL/UAT والتقارير المالية الموحدة النهائية مطلوبًا.
- [ ] approvals بين المركز والفروع.

**الاعتماديات:** Phase 1 و5.1.

### Task 6.3: enterprise security وoperations

- [~] SSO/MFA وdevice/session management — MFA setup/challenge موجود، وإدارة الجلسات تسجل الجهاز/IP وتدعم revoke؛ تم الآن فرض `expiresAt` فعليًا على كل request وrefresh، وتصحيح لوحة الإدارة لتعرض الانتهاء الحقيقي وتقصر listing/revoke على فرع المدير؛ بينما SSO وdevice trust/management المتقدم ما زالا مطلوبين.
- [~] encryption وkey rotation — روابط الدفع ومفاتيح AI تُشفّر بالمفتاح الحالي، وتقبل المفتاح السابق أثناء نافذة التدوير، مع تحقق env منفصل؛ ما زال تدوير الأسرار التشغيلي الموثق وKMS/secret-manager وSQL/UAT مطلوبًا.
- [~] disaster recovery وrestore drills — يوجد Drill محلي آمن لا يعمل إلا على `RestoFlow_Test`، ينفذ `COPY_ONLY/CHECKSUM/VERIFYONLY`، يستعيد إلى قاعدة disposable، يتحقق من الجداول الحرجة ويقيس زمن الاستعادة؛ ما زالت اختبارات staging/production-like، RPO/RTO متعدد الخوادم، وrestore خارج المضيف مطلوبة.
- [x] status page وSLA metrics — أضيف endpoint إداري محمي `/api/ops/status` يعرض health، uptime، error rate، p50/p95، والمسارات المتجاوزة للحد عبر `SLA_P95_TARGET_MS`، وendpoint عام coarse `/api/status`، وصفحة UI عامة `/status` بتحديث تلقائي وحالات loading/error، وتنبيه دوري عند breach ذي عينة كافية مع rate-limit، وتخزين تاريخي bounded لنحو 30 يومًا.
- [~] tenant/branch export وretention policies — أضيفت سياسة retention محمية بحدود 30–3650 يومًا و`DRY_RUN`، كما أضيف Branch JSON export محكوم بفرع وفترة بحد أقصى 5000 طلب، مع إخفاء PII افتراضيًا، منع payment references، وتدقيق موقّع؛ tenant export الكامل، legal hold، ومحرك purge بعد SQL/UAT ما زالت مطلوبة.
- [x] latest governance verification: unit 228 files / 499 tests وsecurity 57 files / 116 tests وtypecheck وESLint وserver build ناجحة بعد إضافة Branch Export.
- [~] legal hold governance: أضيفت إدارة Legal Holds محمية (إنشاء/عرض/تحرير release) بنطاق فرع اختياري، حفظ bounded، وتدقيق موقّع؛ لم يتم ربط purge بها بعد، وتظل SQL/UAT والمراجعة القانونية مطلوبة.
- [x] retention plan: أضيف `/api/ops/data-governance/retention/plan` لإظهار cutoffs والـdatasets وحالة Dry Run/Manual Approval والـactive legal holds قبل أي تنفيذ؛ لا يزال purge الفعلي متوقفًا حتى SQL/UAT والمراجعة القانونية.
- [x] latest governance verification: unit 231 files / 503 tests وsecurity 59 files / 118 tests وtypecheck وESLint وserver build ناجحة بعد إضافة Retention Plan.
- [x] branch export UI: أضيفت ضوابط فترة وزر تنزيل آمن لكل فرع داخل Franchise Manager، مع إخفاء PII افتراضيًا؛ unit 232 files / 504 tests وsecurity 59 files / 118 tests وtypecheck وfrontend build ناجحة، مع تحذير Hook قديم في تحميل Franchise Manager.
- [x] governance scope hardening: تم منع `CFG_MANAGE_SETTINGS` وحدها من الوصول إلى Data Governance، وأصبحت سياسة retention/legal-hold/branch-export محصورة بأدوار Head Office؛ أضيف contract test لمنع cross-branch privilege escalation.
- [x] latest governance verification: unit 247 files / 558 tests وsecurity 66 files / 142 tests وtypecheck وESLint وserver build ناجحة بعد إضافة Legal Hold وdatabase recovery guard وbarcode privacy guard وWebhook/GL/Wallet hardening.

**الاعتماديات:** Phase 1 و2 و3.

### Final Checkpoint

- [ ] P0/P1 مغلق أو له workaround مكتوب.
- [~] شغّلت على SQL Server test database الفعلية (`.\CODUISZEN` / `RestoFlow_Test`) اختبارات البيع/KDS والدفع (2 ملفًا و15/15)، والشراء/الاستلام/المرتجع/إعادة الفتح (4 ملفات و6/6)، وحزمة day-close (5 ملفات و7/7)، والمصروفات/تحصيل السائق/الجرد (5 ملفات و8/8)؛ الأدلة في `docs/e2e-evidence-2026-10-28.md`، وما زالت E2E-03/04/05 الكاملة، يوم التشغيل الكامل عبر كل المجالات، وUAT اليدوي للأجهزة/الشبكة مطلوبة قبل الإغلاق.
- [ ] pilot على فرع حقيقي ناجح.
- [~] performance/security/backup-restore موثقة؛ أُعيد تشغيل backup/restore drill على `RestoFlow_Test` بنجاح (`166` جدولًا، `RESTORE VERIFYONLY`، وتنظيف target مكتمل) والدليل في `docs/backup-restore-evidence-2026-10-28.md`، بينما قياسات staging وRPO/RTO وDR متعدد الخوادم ما زالت مطلوبة.
- [x] release gate يمنع النشر عند فشل lint/typecheck/audit/unit/security/build عبر GitHub Actions dependency chain؛ أضيفت بوابة SQL Server integration اختيارية في CI تعمل فقط عند تفعيل `RUN_SQL_INTEGRATION=true` وتوفير secret مستقل باسم `TEST_DATABASE_URL`، وآخر تشغيل كامل بعد marketplace idempotency نجح على قاعدة معزولة `RestoFlow_Test` (129 ملفًا، 664/664 اختبارًا؛ مع بقاء الأدلة التاريخية الأوسع موثقة في سجلات التشغيل السابقة).

## الترتيب المختصر

1. Foundation gates
2. Authorization وbranch isolation
3. Financial integrity وpayments
4. Security وaudit
5. Offline branch runtime
6. API/integration platform
7. Hardware certification
8. Online ordering وkiosk
9. Customer 360 وloyalty
10. Marketing automation
11. Semantic metrics وBI
12. Grounded AI
13. Forecasting/anomaly
14. Workforce optimization
15. Franchise/head office
16. Enterprise security وDR وSLA

## مؤشرات النجاح

- 0 duplicate payments أو orders في replay tests.
- 100% من التقارير الحرجة branch-scoped.
- typecheck/lint/build أخضر في CI.
- recovery من offline بلا فقد أو تكرار.
- onboarding integration جديد خلال أسبوع.
- كل KPI قابل للرجوع إلى transactions.
- نجاح E2E وUAT قبل كل release.

## تنفيذ فعلي — 2026-10-26

- [x] unit gate: 214 files / 470 tests passed، مع typecheck و`npm run build` وsecurity gate (46 files / 94 tests) ناجحين؛ `npm run lint` يخرج بلا أخطاء مع 157 تحذير React Hook قائم يحتاج cleanup منفصل، بعد إضافة تطبيع body branch قبل mutations في Attendance بالإضافة إلى حراسة branch authority لقراءات وتصديرات Attendance والأجهزة والاستثناءات وtables/zones والورديات، وسياسة راحة قابلة للإعداد بحد آمن وmigration، وواجهة Auto-Schedule Preview/Apply مع تأكيد صريح وإظهار blockers، وAuto-Schedule محكومًا بالفرع مع فحص نقص الموظفين والتعارض وtransaction وسجل تدقيق، وحراسة branch authority لقراءات/إنشاء خطط الجدولة فوق توقع العمالة من المبيعات وساعات الحضور مع confidence/data quality/source، سجل تدقيق موقّع لدورة الرواتب وتعديلات ملفاتها وقواعدها، reconciliation بين حضور وأوفر تايم يدوي معتمد، تسوية Tips ذرية ومربوطة بالفرع مع endpoint مراجعة دورة الرواتب، ربط Tips بـgross/net وقسيمة payroll وربط Pool بالدورة مع فك الربط عند reopen، قواعد راحة وتعارض وbranch authority للجدولة، تشديد إدارة الجلسات، جعل offline queue dedupe ذريًا، فرض expiry فعلي للجلسات وعدم تمديدها عبر refresh، إضافة بوابة SQL integration اختيارية إلى CI بعزل صريح لقاعدة الاختبار، إصلاح branch binding لشاشات public KDS/packing، إزالة bypass المالك من Attendance/HR Extended، تثبيت actor إعدادات النظام، تشديد Talabat branch scope، منع نقل ملكية المخازن عبر body، تحصين legacy Paymob checkout/refund، منع false-success في gateway refunds، ضبط branch topology visibility، حماية إعدادات delivery platforms العالمية، اعتماديات App/CRM الآمنة، وPreview وtransaction لتوزيع أسعار القائمة مع تحقق الفروع، ودوران مفاتيح تشفير الدفع وAI، والتحقق من الجداول الحرجة وقياس RTO في Drill الاستعادة، وحماية قراءات الميزانيات وتقارير إغلاق اليوم، وإخفاء بيانات تكلفة ووصفة وتسعير المنصات من قارئ القائمة غير المخول، وإخفاء بيانات شبكة الطابعات من القارئ غير الإداري، وإضافة status/SLA إداري وعام وتنبيهات breach وتاريخ metrics bounded؛ وsample app تم التحقق منه بـ`--help` و`node --check`.
- [x] inventory forecast semantic alignment: consumption forecast يربط حركة `SALE_CONSUMPTION` بالطلب عبر `referenceId` ويستخدم `orders.businessDate` عند توفره، مع fallback معلن لحركات legacy؛ أضيف `dateBasis` وcontract test.
- [x] revenue forecast semantic alignment: forecast يستخدم `orders.businessDate` ونافذة BI ذات الثلاثين يومًا، يستبعد `CANCELLED`، ويعيد `businessDateFrom/To`؛ أضيف contract test.
- [x] analytics reconciliation job: أضيفت مقارنة read-only بين completed/delivered orders و`daily_branch_summaries` عبر `GET /analytics/reconciliation`، مع branch/business-date scope، tolerance، وحالات `MATCH/MISMATCH` وتفاصيل الفروق؛ أضيفت pure وroute contract tests، وما زال repair/UAT مع SQL Server مطلوبًا.
- [x] inventory AI resilience: `getAIForecast` يعيد حالة `INSUFFICIENT_DATA` عند عدم كفاية التاريخ، أو fallback حتميًا من متوسط الاستهلاك والاتجاه مع `DEGRADED_FALLBACK` عند تعطل AI؛ cache key أصبح branch/item/dataAsOf scoped؛ أضيف contract test.
- [x] recommendation explainability: `PurchaseSuggestion` أصبح يعيد `explanation` مشتقًا من سبب التوصية نفسه، مع contract test مستقل لضمان عدم خروج recommendation بلا تفسير.
- [x] AI/BI date alignment: `/ai/insights` أصبح يستخدم `orders.businessDate` ونفس نافذة business-date ذات السبعة أيام، ويعيد `businessDateFrom/To` وsource صريحًا؛ أضيف contract test، بينما مطابقة كل مسارات AI الأخرى مع BI ما زالت مفتوحة.
- [x] channel analytics: أضيف `GET /analytics/channel-performance` ليجمع revenue/order count/average ticket/cancellations حسب POS وonline وcall-center وtakeaway/dine-in وaggregators، مع effective branch وbusiness-date scope؛ أضيف contract test، وما زال SQL/UAT الفعلي مطلوبًا.
- [x] AI provider resilience: `/ai/insights` لا يعيد 500 عند تعطل مزود AI؛ يعيد fallback حتميًا من metrics الموثقة مع `aiStatus=DEGRADED_FALLBACK`، بينما يظل المصدر والفترة وحداثة البيانات ظاهرين؛ أضيف contract test.
- [x] delivery report branch authority: telemetry وSLA alerts وSLA escalation أصبحت تستخدم `effectiveBranchId` قبل أي branchId من query/body، مع contract test؛ ما زال اختبار SQL/UAT الفعلي للتوصيل مطلوبًا.
- [x] order idempotency isolation: نطاق Idempotency-Key لإنشاء الطلب أصبح مربوطًا بالفرع الفعلي والفاعل المصادق عليه لمنع replay عابر للفروع/المستخدمين؛ أضيف contract test.
- [x] order branch authority: `createOrder` يعتمد على `req.effectiveBranchId` الناتج من middleware، ولا يسمح للـbody باختيار فرع آخر؛ أضيف contract test.
- [x] order payment authority: إنشاء الطلب لا يثق في حالة الدفع القادمة من العميل؛ يتحقق من كل payment row، يحسب الإجمالي، ويحدث `isPaid/paidAmount` داخل نفس transaction؛ أضيف contract test.
- [x] payment settlement branch anchoring: callback reference lookup لا يبحث في payments عالميًا، بل يربطه بالـorder الموثوق من payment session أو merchant order؛ أضيف contract test.
- [x] menu branch pricing privacy: cache قراءة القائمة أصبح يتضمن branch scope، و`branchPricing` يُفلتر للفرع الفعلي، وقراءات items/full/export تمر عبر branch middleware؛ أضيف contract test.
- [x] fiscal dead-letter privacy: قائمة `/fiscal/dead-letters` أصبحت تعيد metadata sanitized فقط ولا تكشف payload الضريبي الخام؛ أضيف contract test.
- [x] payment webhook retry policy: أخطاء HMAC/العمر والأخطاء الدائمة لا تدخل DLQ، بينما timeout/connection/deadlock فقط قابلة لإعادة المحاولة؛ أضيف contract test للحالتين.
- [x] payment reference uniqueness: أضيف unique filtered index على `(provider_type, external_reference)` لمنع duplicate provider sessions، ومسار repair يفحص legacy duplicates ولا يحذف أو يدمج سجلات ماليًا تلقائيًا؛ أضيف contract test.
- [x] log privacy hardening: error handler أصبح يعيد استخدام redaction المركزي بدل regex محلي ناقص، وأضاف contract test يغطي عدم تسريب بيانات الدفع والاعتماديات من error logs.
- [x] dependency audit: تم تحديث `compression` و`react-router-dom` و`puppeteer` و`bullmq` بدون force، وترقية `nodemailer` إلى `10.2.1`، وترحيل Excel إلى compatibility layer فوق `exceljs` مع عدم وجود direct `xlsx` imports. أضيف override مصحح لـ`@azure/msal-node@7.1.2` عبر `@azure/identity`، ونُقلت `drizzle-kit` إلى `devDependencies` لأنها migration tooling وليست runtime، وأضيف override محدود لـ`exceljs/uuid@11.1.1`، ثم رُقيت أدوات التطوير غير الكاسرة: `concurrently@10.0.6` و`postcss@8.5.32` و`esbuild@0.28.2`، وتم تثبيت `vite@6.4.5` داخل نفس major. كما تمت ترقية `vitest` و`@vitest/coverage-v8` إلى `4.1.12` مع ترحيل إعدادات الـpool، وإصلاح اعتماد `printService` على حالة اتصال غير معروفة، وجعل recovery fixture آمنًا أمام duplicate-key بين workers. أضيفت overrides آمنة لـBabel/Browserslist/humanfs/brace-expansion/form-data/picomatch/Rollup، ثم override لـ`@esbuild-kit/core-utils/esbuild@0.25.12` دون تغيير `drizzle-kit@0.31.11`; full وproduction `npm audit` أصبحا `0 vulnerabilities`، ونجح `npm ci --dry-run --ignore-scripts` و`drizzle-kit --version`. تحقق Excel/PDF وimport عبر `53/53` SQL tests، وunit `242/242` ملفًا و`539/539` اختبارًا، وserver/frontend build، ثم اجتاز التكامل الكامل بعد الاعتمادات `295/295` ملفًا و`662/662` اختبارًا؛ اعتماد hardware/provider/DR/UAT ما زال مفتوحًا.
- [x] financial actor hardening: budget/day-close/stock-count/GRN/order creation لم تعد تثق في `createdBy/userId` القادم من body؛ أضيف contract test موحد، وما زال cross-branch/SQL UAT مطلوبًا.
- [x] user bulk branch authority: bulk status/role/delete/branch assignment أصبحت تتحقق من `effectiveBranchId` داخل controller وتمنع مدير الفرع من تعديل مستخدمين أو إسناد فرع خارج نطاقه؛ أضيف unit/security contract coverage.
- [x] latest verification after user-scope hardening: unit 215 files / 473 tests، security 48 files / 98 tests، typecheck وlint وproduction build ناجحة؛ SQL integration ما زال ينتظر `TEST_DATABASE_URL` معزولًا.
- [x] call-center branch health privacy: غير `SUPER_ADMIN` يرى فرعه الفعلي فقط، ولا تُعاد عناوين الخوادم أو أرقام الفروع؛ أضيف unit/security contract coverage.
- [x] latest verification after call-center hardening: unit 216 files / 475 tests، security 49 files / 100 tests، typecheck وlint وproduction build ناجحة.
- [x] call-center health privacy: `GET /api/call-center/branch-health` أصبح يثبت النطاق من `effectiveBranchId` ويخفي `serverIp` و`phone` من الاستجابة؛ أضيفت اختبارات branch/privacy، مع بقاء SQL/UAT التشغيلي مطلوبًا.
- [x] analytics authorization: كل `/api/analytics` يتطلب `DATA_VIEW_REVENUE`، وتقرير `labor-efficiency` يتطلب `DATA_VIEW_SALARIES` بالإضافة إلى branch scope؛ أضيفت unit/security contract coverage.
- [x] latest verification after analytics authorization: unit 217 files / 477 tests، security 50 files / 102 tests، typecheck وlint وproduction build ناجحة.
- [x] consolidated reporting MVP: أضيف `GET /api/analytics/consolidated` للمركز الرئيسي، يعيد إجماليات ومصفوفة الفروع باستخدام `orders.businessDate`، مع `scope` و`source` ورفض branch mismatch؛ أضيفت pure/contract tests. SQL/UAT ومراجعة كل مصادر التقارير ما زالا مطلوبين.
- [x] latest verification after consolidated reporting: unit 219 files / 481 tests، security 52 files / 106 tests، typecheck وlint وproduction build ناجحة.
- [x] consolidated reporting UI: أضيفت لوحة داخل `Reports` تستخدم الفترة المطبقة، تعرض الإجماليات والفروع ومصدر البيانات، وتتعامل مع عدم الصلاحية/الخطأ بدون كشف تفاصيل داخلية؛ أضيف UI contract test.
- [x] latest verification after consolidated UI: unit 220 files / 482 tests، security 53 files / 107 tests، typecheck وproduction build ناجحان؛ lint بلا أخطاء مع تحذير React Hook قائم سابقًا في `Reports.tsx`.
- [x] fiscal route authorization: قراءة إعدادات/سجلات الفوترة، إرسال الإيصال، وإدارة dead letters أصبحت خلف صلاحيات صريحة بالإضافة إلى branch scope؛ أضيف contract test، ويظل UAT مع ETA مطلوبًا.
- [x] menu branch-pricing scope: نسخ الأسعار يتحقق من صلاحية المستخدم على الفرع المصدر والوجهة قبل أي تحديث؛ أضيف contract test، وما زال اختبار cross-branch runtime مطلوبًا.
- [x] marketing complaint branch scope: customer complaints أصبحت تحمل branch provenance، وتُفلتر وتُحمى عند التعديل، مع تحقق order/customer/branch عند الإنشاء وadditive migration؛ أضيف contract test، وما زال SQL/UAT الفعلي مطلوبًا.
- [x] payment gateway fail-closed: unified webhook لا يمرر CARD/INSTAPAY إلى Paymob settlement دون adapter موثق، ويرجع 503 قبل أي state mutation؛ أضيف contract test، وما زال live provider UAT مطلوبًا.
- [x] dedicated secret domains: تشفير checkout يستخدم `PAYMENT_TOKEN_SECRET` فقط، وQR يستخدم `PUBLIC_QR_SECRET` فقط، مع توليد dev وvalidation production واختبارات separation؛ ما زالت مراجعة أدوات التشغيل الخارجية مطلوبة.
- [x] branch-aware coupons: coupons تدعم `branchId` اختياريًا؛ الكوبون العام يظل متاحًا لكل الفروع، والكوبون المقيد لا يظهر أو يُستخدم خارج فرعه، مع additive migration وroute scope واختبار contract.
- [x] branch-aware campaigns: الحملات تحمل `branchId` اختياريًا؛ العرض والإحصائيات والـdispatch والـdelivery logs والـscheduler يقيّدون الجمهور والعملاء بالفرع، وقراءة الحملات خلف marketing permission، مع migration/index واختبار contract.
- [x] procurement actor hardening: PO/GRN/invoice creation/approval لم تعد تثق في body userId، وPO يستخدم effective branch scope، وlegacy PO receipt يتحقق من وجود المخزن وتطابقه مع target warehouse والفرع؛ أضيفت contract tests، والتكامل يحتاج SQL Server UAT.
- [x] shift actor hardening: فتح الوردية يستخدم authenticated actor فقط ولا يثق بـ`body.userId`; أضيف contract test، بينما مراجعة بقية mutations وcross-branch integration ما زالت مفتوحة.
- [x] inventory mutation actor hardening: تعديل المخزون والاستلام المباشر والتحويلات وطلبات التحويل لم تعد تثق في `actor_id/requestedBy` من body؛ تستخدم authenticated actor فقط، وتتحقق من branch scope وحالة المستودعات قبل الحركة؛ أضيف ذلك إلى contract test الموحد، وما زال SQL/UAT الفعلي مطلوبًا.
- [x] attendance mutation actor hardening: تصحيح واعتماد/رفض وحل/تصعيد استثناءات الحضور، الإغلاق اليومي/الشهري، وربط البصمات لم تعد تثق في `requestedBy/resolvedBy/approvedBy/escalatedBy/closedBy` من body؛ أضيف contract test، وما زال SQL/UAT الفعلي مطلوبًا.
- [x] HR/payroll actor hardening: طلبات السلف والمكافآت، أقفال وإغلاق/إعادة فتح الرواتب، إنشاء الجداول وكشوف المرتبات، والعمليات المرتبطة لم تعد تثق في هويات body؛ أضيف `hrActorIdentityContract` إلى بوابة الوحدة، وما زال SQL/UAT الفعلي مطلوبًا.
- [x] KDS/drawer actor hardening: إتمام تذكرة المطبخ وفتح الدرج النقدي أصبحا يستخدمان authenticated actor فقط بدل `completedBy/openedBy` من body؛ أضيفت تغطية إلى contract test المالي، ونجحت بوابات الوحدة/typecheck/server build.
- [x] OAuth Authorization Code + PKCE: أضيفت redirect-URI allow-list لعملاء Public API، endpoint `/api/v1/oauth/authorize` بجلسة مستخدم وموافقة صريحة، أكواد تفويض قصيرة العمر أحادية الاستخدام مخزنة كـhash، و`authorization_code` exchange مع S256 PKCE وbranch delegation؛ أضيف OpenAPI وcanonical SQL schema واختبارات consent/redirect/PKCE/replay، وما زال اختبار SQL/UAT الفعلي مطلوبًا.
- [x] OAuth abuse controls: أضيف rate-limit مستقل لمساري authorize/token، مع اختبار contract يثبت منع تجاوز الحد دون التأثير على buckets الأخرى.
- [x] production build dependency cleanup: أزيل اعتماد runtime غير المعلن على `uuid` واستُخدم `crypto.randomUUID()` المدمج في Node؛ `npm run typecheck` و`npm run build:server` ناجحان بعد الإصلاح.
- [x] campaign dispatch idempotency: أضيف claim/replay وpayload conflict protection للحملات، مع test contract شامل؛ provider/UAT لم يُغلق بعد لغياب `TEST_DATABASE_URL`.
- [x] automated win-back safety: retention job أصبح consent-aware للـglobal/WhatsApp، يعتمد completed/delivered orders فقط، ويأخذ daily idempotency claim؛ إثبات SQL/provider الفعلي ما زال مطلوبًا.
- [x] campaign delivery observability: كل محاولة WhatsApp/SMS تسجل channel outcome في `campaign_logs` بدون تخزين رقم الهاتف؛ failure في التخزين لا يعيد إرسال الرسالة تلقائيًا، وcontract test ناجح.
- [x] campaign delivery history: أضيف `GET /api/campaigns/:id/logs` بحد أقصى 500 سجل وملخص delivered/failed/opened/clicked، مع إخفاء بيانات المستلم وواجهة API للواجهة.
- [x] campaign scheduler: أضيف `campaignSchedulerService` عند startup؛ يلتقط الحملات المستحقة، يحدد الجمهور بموافقة القناة، يرسل WhatsApp/SMS، يرفض target audience غير المعروف fail-closed، يوقف الحملة عند فشل provider، ويسجل النتائج مع claim آمن.
- [x] RFM refresh: refresh يدوي bounded وbranch-scoped مع صلاحية وتدقيق signed أصبح متاحًا؛ أضيفت له واجهة العميل `reportsApi.refreshCustomerRfm` بجانب القراءة، مع اختبار تغطية كتالوج التقارير 2/2.
- [x] channel consent: أضيفت أعمدة الموافقة المنفصلة مع additive startup migration، وأصبحت حملات WhatsApp تستبعد العميل عند رفض global أو WhatsApp consent؛ التحقق المستهدف وtypecheck وserver build ناجحون.
- [x] integration evidence: تم توفير SQL Server معزول باسم `RestoFlow_Test` وتشغيل repair script idempotent ومتوافق مع legacy schema بنجاح؛ اجتازت المسارات المستهدفة core order/payment/day-close/tables/daily-number وpayroll compliance/work-rules، ثم اجتاز full integration عدد 295/295 ملفًا و662/662 اختبارًا.
- [x] frontend build ناجح بعد إضافة IntegrationHealthPanel؛ التحذيرات الحالية تخص circular chunks وأحجام chunks القائمة.
- [x] security gate: 22 files / 64 tests passed.
- [x] typecheck وlint ناجحان بعد آخر تغييرات.
- [x] multi-branch provenance gate: `branchLedgerProvenance.test.ts` اجتاز `1/1` على `RestoFlow_Test`، وتم التحقق من `branch_id` في loyalty ledger وwallet transactions وcustomer wallets وsuppliers، مع نجاح migration idempotent على schema قديم؛ عقود wallet/Customer 360/repair/idempotency اجتازت `15/15`، وعقود supplier branch scope اجتازت `10/10`.
- [x] global settings authority gate: جدول الإعدادات العالمي أصبح قابلًا للتعديل فقط لأدوار Head Office (`SUPER_ADMIN/OWNER/CEO/COO/GENERAL_MANAGER`)، ولا يكفي امتلاك صلاحية إعدادات داخل فرع؛ contract اجتاز `1/1`.
- [x] mail branch authority gate: الرسائل المباشرة لا تتجاوز فروع المرسل، و`BROADCAST_ALL` محصور في Head Office؛ contract اجتاز `1/1` مع إبقاء ملكية الرسالة/المستلم حارسًا مستقلًا.
- [x] user administration authority gate: إدارة الحسابات والأدوار والصلاحيات والتصدير وإسناد الفروع أصبحت Head Office-only؛ إدارة الموظفين التشغيلية تظل عبر مسارات HR المقيدة بالفرع؛ contract اجتاز `1/1`.
- [x] role administration authority gate: قراءة وتعديل الأدوار وتعريفات الصلاحيات أصبحت Head Office-only؛ لا تكفي صلاحية فرعية لتغيير سياسة الأمان العالمية؛ contract اجتاز `1/1`.
- [x] public API key authority gate: إنشاء/تدوير/إلغاء مفاتيح API العامة أصبح Head Office/IT-only لأن المفتاح قد يفوض عدة فروع؛ contract اجتاز `1/1`.
- [x] barcode branch/privacy gate: operational barcode lookup/check/menu/inventory routes أصبحت branch-bound، وأزيلت cost/purchase price من رد POS؛ contract اجتاز `1/1`.
- [x] latest regression gate: full unit `254/254` files و`571/571` tests، وsecurity `66/66` files و`142/142` tests؛ typecheck وlint وserver build ناجحون.
- [x] mutation network-safety slice: payment وday-close mutations لا تُعاد تلقائيًا عند فقد الاتصال، وتُرجع `NETWORK_UNAVAILABLE` أو `SERVER_DRAINING` برسالة تفيد أن العملية غير مؤكدة؛ اختبارات transport/UX اجتازت `12/12`، مع بقاء اختبار شبكة فعلية وUAT الدفع/الإقفال خارج بيئة الاختبار.
- [x] integration suite: التشغيل الكامل على `RestoFlow_Test` اجتاز 295/295 ملفًا و662/662 اختبارًا بعد إصلاح schema drift، بما في ذلك GRN/idempotency، warehouse stock counts، campaign dispatch، permission gates، وrefund projection؛ قاعدة التشغيل `CoduisZen` لم تُلمس.
- [x] audit coverage closure: mutation ترحيل franchise royalties أصبحت تسجل signed audit بعد نجاح الترحيل مع payload bounded لا يحتوي حسابات أو بيانات حساسة؛ `npm run audit:coverage` أصبح 100% (56/56 included route files، بلا uncovered mutations)، واختبار royalty contract يحمي ذلك.
- [x] financial fail-closed closure: تسوية account transfers أصبحت transaction ذرّية؛ يتم claim إلى `PROCESSING`، ثم posting GL داخل نفس transaction، ولا تصبح `COMPLETED` إلا بعد `entryId` صالح، بينما فشل القيد يعيد العملية إلى `PENDING` بالـrollback؛ provenance/financial contract tests 10/10 وunit 242/242 (534 tests) وsecurity 66/66 (141 tests) وtypecheck/lint ناجحة.
- [x] drawer reconciliation fail-closed: تسوية shortage/overage أصبحت claim إلى `PROCESSING` ثم posting GL داخل transaction واحدة، ولا تُحفظ `WRITE_OFF/APPROVED_OVERAGE` إلا بعد `entryId` صالح؛ فشل القيد يعمل rollback إلى `PENDING`، مع contract regression test وتشغيل SQL integration ناجح 295/295 ملفًا و662/662 اختبارًا.
- [x] tip payout fail-closed: صرف حصص الـTips أصبح claim إلى `PROCESSING` ثم posting GL داخل transaction واحدة، ولا تُعلّم allocations كـ`paidOut` ولا pool كـ`PAID_OUT` إلا بعد `entryId` صالح؛ فشل القيد يعمل rollback، مع contract regression test و8/8 targeted provenance/payroll tests وunit 242/242 (539 tests) وsecurity 66/66 (141 tests) وserver build وSQL integration 295/295 ملفًا و662/662 اختبارًا ناجحة.
- [x] مسارات حضور ذكي 15/15، حملات 2/2، استلام مباشر 1/1، مشتريات متعددة المخازن 1/1، وتوزيع الأصناف على المخازن 1/1.
- [x] إصلاح توافق schema للرواتب والامتثال، عزل جولات الطاولات حسب يوم الفرع، إنشاء العملاء idempotent، إكمال الطلبات القديمة افتراضيًا نقدًا، وحماية استعادة admin داخل test setup.
- [x] إضافة aliases لكل ثيمات V2، توحيد مصدر ألوان الثيم، ورفع اختبارات الوصولية إلى 140/140 مع ضبط تباين ألوان الأزرار.
- [x] جعل Zustand order persistence آمنًا في SSR/Node tests، وإضافة حارس صفحة المخزون ومسار warehouses/transfers المتوافق مع الـ UI الحالي.
- [x] إصلاح توافق `user_daily_performance` بين schema القديمة (`business_date`/معرّف نصي) وcontract الحالي (`date`)، مع migration غير هدّامة وtest تكاملي؛ كما أصبح التاريخ القادم كـ`Date` يُطبع إلى `YYYY-MM-DD` قبل التخزين.
- [x] عزل WhatsApp provider في integration إلى `disabled`، مع إبقاء اختبار Baileys المموّه 13/13 داخل integration دون فتح شبكة خارجية؛ production default لم يتغير.
- [ ] لا يزال الإغلاق التنافسي النهائي غير معتمد: نحتاج E2E/UAT على فرع حقيقي، قياسات load/performance مع thresholds، DR staging متعدد الخوادم، واعتماد hardware/integrations.
- [x] عزل migrations الاختيارية في المخزون: فشل unique index بسبب SKU legacy مكرر أو default constraint مولّد لا يمنع purchase-unit أو جداول التحويل؛ اختبار تعيين المخزن مرّ بدون تحذير بعد الإصلاح.
- [x] تقوية provenance للمدفوعات: إضافة `payment_sessions.branch_id` مع backfill وforeign key، وتشغيل migration عند startup قبل فتح port، وحماية confirm/reverse من branch drift؛ اختبارات الدفع المرتبطة نجحت، ثم typecheck وlint وserver build ناجحة.
- [x] إثبات runtime لمسار Attendance Bridge: token صحيح يرجع ingest branch-scoped بعقد واضح حتى مع عدم وجود logs، وtoken خاطئ يُرفض 401؛ اختبار 2/2.
- [x] تحسين recovery offline: قرار `DISCARD` يمسح conflict/lastError/nextAttemptAt ولا يترك queue item مغلقًا ببيانات تعارض قديمة؛ اختبارات offline lifecycle/replay/conflict/utils نجحت 18/18.
- [x] أضيفت Queue Health داخل Offline Conflict Center تعرض `pending/failed/conflicts/synced` للفرع النشط فقط، مع اختبار عزل إحصاءات الطابور عن الفروع الأخرى؛ أصبحت حالة المزامنة التشغيلية مرئية قبل فتح تفاصيل التعارض.
- [x] أخطاء حدود الدفع Offline أصبحت قابلة للفهم للكاشير: رسائل عربية/إنجليزية تشرح أن النقد فقط متاح أثناء انقطاع الاتصال، مع frontend UX tests 8/8.
- [x] تشديد invariant الدفع: لا يمكن إنشاء جلسات pending تتجاوز إجمالي الطلب، وreplay بعد settlement يعيد نفس contract؛ اختبار payment safety الآن 5/5، وtypecheck/lint/server build ناجحة.
- [x] إثبات Paymob replay على قاعدة الاختبار: callback مكرر مرتين ينتج payment واحدًا فقط ويُبقي order/session settled، وcallback بمبلغ مختلف يدخل `requires_reconciliation` بلا payment أو paid projection؛ اختبارا replay/invariant نجحا 2/2.
- [x] تصحيح سلطة Paymob public webhook: bad HMAC=401، stale=409 بلا retry، transient settlement=202 مع queue؛ واختبارات controller 3/3، مع إضافة اختبارات offline lease recovery وactive lease إلى unit suite.
- [x] إثبات IndexedDB فعليًا: اتصالان Dexie مستقلان claim نفس queue item بالتوازي وينجح claim واحد فقط، مع stale-lease recovery؛ أضيف `fake-indexeddb` إلى unit setup بعد إصلاح flakiness الناتج عن ترتيب تحميل Dexie.
- [x] إضافة runbook أداء قابل لإعادة التشغيل: Lighthouse موثق لـ9 routes على desktop/mobile بنتيجة 18/18، وواجهة API read-only smoke تقيس success rate وp50/p95/p99 وتدعم thresholds؛ بعد إضافة health snapshot cache وsingle-flight، تشغيل محلي آمن بـ50 طلبًا/10 توازي على `/api/status` حقق 100% نجاح وp95=104.09ms تحت حد 250ms، بينما ما زالت قياسات staging الفعلية مطلوبة قبل اعتماد threshold إنتاجي.
- [x] إصلاح schema drift في marketing: legacy `campaigns.status` كان `nvarchar(max)` ويمنع index startup؛ migration الآن تطبع القيم الفارغة، تزيل default constraint بأمان، تحول العمود إلى `nvarchar(50) NOT NULL` وتعيد default قبل إنشاء branch/status index، وstartup على `RestoFlow_Test` مرّ بدون تحذير marketing schema.
- [x] أضيف `ops:backup-restore-drill` مع حواجز تمنع الإنتاج؛ drill فعلي على `RestoFlow_Test` أنشأ backup بـ`COPY_ONLY/CHECKSUM`، نفّذ `VERIFYONLY`، استعاد قاعدة `RestoFlow_DR_20261026072430`، تحقق من الجداول، ثم نظفها بنجاح؛ ملف النسخة بقي محفوظًا.
- [~] ما زال يلزم إغلاق تحذير Socket.io غير المهيأ في بعض المسارات الاختبارية، ثم DR staging متعدد الخوادم وقياسات load/UAT واعتماد hardware/integrations قبل الإغلاق التنافسي النهائي.
- [~] browser smoke check: صفحة `/status` تُفتح فعليًا وتعرض واجهة عربية آمنة بدون بيانات حساسة، لكن أثناء تشغيل Vite وحده تعذر الوصول إلى `/api/status`؛ يلزم تشغيل backend مع قاعدة اختبار/بيئة staging لإغلاق تحقق الحالة الحية.
- [x] head-office master-data distribution MVP: توزيع `MENU_BRANCH_PRICING` على عدة فروع أصبح يدعم Preview، تأكيدًا صريحًا قبل التعديل، صلاحيات الإدارة العليا فقط، تحققًا من جميع الفروع، transaction ذرّية، وتدقيقًا موقّعًا؛ unit 221 files / 485 tests وsecurity 54 files / 110 tests وtypecheck وlint وproduction build ناجحة.
- [x] royalty preview MVP: أضيف `/api/franchise/royalties/preview` محمي للإدارة العليا، يحسب الالتزام حسب `businessDate` من الطلبات `COMPLETED/DELIVERED` فقط، يستبعد الإلغاء، يستخدم subtotal بعد الخصم وحساب السنتات، ويعرض الإجماليات لكل فرع مع contract/policy tests؛ unit 223 files / 489 tests وsecurity 55 files / 112 tests وtypecheck وlint وserver build ناجحة. الترحيل المحاسبي والتكامل الفعلي ما زالا مفتوحين.
- [x] royalty preview UI: أضيف تبويب الإتاوات داخل Franchise Manager مع اختيار الفترة، إجماليات Net Sales/Royalty/Marketing/Total Due، وتفصيل حسب الفرع، مع توضيح أن المعاينة لا تنشئ قيدًا؛ unit 224 files / 490 tests وsecurity 55 files / 112 tests وtypecheck وfrontend build ناجحة، مع تحذير Hook قديم في تحميل بيانات Franchise Manager.
- [x] royalty posting safety: أضيف `POST /api/franchise/royalties/post` بتأكيد صريح، mapping إلزامي لحسابات المصروف/الالتزام، transaction واحدة لكل الدفعة، fail-closed عند exception من GL، و`ROYALTY` reference idempotent لكل فرع وفترة؛ unit 224 files / 490 tests وsecurity 55 files / 112 tests وtypecheck وserver build ناجحة، ولم تُغلق بعد UAT/حسابات intercompany الحقيقية.
- [x] retention governance MVP: أضيفت `/api/ops/data-governance/retention` محمية للإدارة العليا، بسياسة احتفاظ محدودة 30–3650 يومًا، UTC cutoffs، signed audit، و`DRY_RUN` افتراضي يمنع الحذف التلقائي؛ unit 226 files / 495 tests وsecurity 56 files / 114 tests وtypecheck وserver build ناجحة. branch export وlegal hold ومحرك purge بعد SQL/UAT ما زالت مفتوحة.
- [x] governance scope hardening: تم منع fallback الخاص بـ`CFG_MANAGE_SETTINGS` من مسارات retention/branch-export/legal-hold؛ أصبحت العمليات الحساسة محصورة في `SUPER_ADMIN/OWNER/CEO/COO/GENERAL_MANAGER`، مع منع مديري الفروع من تغيير سياسة عامة أو تصدير فروع أخرى؛ targeted contracts وtypecheck ثم unit 232 files / 504 tests وsecurity 59 files / 118 tests ناجحة.
- [x] approval branch isolation: تم ربط verify/reject في مركز الموافقات بـ`req.effectiveBranchId`، ورفض `branchId` المخالف أو approval من فرع آخر قبل التحقق أو التنفيذ؛ أضيف contract test، وunit 233 files / 506 tests وsecurity 60 files / 120 tests وtypecheck وlint ناجحة.
- [x] image asset privacy gate: مسار الصور لم يعد يسمح بقراءة metadata أو storage URL بدون جلسة؛ وبما أن جدول الصور الحالي global بلا `branch_id`، أصبحت القراءة والرفع والحذف محصورة في أدوار Head Office/IT بدل ترك أي مستخدم authenticated يحذف أصلًا عامًا؛ contract اجتاز `2/2`، وfull unit `255/255` files / `573/573` tests، وsecurity `67/67` files / `144/144` tests، وtypecheck وlint ناجحان.
- [x] approval authentication gate: كل مسارات الموافقات، بما فيها `verify-pin` و`verify-password`، أصبحت تتطلب جلسة مصادق عليها قبل فحص اعتماد المدير أو تنفيذ أي أثر؛ نطاق الفرع ما زال يثبت عبر `scopeBranchQuery`، contract اجتاز `1/1`، وfull unit `256/256` files / `574/574` tests، وsecurity `68/68` files / `145/145` tests، وtypecheck وserver build ناجحان.
- [x] subscription tenant-authority gate: خطط الاشتراك، entitlements، وonboarding لم تعد تقبل صلاحية جلسة عامة مع `branchId` من body؛ أصبحت محصورة في `SUPER_ADMIN/OWNER/CEO/COO/GENERAL_MANAGER/IT` لحين إضافة workflow branch-owned صريح؛ contract اجتاز `1/1`، وfull unit `257/257` files / `575/575` tests، وsecurity `69/69` files / `146/146` tests، وtypecheck وlint ناجحان.
- [x] print gateway branch/privacy gate: إدارة jobs وbridge registry أصبحت تستخدم `scopeBranchQuery`، وأصبح controller يفضّل `effectiveBranchId` ولا يقبل branch بديلًا لغير الإدارة العليا، كما أصبح registry لا يعرض إلا gateways/printers الخاصة بالفرع؛ جسر الأجهزة ظل محميًا بـper-gateway token؛ contract اجتاز `1/1`، وfull unit `258/258` files / `576/576` tests، وsecurity `70/70` files / `147/147` tests، وtypecheck وserver build ناجحان.
- [x] gift-card financial fail-closed gate: إصدار/شحن/استبدال/إلغاء Gift Cards أصبح داخل transaction واحدة مع GL، وقفل `UPDLOCK/HOLDLOCK` يمنع overspend المتوازي، وفشل/عدم اكتمال GL يعيد rollback بدل ترك الرصيد متغيرًا؛ كل حركة top-up/redeem/void تحمل reference فريدًا للـidempotency؛ contract اجتاز `2/2`، وfull unit `259/259` files / `578/578` tests، وsecurity `71/71` files / `149/149` tests، وtypecheck وlint وserver build ناجحة.
- [x] treasury voucher financial fail-closed gate: اعتماد سندات الخزينة أصبح يقفل السند ويضع supplier linkage وGL وتغيير `COMPLETED` داخل transaction واحدة؛ الحسابات غير المهيأة أو GL بلا `entryId` ترفض العملية وتعمل rollback بدل اعتماد السند؛ contract اجتاز `2/2`، وfull unit `260/260` files / `580/580` tests، وsecurity `72/72` files / `151/151` tests، وtypecheck وlint وserver build ناجحة.
- [x] purchase-return financial fail-closed gate: إرجاع المورد أصبح ينقص المخزون ويسجل movement ويرحل credit note داخل transaction واحدة؛ فشل GL يعيد كل الأثر، وأضيف `PURCHASE_RETURN` كـreference type تشغيلي idempotent بدل `MANUAL`؛ contract اجتاز `2/2`، وfull unit `261/261` files / `582/582` tests، وsecurity `73/73` files / `153/153` tests، وtypecheck وlint وserver build ناجحة.
