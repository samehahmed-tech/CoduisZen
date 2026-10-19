# Talabat Integration Plan (separate from theme plan — do not overwrite tasks/plan.md)

## Overview
ربط مباشر Partner Picking + Direct POS. طلبات ترسل webhook، سيستم يستقبل ويحول لأوردر داخلي، ويرجع حالة عبر PUT. مصدر الحقيقة: developer.talabat.com.

## Architecture Decisions
- Contract first: `server/modules/talabat/talabatTypes.ts` يطابق payload طلبات حرفيا.
- Validation عند الحدود فقط: webhook receiver يتحقق secret/Basic ثم mapper نقي يرفض الناقص.
- Idempotency: مفتاح `TALABAT_ORDER:{order_id}:{status}` في جدول `idempotency_keys` + حارس `DUPLICATE_PLATFORM_ORDER` الموجود في orderController.
- لا schema جديد ثقيل: إعدادات طلبات في `settings` مفتاح `talabat_config` JSON + سجل خام في `webhook_deliveries` عبر endpoint وهمي `talabat-inbound`.
- Outbound PUT عبر client واحد مع توكن cache ساعتين + حد 60/دقيقة.

## Task List (vertical slices)

### Phase 1: Foundation (pure, no DB)
- [ ] Slice 1: mapper + status + auth + `tests/talabatMapper.test.ts`
- [ ] Slice 2: OAuth client + PUT/GET + rate limit + `tests/talabatClient.test.ts`

### Checkpoint: Foundation
- [ ] `npx vitest run tests/talabatMapper.test.ts tests/talabatClient.test.ts` أخضر

### Phase 2: Ingest
- [ ] Slice 3: `talabatConfig.ts` + `talabatWebhookAuth.ts` + `talabatIngestService.ts` + `talabatWebhookController.ts` + `talabatWebhookRoutes.ts` + تسجيل public في `app.ts` قبل `authenticateToken`
- [ ] Slice 4: `talabatSyncService.ts` (PUT راجع عند READY/DISPATCHED/CANCELLED) + توسيع Platforms API + UI حقول طلبات

### Checkpoint: Ingest
- [ ] `npm run typecheck` أخضر، webhook يرد 200 خلال 10s، تكرار نفس payload لا يخلق أوردر ثاني

### Phase 3: Ops
- [x] Slice 5: `GET /api/integrations/talabat/orders` مطابقة 60 يوم + `POST /test-order` + توثيق `.env.example`
- [x] Slice 6: إصلاح توكن form-urlencoded + دعم payload متداخل (client/payment/customer)
- [x] Slice 7: كتالوج `PUT .../vendors/{vendor}/catalog` + معاينة/دفع/مهمة + ربط تلقائي من المنيو + Sandbox
- [x] Slice 8: فرع `GET/PUT .../vendors/{vendor}/status` (فتح/مشغول/غلق) إنتاج فقط
- [x] Slice 9: برومو `PUT .../promotion` (upsert) + حالة مهمة + UI إنتاج فقط

### Checkpoint: Complete
- [ ] `npm test -- --run` + `npm run typecheck` + `npm run lint` على ملفات ملموسة
- [ ] E2E يدوي: RECEIVED ثم READY_FOR_PICKUP ثم DISPATCHED ثم CANCELLED

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| سر توكن في settings | High | تخزين + إخفاء في GET، لا يرجع كاملا |
| تكرار webhook (5 retries) | High | idempotency على order_id+status قبل أي كتابة |
| SKU غير مربوط | Med | صنف UNKNOWN + تنبيه + قبول طلب ثم مراجعة يدوية، لا رفض |
| فرع غير مربوط store_id | Med | رفض 400 مع قائمة stores المعروفة للتوجيه |
| تجاوز 60/دقيقة | Med | throttle داخلي + queue بسيطة |

## Open Questions
- توصيلك Platform أم Vendor؟ (يحدد READY_FOR_PICKUP أم DISPATCHED للتقفيل)
- chainID + client_id/secret استلمتها من Account Manager؟
