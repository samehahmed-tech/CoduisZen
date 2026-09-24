/**
 * Shared role groups for day-to-day operational (POS-line) routes.
 *
 * WHY THIS EXISTS: shift/order/customer/barcode routes used to hardcode
 * overlapping role lists like
 *   ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER']
 * which silently locked out legitimate floor roles (CAFE_ADMIN could open
 * nothing, OWNER/GENERAL_MANAGER could not open shifts, ...). Every
 * operational route must build on POS_FLOOR_ROLES so a role added here is
 * fixed everywhere at once.
 *
 * Deliberately EXCLUDED (no daily floor operations): DRIVER, KITCHEN_STAFF,
 * CALL_CENTER*, WAREHOUSE_*, PRODUCTION_*, ACCOUNTANT*, FINANCE_DIRECTOR,
 * HR_MANAGER, PAYROLL_OFFICER, TREASURY_OFFICER, TECH_SUPPORT,
 * QUALITY_OFFICER, PICKUP_STAFF. Routes that need those add them explicitly.
 *
 * NOTE: 'MANAGER' is a legacy alias with no matching UserRole value — kept
 * so existing lists behave identically.
 */
export const POS_FLOOR_ROLES: readonly string[] = [
    'SUPER_ADMIN',
    'OWNER',
    'GENERAL_MANAGER',
    'BRANCH_MANAGER',
    'MANAGER',
    'CASHIER',
    'CASHIER_MANAGER',
    'WAITER',
    'CAPTAIN',
    'CAFE_ADMIN',
];
