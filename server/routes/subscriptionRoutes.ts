import { Router } from 'express';
import { subscriptionService } from '../services/subscriptionService';
import { createSignedAuditLog } from '../services/auditService';
import { requireRoles } from '../middleware/auth';

const router = Router();

// Subscription plans, tenant entitlements, and onboarding state are global
// commercial/tenant controls. Do not trust a caller-supplied branchId to grant
// cross-branch access until a branch-owned workflow exists.
router.use(requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT'));

const auditSubscriptionMutation = (req: any, eventType: string, branchId: string | null, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
  eventType,
  userId: req.user?.id || 'system',
  userRole: req.user?.role,
  branchId: req.effectiveBranchId || branchId || req.user?.branchId || null,
  requestId: req.requestId,
  sourceDevice: req.headers['user-agent'],
  payload,
  after,
  reason: `Subscription mutation: ${eventType}`,
});

// Plan Management
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (err) {
    next(err);
  }
});

router.post('/plans', async (req, res, next) => {
  try {
    const plan = await subscriptionService.createPlan(req.body);
    await auditSubscriptionMutation(req, 'SUBSCRIPTION_PLAN_CREATED', null, {
      planId: plan?.id || null,
      featureCount: Array.isArray(plan?.features) ? plan.features.length : 0,
      hasPrice: plan?.price !== undefined && plan?.price !== null,
    }, { active: plan?.isActive !== false });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// Tenant Subscription
router.get('/tenant/:branchId', async (req, res, next) => {
  try {
    const sub = await subscriptionService.getTenantSubscription(req.params.branchId);
    res.json(sub);
  } catch (err) {
    next(err);
  }
});

router.post('/tenant/:branchId/subscribe', async (req, res, next) => {
  try {
    const { planId } = req.body;
    const sub = await subscriptionService.subscribeTenant(req.params.branchId, planId);
    await auditSubscriptionMutation(req, 'TENANT_SUBSCRIPTION_CREATED', req.params.branchId, {
      subscriptionId: sub?.id || null,
      planId: sub?.planId || planId || null,
      status: sub?.status || 'ACTIVE',
    }, { active: sub?.status === 'ACTIVE' });
    res.json(sub);
  } catch (err) {
    next(err);
  }
});

// Tenant Onboarding
router.get('/onboarding/:branchId', async (req, res, next) => {
  try {
    const status = await subscriptionService.getOnboardingStatus(req.params.branchId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.patch('/onboarding/:branchId', async (req, res, next) => {
  try {
    const updated = await subscriptionService.updateOnboardingStep(req.params.branchId, req.body);
    await auditSubscriptionMutation(req, 'TENANT_ONBOARDING_UPDATED', req.params.branchId, {
      updatedKeys: Object.keys(req.body || {}).sort(),
    }, { updated: Boolean(updated) });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
