import { db } from '../db';
import { managerApprovals, auditLogs } from '../../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import logger from '../utils/logger';

export const accountabilityService = {
  /**
   * Log an override event whenever a manager manually corrects attendance.
   */
  async logManagerOverride(managerId: string, branchId: string, targetId: string, overrideReason: string) {
      await db.insert(auditLogs).values({
          eventType: 'MANAGER_OVERRIDE',
          userId: managerId,
          branchId,
          payload: { entityType: 'ATTENDANCE', entityId: targetId, reason: overrideReason },
          reason: overrideReason,
      });
      logger.info({ managerId, targetId }, 'Manager override logged');
  },

  /**
   * Retrieve accountability metrics for a given branch
   */
  async getAccountabilityMetrics(branchId: string) {
      // Find all MANAGER_OVERRIDE logs in the last 7 days per manager
      const recentLimit = new Date();
      recentLimit.setDate(recentLimit.getDate() - 7);

      const query = sql`
        SELECT 
           user_id as "managerId",
           COUNT(*) as "overrideCount"
        FROM audit_logs
        WHERE branch_id = ${branchId}
          AND action = 'MANAGER_OVERRIDE'
          AND created_at >= ${recentLimit}
        GROUP BY user_id
      `;
      
      try {
        const res = await db.execute(query);
        return res.rows;
      } catch (e: any) {
        logger.error({ err: e.message }, 'Failed to fetch accountability metrics');
        return [];
      }
  }
};
