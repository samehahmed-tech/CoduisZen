import { db } from '../db';
import { users, branches, attendanceRawLogs } from '../../src/db/schema';
import logger from '../utils/logger';

export const csvMigrationService = {
  /**
   * Helper to parse raw CSV string into an array of objects
   */
  parseCSV(csvContent: string): Record<string, string>[] {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(col => col.trim());
        const obj: Record<string, string> = {};
        headers.forEach((header, idx) => {
            obj[header] = row[idx] || '';
        });
        results.push(obj);
    }
    return results;
  },

  /**
   * Import historical attendance logs from CSV
   */
  async importAttendance(branchId: string, csvContent: string) {
      const records = this.parseCSV(csvContent);
      let imported = 0;
      let failed = 0;

      for (const record of records) {
          try {
              if (!record.punch_time || !record.employee_id) continue;

              await db.insert(attendanceRawLogs).values({
                  id: crypto.randomUUID(),
                  employeeId: record.employee_id,
                  deviceId: record.device_id || 'MIGRATION_SRC',
                  occurredAt: new Date(record.punch_time),
                  eventType: record.punch_type === 'OUT' ? 'OUT' : 'IN',
                  sourceType: 'BIOMETRIC_ZK',
                  processingStatus: 'PENDING',
                  branchId,
              });
              imported++;
          } catch (e) {
              failed++;
          }
      }

      logger.info({ imported, failed }, 'Attendance CSV migration complete');
      return { imported, failed };
  },

  /**
   * Import users from CSV
   */
  async importUsers(branchId: string, csvContent: string) {
      const records = this.parseCSV(csvContent);
      let imported = 0;

      for (const record of records) {
          try {
              if (!record.name || (!record.email && !record.pin)) continue;

              await db.insert(users).values({
                  id: crypto.randomUUID(),
                  name: record.name,
                  email: record.email || null,
                  pinCode: record.pin || null, // in real app, we should hash this
                  role: record.role || 'WAITER',
                  assignedBranchId: branchId,
                  isActive: true,
              });
              imported++;
          } catch (e) {
              // Ignore duplicates
          }
      }
      return { imported };
  }
};
