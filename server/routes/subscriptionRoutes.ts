import { Router } from 'express';
import { subscriptionService } from '../services/subscriptionService';

const router = Router();

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
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
