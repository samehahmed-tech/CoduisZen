import { db } from '../db';
import { attendanceExceptions, attendanceRawLogs, attendanceSessions } from '../../src/db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import logger from '../utils/logger';

export const abuseDetectionService = {
  /**
   * Scan for "buddy punching" (multiple employees punch IN from the exact same device/IP within X seconds)
   */
  async detectBuddyPunching(limitMinutes: number = 5) {
    logger.info('Running buddy punching detection...');
    const minutes = Math.min(Math.max(Math.floor(Number(limitMinutes) || 5), 1), 1440);
    
    // Naive raw SQL query to find occurrences where device_id is the same, timestamps are within 30s, but employee_id varies.
    // Given the complexity of window functions in Drizzle, raw SQL is often used for anomaly detection.
    const query = sql`
      WITH recent_punches AS (
        SELECT id, employee_id, branch_id, device_id, occurred_at 
        FROM attendance_raw_logs 
        WHERE occurred_at >= DATEADD(MINUTE, ${-minutes}, GETDATE())
      )
      SELECT p1.employee_id as emp1, p2.employee_id as emp2, p1.branch_id, p1.device_id, p1.occurred_at
      FROM recent_punches p1
      JOIN recent_punches p2 
        ON p1.device_id = p2.device_id 
        AND p1.id != p2.id 
        AND p1.employee_id != p2.employee_id
        AND ABS(DATEDIFF(SECOND, p2.occurred_at, p1.occurred_at)) < 30
    `;

    try {
      const results = await db.execute(query);
      if (results.rows && results.rows.length > 0) {
         // Create exceptions
         for (const row of results.rows) {
             // In real app, we check if this specific anomaly is already flagged
             logger.warn({ anomaly: row }, 'Suspected buddy punching detected');
             
             await db.insert(attendanceExceptions).values({
               id: crypto.randomUUID(),
               employeeId: String(row.emp1),
               branchId: String(row.branch_id),
               type: 'BUDDY_PUNCH_SUSPICION',
               severity: 'HIGH',
               status: 'PENDING',
               title: 'Suspected buddy punching',
               metadata: { relatedEmployee: row.emp2, deviceId: row.device_id, time: row.occurred_at },
              }); // Assuming unique constraints prevent duplicates
         }
      }
    } catch (e: any) {
        logger.error({ err: e.message }, 'Buddy punching detection failed to run');
    }
  },

  /**
   * Scan for Suspicious Overtime
   */
  async detectSuspiciousOvertime() {
     // Search for any unclosed session that has been open for more than 16 hours
     const timeLimit = new Date();
     timeLimit.setHours(timeLimit.getHours() - 16);

     const suspicious = await db.select()
       .from(attendanceSessions)
       .where(
         and(
           eq(attendanceSessions.status, 'OPEN'),
           sql`${attendanceSessions.clockInAt} < ${timeLimit}`
         )
       );

     for (const session of suspicious) {
         logger.warn({ sessionId: session.id }, 'Suspicious endless overtime detected');
         await db.insert(attendanceExceptions).values({
           id: crypto.randomUUID(),
           employeeId: session.employeeId,
           branchId: session.branchId,
           sessionId: session.id,
           type: 'ENDLESS_OVERTIME_SUSPICION',
           severity: 'HIGH',
           status: 'PENDING',
           title: 'Suspicious endless overtime',
           details: 'Session open longer than 16 hours. Auto-flagged.',
          });
     }
  }
};
