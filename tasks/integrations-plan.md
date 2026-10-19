# Integrations Plan (aggregators + payments) — separate file, do not overwrite others

## Overview
تجهيز استقبال باقي المنصات (مرسول/المنيوز/fast) بإطار عام واحد + تفعيل Paymob وInstaPay (عبر Paymob) — كله من شاشة Platforms.

## Reality check (no live web — rate-limited)
- Elmenus/Mrsool: لا API عام مؤكد. الإطار يستقبل webhook بأي شكل عبر normalizer لكل منصة + وضع يدوي. أي spec رسمي يصل لاحقا يتربط في نفس النقطة.
- Paymob Accept API مستقر وموثق: auth token → ecommerce order → payment key → iframe → webhook HMAC-SHA512 → void/refund.
- InstaPay: لا merchant API عامة. الطريق التجاري عبر Paymob (InstaPay acceptance). التفعيل يمر عبر Paymob.

## Slices
- [ ] A: `server/modules/aggregators/` (types+registry elmenus/mrsool/fast/generic + normalize + auth + ingest عام) + `POST /api/integrations/:provider/webhook` علني + إدارة + `tests/aggregators.test.ts`
- [ ] B: Paymob adapter كامل (auth/order/key/iframe/HMAC/refund) + `paymob_config` + endpoints + `tests/paymob.test.ts` + ربط `paymentGatewayService`
- [ ] C: InstaPay عبر Paymob + UI (كروت منصات + دفع) + `branchIds` لكل مزود + تحقق (tests+lint)

## Risks
| Risk | Mit |
|---|---|
| شكل webhook مرسول/المنيوز الفعلي يختلف | normalizer متساهل + سجل خام + وضع يدوي |
| HMAC ترتيب حقول Paymob | ترتيب موثق + اختبار بمتجه ثابت + رفض آمن عند الشك |
| multi-instance rate | ملاحظة تشغيلية، حد لاحق مركزي |
