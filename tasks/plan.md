# Theme Worlds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (native execution in this session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** كل ثيم من الـ10 يعطي انطباع سيستم مختلف (layout + motion + component grammar)، لا لون فقط.

**Architecture:** طبقة CSS جديدة `styles/engine/theme-worlds.css` مربوطة بالـ10 ids الحالية + تفريق توكنز `theme/themes/*.ts` عبر كل المحاور + إحالة البلوكات الميتة في `theme-overrides.css` و`theme-operations.css` للتقاعد.

**Tech Stack:** CSS variables + `[data-theme]` selectors, ThemeConfig tokens, Vite build.

**Spec:** طلب المستخدم (10 عوالم مميزة) + نتائج الاستكشاف في tasks/plan.md أدناه.

## Global Constraints

- ids الثيمات العشرة ثابتة لا تتغير (يوجد LEGACY_THEME_MAP + إعدادات مخزنة).
- لا pure black في الدارك، تباين AA للنصوص.
- GPU-only motion (transform/opacity)، واحترام reduced-motion.
- كل شريحة تبقي المشروع قابلاً للبناء.

## Review Focus

- ثيم يبدو مكسوراً (rail عائم يغطي المحتوى) → راجع `.workspace-rail` overrides.
- بطء الإحساس في ثيم سريع (abyss/neon/ember) → durations تحت 160ms.
- تعارض specificity مع `!important` في sidebar.css → worlds تستخدم `!important` للـrail فقط.

---

## File Structure

- Modify: `index.css` (سطر import واحد)
- Create: `styles/engine/theme-worlds.css` (عوالم الـ10: rail/card/button/input/table/modal/headings)
- Modify: `theme/themes/*.ts` (10 ملفات: motion/shape/spacing/components/layout/interaction)
- Modify: `styles/engine/theme-overrides.css` + `styles/engine/theme-operations.css` (تنبيه تقاعد فقط)

## Root Causes (من الاستكشاف)

1. `theme-overrides.css` (794 سطر) و`theme-operations.css` (330 سطر): صفر selectors للـids الحالية — مربوطة بأسماء متقاعدة (`aurora-glass`…). طبقة الـpersonality كلها ميتة.
2. vars الـvariants (`--theme-button-variant`, `--theme-card-variant`, `--theme-sidebar-variant`, `--theme-input-variant`, `--theme-modal-variant`, `--theme-layout-density`) + `data-motion-style`: صفر مستهلكين في `styles/`.
3. كونفجارات `.ts` شبه متطابقة (ember مقابل saffron: نفس glass/blurred/glass تقريباً).
4. ما يعمل فعلاً اليوم: ألوان الـ10 + motion-personalities + POS tokens + dashboard-personalities.

### Task 1: طبقة theme-worlds.css + التسجيل

**Files:**
- Create: `styles/engine/theme-worlds.css`
- Modify: `index.css`

- [ ] **Step 1: كتابة `theme-worlds.css`** — لكل ثيم: rail (خلفية/حدود/نصف قطر)، card + hover، btn-primary (نصف قطر/ظل/hover)، input + focus، table th + row height، modal radius، عنوان سكشن، keyframes جديدة (spring/modal للـmatcha jaoks).
- [ ] **Step 2: تسجيل الـimport** في `index.css` بعد `theme-operations.css` وقبل `ux-elevation.css`.
- [ ] **Step 3: تحقق** — `npm run build:frontend` ينجح.

### Task 2: تفريق كونفجارات الـ10 ثيمات

**Files:**
- Modify: `theme/themes/ember-noir.ts`, `saffron-souk.ts`, `midnight-dune.ts`, `matcha-garden.ts`, `rose-patissier.ts`, `abyss-teal.ts`, `porcelain-mist.ts`, `cocoa-truffle.ts`, `neon-bazaar.ts`, `olive-grove.ts`

| Theme | motion style/duration | shape r | density | button/card/sidebar/table/input/modal |
|---|---|---|---|---|
| ember-noir | crisp 120/300ms | 10px | 0.9 compact | solid/flat/solid/dense/outline/centered |
| saffron-souk | smooth 260/520ms | 18px | 1.1 spacious | soft/flat/solid/comfortable/filled/floating |
| midnight-dune | decelerate 180/360ms | 8px | 1.0 | solid/elevated/solid/comfortable/outline/sheet |
| matcha-garden | springy 240/560ms | 20px | 1.0 | soft/elevated/floating/comfortable/filled/floating |
| rose-patissier | bouncy 220/480ms | 18px | 1.05 | soft-pill/elevated/floating/comfortable/filled/floating |
| abyss-teal | instant 90/200ms | 6px | 0.85 compact | tile/flat/solid-narrow/dense/outline/centered |
| porcelain-mist | smooth 160/320ms | 10px | 1.0 | soft/flat/solid-hairline/comfortable/outline/centered |
| cocoa-truffle | smooth 280/560ms | 16px | 1.05 | solid/elevated/blurred/comfortable/glass/floating |
| neon-bazaar | instant 80/160ms | 4px | 0.95 | tile-hard/flat-hard/solid/dense/outline/centered |
| olive-grove | smooth 300/600ms | 22px | 1.15 spacious | soft/glass/blurred/comfortable-3.5/glass/floating |

- [ ] **Step 1-10: تعديل كل ملف** (motion + shape + spacing + components + layout + interaction فقط، الألوان والـsemantic كما هي).
- [ ] **Step 11: تحقق** — `npm run typecheck` ينجح.

### Task 3: إحالة البلوكات الميتة للتقاعد

**Files:**
- Modify: `styles/engine/theme-overrides.css`, `styles/engine/theme-operations.css`

- [ ] **Step 1: تنبيه أعلى كل ملف** أن selectors الـids القديمة متقاعدة وأن `theme-worlds.css` هو البديل (بدون حذف — آمن للتراجع).
- [ ] **Step 2: تحقق** — `npm run lint` على الملفات الملموسة + `npm run build:frontend`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| تعارض `!important` مع sidebar.css | Medium | worlds تستخدم `!important` للـrail فقط، وتختبر بصرياً عبر preview |
| كسر إعدادات مستخدمين مخزنة | Low | ids ثابتة، تغيير سلوكي فقط |
| build ثقيل على Windows | Low | شرائح صغيرة وتحقق تدريجي |
