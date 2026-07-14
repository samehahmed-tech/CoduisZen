import { db } from '../db';
import { subscriptionPlans, subscriptions, onboardingRecords } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

export const subscriptionService = {
  // Plan Management
  async getPlans() {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  },

  async createPlan(data: any) {
    const [plan] = await db.insert(subscriptionPlans).output().values(data);
    return plan;
  },

  // Subscription Management
  async getTenantSubscription(tenantBranchId: string) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantBranchId, tenantBranchId));
    return sub;
  },

  async subscribeTenant(tenantBranchId: string, planId: string) {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (!plan) throw new Error('Subscription plan not found');

    const [sub] = await db.insert(subscriptions).output().values({
      id: crypto.randomUUID(),
      tenantBranchId,
      planId,
      status: 'ACTIVE',
    });
    return sub;
  },

  // Feature Gating
  async checkFeatureAccess(tenantBranchId: string, featureKey: string) {
    const sub = await this.getTenantSubscription(tenantBranchId);
    if (!sub || sub.status !== 'ACTIVE') return false;

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId));
    if (!plan) return false;

    return Array.isArray(plan.features) && plan.features.includes(featureKey);
  },

  // Onboarding
  async getOnboardingStatus(tenantBranchId: string) {
    const [record] = await db.select().from(onboardingRecords).where(eq(onboardingRecords.tenantBranchId, tenantBranchId));
    if (!record) {
      return await db.insert(onboardingRecords).output().values({
        id: crypto.randomUUID(),
        tenantBranchId,
      });
    }
    return record;
  },

  async updateOnboardingStep(tenantBranchId: string, updates: any) {
    const [record] = await db.update(onboardingRecords)
      .set({ ...updates, updatedAt: new Date() })
      .output()
      .where(eq(onboardingRecords.tenantBranchId, tenantBranchId));
    return record;
  }
};
