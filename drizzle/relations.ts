import { relations } from "drizzle-orm/relations";
import { branches, goodsReceiptNotes, purchaseOrders, users, suppliers, grnItems, inventoryItems, purchaseOrderItems, supplierInvoices, menuItems, orderItems, orders, supplierInvoiceItems, modifierGroups, modifierOptions, recipeVersions, recipes, chartOfAccounts, journalLines, costCenters, journalEntries, attendanceDevices, attendanceDeviceMappings, employees, printers, menuCategories, attendanceRawLogs, attendanceSyncRuns, customers, customerAddresses, deliveryZones, floorZones, warehouses, drivers, payrollCycles, managerApprovals, attendanceGeofences, attendanceSessions, tables, userSessions, attendanceExceptions, attendanceCorrections, fiscalPeriods, inventoryBatches, attendancePolicies, shiftTemplates, paymentMethodAccounts, taxAccounts, inventoryStock, employeeShiftAssignments, domainEvents, employeeLoans, employeePayrollAssignments, payrollProfiles, leaveBalances, loanInstallments, bonusPenaltyRecords, shifts, payrollPayouts, payrollComponents, payrollLocks, payrollRules, onboardingRecords, payrollRuns, payslips, shiftTaskRuns, shiftTasks, shiftPlans, menuItemModifiers, orderStatusHistory, payments, payrollRunLines, shiftPlanEntries, subscriptionPlans, subscriptions, recipeIngredients, stockMovements, batchTransactions, attendance } from "./schema";

export const goodsReceiptNotesRelations = relations(goodsReceiptNotes, ({one, many}) => ({
	branch: one(branches, {
		fields: [goodsReceiptNotes.branchId],
		references: [branches.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [goodsReceiptNotes.poId],
		references: [purchaseOrders.id]
	}),
	user: one(users, {
		fields: [goodsReceiptNotes.receivedBy],
		references: [users.id]
	}),
	supplier: one(suppliers, {
		fields: [goodsReceiptNotes.supplierId],
		references: [suppliers.id]
	}),
	grnItems: many(grnItems),
	supplierInvoices: many(supplierInvoices),
}));

export const branchesRelations = relations(branches, ({many}) => ({
	goodsReceiptNotes: many(goodsReceiptNotes),
	printers: many(printers),
	attendanceDevices_branchId: many(attendanceDevices, {
		relationName: "attendanceDevices_branchId_branches_id"
	}),
	attendanceDevices_branchId: many(attendanceDevices, {
		relationName: "attendanceDevices_branchId_branches_id"
	}),
	attendanceRawLogs_branchId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_branchId_branches_id"
	}),
	attendanceRawLogs_branchId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_branchId_branches_id"
	}),
	attendanceSyncRuns_branchId: many(attendanceSyncRuns, {
		relationName: "attendanceSyncRuns_branchId_branches_id"
	}),
	attendanceSyncRuns_branchId: many(attendanceSyncRuns, {
		relationName: "attendanceSyncRuns_branchId_branches_id"
	}),
	deliveryZones: many(deliveryZones),
	floorZones: many(floorZones),
	warehouses: many(warehouses),
	drivers: many(drivers),
	payrollCycles: many(payrollCycles),
	managerApprovals: many(managerApprovals),
	attendanceGeofences_branchId: many(attendanceGeofences, {
		relationName: "attendanceGeofences_branchId_branches_id"
	}),
	attendanceGeofences_branchId: many(attendanceGeofences, {
		relationName: "attendanceGeofences_branchId_branches_id"
	}),
	attendanceSessions_branchId: many(attendanceSessions, {
		relationName: "attendanceSessions_branchId_branches_id"
	}),
	attendanceSessions_branchId: many(attendanceSessions, {
		relationName: "attendanceSessions_branchId_branches_id"
	}),
	tables: many(tables),
	attendanceExceptions_branchId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_branchId_branches_id"
	}),
	attendanceExceptions_branchId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_branchId_branches_id"
	}),
	costCenters: many(costCenters),
	employees: many(employees),
	attendancePolicies_branchId: many(attendancePolicies, {
		relationName: "attendancePolicies_branchId_branches_id"
	}),
	attendancePolicies_branchId: many(attendancePolicies, {
		relationName: "attendancePolicies_branchId_branches_id"
	}),
	shiftTemplates_branchId: many(shiftTemplates, {
		relationName: "shiftTemplates_branchId_branches_id"
	}),
	shiftTemplates_branchId: many(shiftTemplates, {
		relationName: "shiftTemplates_branchId_branches_id"
	}),
	paymentMethodAccounts: many(paymentMethodAccounts),
	employeeShiftAssignments_branchId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_branchId_branches_id"
	}),
	employeeShiftAssignments_branchId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_branchId_branches_id"
	}),
	orders: many(orders),
	domainEvents: many(domainEvents),
	employeeLoans: many(employeeLoans),
	bonusPenaltyRecords: many(bonusPenaltyRecords),
	shifts: many(shifts),
	payrollComponents: many(payrollComponents),
	payrollLocks: many(payrollLocks),
	payrollRules: many(payrollRules),
	onboardingRecords: many(onboardingRecords),
	payrollRuns: many(payrollRuns),
	payrollProfiles: many(payrollProfiles),
	purchaseOrders: many(purchaseOrders),
	shiftTasks: many(shiftTasks),
	shiftPlans: many(shiftPlans),
	shiftPlanEntries: many(shiftPlanEntries),
	subscriptions: many(subscriptions),
	attendances: many(attendance),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({one, many}) => ({
	goodsReceiptNotes: many(goodsReceiptNotes),
	branch: one(branches, {
		fields: [purchaseOrders.branchId],
		references: [branches.id]
	}),
	supplier: one(suppliers, {
		fields: [purchaseOrders.supplierId],
		references: [suppliers.id]
	}),
	purchaseOrderItems: many(purchaseOrderItems),
}));

export const usersRelations = relations(users, ({many}) => ({
	goodsReceiptNotes: many(goodsReceiptNotes),
	supplierInvoices: many(supplierInvoices),
	recipeVersions: many(recipeVersions),
	menuItems_approvedBy: many(menuItems, {
		relationName: "menuItems_approvedBy_users_id"
	}),
	menuItems_priceApprovedBy: many(menuItems, {
		relationName: "menuItems_priceApprovedBy_users_id"
	}),
	payrollCycles: many(payrollCycles),
	managerApprovals: many(managerApprovals),
	userSessions: many(userSessions),
	attendanceExceptions_assignedTo: many(attendanceExceptions, {
		relationName: "attendanceExceptions_assignedTo_users_id"
	}),
	attendanceExceptions_assignedTo: many(attendanceExceptions, {
		relationName: "attendanceExceptions_assignedTo_users_id"
	}),
	attendanceExceptions_resolvedBy: many(attendanceExceptions, {
		relationName: "attendanceExceptions_resolvedBy_users_id"
	}),
	attendanceExceptions_resolvedBy: many(attendanceExceptions, {
		relationName: "attendanceExceptions_resolvedBy_users_id"
	}),
	attendanceCorrections_approvedBy: many(attendanceCorrections, {
		relationName: "attendanceCorrections_approvedBy_users_id"
	}),
	attendanceCorrections_approvedBy: many(attendanceCorrections, {
		relationName: "attendanceCorrections_approvedBy_users_id"
	}),
	attendanceCorrections_requestedBy: many(attendanceCorrections, {
		relationName: "attendanceCorrections_requestedBy_users_id"
	}),
	attendanceCorrections_requestedBy: many(attendanceCorrections, {
		relationName: "attendanceCorrections_requestedBy_users_id"
	}),
	fiscalPeriods: many(fiscalPeriods),
	employees: many(employees),
	employeeLoans_approvedBy: many(employeeLoans, {
		relationName: "employeeLoans_approvedBy_users_id"
	}),
	employeeLoans_requestedBy: many(employeeLoans, {
		relationName: "employeeLoans_requestedBy_users_id"
	}),
	bonusPenaltyRecords_approvedBy: many(bonusPenaltyRecords, {
		relationName: "bonusPenaltyRecords_approvedBy_users_id"
	}),
	bonusPenaltyRecords_requestedBy: many(bonusPenaltyRecords, {
		relationName: "bonusPenaltyRecords_requestedBy_users_id"
	}),
	shifts: many(shifts),
	payrollLocks: many(payrollLocks),
	payrollRuns_closedBy: many(payrollRuns, {
		relationName: "payrollRuns_closedBy_users_id"
	}),
	payrollRuns_createdBy: many(payrollRuns, {
		relationName: "payrollRuns_createdBy_users_id"
	}),
	payslips: many(payslips),
	shiftTaskRuns: many(shiftTaskRuns),
	shiftPlans_approvedBy: many(shiftPlans, {
		relationName: "shiftPlans_approvedBy_users_id"
	}),
	shiftPlans_createdBy: many(shiftPlans, {
		relationName: "shiftPlans_createdBy_users_id"
	}),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	goodsReceiptNotes: many(goodsReceiptNotes),
	supplierInvoices: many(supplierInvoices),
	purchaseOrders: many(purchaseOrders),
}));

export const grnItemsRelations = relations(grnItems, ({one}) => ({
	goodsReceiptNote: one(goodsReceiptNotes, {
		fields: [grnItems.grnId],
		references: [goodsReceiptNotes.id]
	}),
	inventoryItem: one(inventoryItems, {
		fields: [grnItems.itemId],
		references: [inventoryItems.id]
	}),
	purchaseOrderItem: one(purchaseOrderItems, {
		fields: [grnItems.poItemId],
		references: [purchaseOrderItems.id]
	}),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({many}) => ({
	grnItems: many(grnItems),
	supplierInvoiceItems: many(supplierInvoiceItems),
	inventoryBatches: many(inventoryBatches),
	inventoryStocks: many(inventoryStock),
	purchaseOrderItems: many(purchaseOrderItems),
	recipeIngredients: many(recipeIngredients),
	stockMovements: many(stockMovements),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({one, many}) => ({
	grnItems: many(grnItems),
	inventoryItem: one(inventoryItems, {
		fields: [purchaseOrderItems.itemId],
		references: [inventoryItems.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [purchaseOrderItems.poId],
		references: [purchaseOrders.id]
	}),
}));

export const supplierInvoicesRelations = relations(supplierInvoices, ({one, many}) => ({
	user: one(users, {
		fields: [supplierInvoices.createdBy],
		references: [users.id]
	}),
	goodsReceiptNote: one(goodsReceiptNotes, {
		fields: [supplierInvoices.grnId],
		references: [goodsReceiptNotes.id]
	}),
	supplier: one(suppliers, {
		fields: [supplierInvoices.supplierId],
		references: [suppliers.id]
	}),
	supplierInvoiceItems: many(supplierInvoiceItems),
}));

export const orderItemsRelations = relations(orderItems, ({one}) => ({
	menuItem: one(menuItems, {
		fields: [orderItems.menuItemId],
		references: [menuItems.id]
	}),
	order: one(orders, {
		fields: [orderItems.orderId],
		references: [orders.id]
	}),
}));

export const menuItemsRelations = relations(menuItems, ({one, many}) => ({
	orderItems: many(orderItems),
	user_approvedBy: one(users, {
		fields: [menuItems.approvedBy],
		references: [users.id],
		relationName: "menuItems_approvedBy_users_id"
	}),
	menuCategory: one(menuCategories, {
		fields: [menuItems.categoryId],
		references: [menuCategories.id]
	}),
	user_priceApprovedBy: one(users, {
		fields: [menuItems.priceApprovedBy],
		references: [users.id],
		relationName: "menuItems_priceApprovedBy_users_id"
	}),
	menuItemModifiers: many(menuItemModifiers),
	recipes: many(recipes),
}));

export const ordersRelations = relations(orders, ({one, many}) => ({
	orderItems: many(orderItems),
	branch: one(branches, {
		fields: [orders.branchId],
		references: [branches.id]
	}),
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id]
	}),
	orderStatusHistories: many(orderStatusHistory),
	payments: many(payments),
}));

export const supplierInvoiceItemsRelations = relations(supplierInvoiceItems, ({one}) => ({
	supplierInvoice: one(supplierInvoices, {
		fields: [supplierInvoiceItems.invoiceId],
		references: [supplierInvoices.id]
	}),
	inventoryItem: one(inventoryItems, {
		fields: [supplierInvoiceItems.itemId],
		references: [inventoryItems.id]
	}),
}));

export const modifierOptionsRelations = relations(modifierOptions, ({one}) => ({
	modifierGroup: one(modifierGroups, {
		fields: [modifierOptions.groupId],
		references: [modifierGroups.id]
	}),
}));

export const modifierGroupsRelations = relations(modifierGroups, ({many}) => ({
	modifierOptions: many(modifierOptions),
	menuItemModifiers: many(menuItemModifiers),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({one}) => ({
	user: one(users, {
		fields: [recipeVersions.changedBy],
		references: [users.id]
	}),
	recipe: one(recipes, {
		fields: [recipeVersions.recipeId],
		references: [recipes.id]
	}),
}));

export const recipesRelations = relations(recipes, ({one, many}) => ({
	recipeVersions: many(recipeVersions),
	menuItem: one(menuItems, {
		fields: [recipes.menuItemId],
		references: [menuItems.id]
	}),
	recipeIngredients: many(recipeIngredients),
}));

export const journalLinesRelations = relations(journalLines, ({one}) => ({
	chartOfAccount: one(chartOfAccounts, {
		fields: [journalLines.accountId],
		references: [chartOfAccounts.id]
	}),
	costCenter: one(costCenters, {
		fields: [journalLines.costCenterId],
		references: [costCenters.id]
	}),
	journalEntry: one(journalEntries, {
		fields: [journalLines.journalEntryId],
		references: [journalEntries.id]
	}),
}));

export const chartOfAccountsRelations = relations(chartOfAccounts, ({many}) => ({
	journalLines: many(journalLines),
	paymentMethodAccounts: many(paymentMethodAccounts),
	taxAccounts: many(taxAccounts),
}));

export const costCentersRelations = relations(costCenters, ({one, many}) => ({
	journalLines: many(journalLines),
	branch: one(branches, {
		fields: [costCenters.branchId],
		references: [branches.id]
	}),
}));

export const journalEntriesRelations = relations(journalEntries, ({many}) => ({
	journalLines: many(journalLines),
}));

export const attendanceDeviceMappingsRelations = relations(attendanceDeviceMappings, ({one}) => ({
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceDeviceMappings.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceDeviceMappings_deviceId_attendanceDevices_id"
	}),
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceDeviceMappings.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceDeviceMappings_deviceId_attendanceDevices_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceDeviceMappings.employeeId],
		references: [employees.id],
		relationName: "attendanceDeviceMappings_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceDeviceMappings.employeeId],
		references: [employees.id],
		relationName: "attendanceDeviceMappings_employeeId_employees_id"
	}),
}));

export const attendanceDevicesRelations = relations(attendanceDevices, ({one, many}) => ({
	attendanceDeviceMappings_deviceId: many(attendanceDeviceMappings, {
		relationName: "attendanceDeviceMappings_deviceId_attendanceDevices_id"
	}),
	attendanceDeviceMappings_deviceId: many(attendanceDeviceMappings, {
		relationName: "attendanceDeviceMappings_deviceId_attendanceDevices_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceDevices.branchId],
		references: [branches.id],
		relationName: "attendanceDevices_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceDevices.branchId],
		references: [branches.id],
		relationName: "attendanceDevices_branchId_branches_id"
	}),
	attendanceRawLogs_deviceId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_deviceId_attendanceDevices_id"
	}),
	attendanceRawLogs_deviceId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_deviceId_attendanceDevices_id"
	}),
	attendanceSyncRuns_deviceId: many(attendanceSyncRuns, {
		relationName: "attendanceSyncRuns_deviceId_attendanceDevices_id"
	}),
	attendanceSyncRuns_deviceId: many(attendanceSyncRuns, {
		relationName: "attendanceSyncRuns_deviceId_attendanceDevices_id"
	}),
}));

export const employeesRelations = relations(employees, ({one, many}) => ({
	attendanceDeviceMappings_employeeId: many(attendanceDeviceMappings, {
		relationName: "attendanceDeviceMappings_employeeId_employees_id"
	}),
	attendanceDeviceMappings_employeeId: many(attendanceDeviceMappings, {
		relationName: "attendanceDeviceMappings_employeeId_employees_id"
	}),
	attendanceRawLogs_employeeId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_employeeId_employees_id"
	}),
	attendanceRawLogs_employeeId: many(attendanceRawLogs, {
		relationName: "attendanceRawLogs_employeeId_employees_id"
	}),
	attendanceSessions_employeeId: many(attendanceSessions, {
		relationName: "attendanceSessions_employeeId_employees_id"
	}),
	attendanceSessions_employeeId: many(attendanceSessions, {
		relationName: "attendanceSessions_employeeId_employees_id"
	}),
	attendanceExceptions_employeeId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_employeeId_employees_id"
	}),
	attendanceExceptions_employeeId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_employeeId_employees_id"
	}),
	attendanceCorrections_employeeId: many(attendanceCorrections, {
		relationName: "attendanceCorrections_employeeId_employees_id"
	}),
	attendanceCorrections_employeeId: many(attendanceCorrections, {
		relationName: "attendanceCorrections_employeeId_employees_id"
	}),
	branch: one(branches, {
		fields: [employees.branchId],
		references: [branches.id]
	}),
	user: one(users, {
		fields: [employees.userId],
		references: [users.id]
	}),
	employeeShiftAssignments_employeeId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_employeeId_employees_id"
	}),
	employeeShiftAssignments_employeeId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_employeeId_employees_id"
	}),
	employeeLoans: many(employeeLoans),
	employeePayrollAssignments: many(employeePayrollAssignments),
	leaveBalances: many(leaveBalances),
	bonusPenaltyRecords: many(bonusPenaltyRecords),
	payrollPayouts: many(payrollPayouts),
	payslips: many(payslips),
	payrollRunLines: many(payrollRunLines),
	shiftPlanEntries: many(shiftPlanEntries),
	attendances: many(attendance),
}));

export const printersRelations = relations(printers, ({one}) => ({
	branch: one(branches, {
		fields: [printers.branchId],
		references: [branches.id]
	}),
}));

export const menuCategoriesRelations = relations(menuCategories, ({many}) => ({
	menuItems: many(menuItems),
}));

export const attendanceRawLogsRelations = relations(attendanceRawLogs, ({one, many}) => ({
	branch_branchId: one(branches, {
		fields: [attendanceRawLogs.branchId],
		references: [branches.id],
		relationName: "attendanceRawLogs_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceRawLogs.branchId],
		references: [branches.id],
		relationName: "attendanceRawLogs_branchId_branches_id"
	}),
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceRawLogs.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceRawLogs_deviceId_attendanceDevices_id"
	}),
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceRawLogs.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceRawLogs_deviceId_attendanceDevices_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceRawLogs.employeeId],
		references: [employees.id],
		relationName: "attendanceRawLogs_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceRawLogs.employeeId],
		references: [employees.id],
		relationName: "attendanceRawLogs_employeeId_employees_id"
	}),
	attendanceSyncRun: one(attendanceSyncRuns, {
		fields: [attendanceRawLogs.syncRunId],
		references: [attendanceSyncRuns.id]
	}),
	attendanceSessions_checkInRawLogId: many(attendanceSessions, {
		relationName: "attendanceSessions_checkInRawLogId_attendanceRawLogs_id"
	}),
	attendanceSessions_checkInRawLogId: many(attendanceSessions, {
		relationName: "attendanceSessions_checkInRawLogId_attendanceRawLogs_id"
	}),
	attendanceSessions_checkOutRawLogId: many(attendanceSessions, {
		relationName: "attendanceSessions_checkOutRawLogId_attendanceRawLogs_id"
	}),
	attendanceSessions_checkOutRawLogId: many(attendanceSessions, {
		relationName: "attendanceSessions_checkOutRawLogId_attendanceRawLogs_id"
	}),
	attendanceExceptions_rawLogId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_rawLogId_attendanceRawLogs_id"
	}),
	attendanceExceptions_rawLogId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_rawLogId_attendanceRawLogs_id"
	}),
}));

export const attendanceSyncRunsRelations = relations(attendanceSyncRuns, ({one, many}) => ({
	attendanceRawLogs: many(attendanceRawLogs),
	branch_branchId: one(branches, {
		fields: [attendanceSyncRuns.branchId],
		references: [branches.id],
		relationName: "attendanceSyncRuns_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceSyncRuns.branchId],
		references: [branches.id],
		relationName: "attendanceSyncRuns_branchId_branches_id"
	}),
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceSyncRuns.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceSyncRuns_deviceId_attendanceDevices_id"
	}),
	attendanceDevice_deviceId: one(attendanceDevices, {
		fields: [attendanceSyncRuns.deviceId],
		references: [attendanceDevices.id],
		relationName: "attendanceSyncRuns_deviceId_attendanceDevices_id"
	}),
}));

export const customerAddressesRelations = relations(customerAddresses, ({one}) => ({
	customer: one(customers, {
		fields: [customerAddresses.customerId],
		references: [customers.id]
	}),
}));

export const customersRelations = relations(customers, ({many}) => ({
	customerAddresses: many(customerAddresses),
	orders: many(orders),
}));

export const deliveryZonesRelations = relations(deliveryZones, ({one}) => ({
	branch: one(branches, {
		fields: [deliveryZones.branchId],
		references: [branches.id]
	}),
}));

export const floorZonesRelations = relations(floorZones, ({one, many}) => ({
	branch: one(branches, {
		fields: [floorZones.branchId],
		references: [branches.id]
	}),
	tables: many(tables),
}));

export const warehousesRelations = relations(warehouses, ({one, many}) => ({
	branch: one(branches, {
		fields: [warehouses.branchId],
		references: [branches.id]
	}),
	inventoryBatches: many(inventoryBatches),
	inventoryStocks: many(inventoryStock),
	stockMovements_fromWarehouseId: many(stockMovements, {
		relationName: "stockMovements_fromWarehouseId_warehouses_id"
	}),
	stockMovements_toWarehouseId: many(stockMovements, {
		relationName: "stockMovements_toWarehouseId_warehouses_id"
	}),
}));

export const driversRelations = relations(drivers, ({one}) => ({
	branch: one(branches, {
		fields: [drivers.branchId],
		references: [branches.id]
	}),
}));

export const payrollCyclesRelations = relations(payrollCycles, ({one, many}) => ({
	branch: one(branches, {
		fields: [payrollCycles.branchId],
		references: [branches.id]
	}),
	user: one(users, {
		fields: [payrollCycles.executedBy],
		references: [users.id]
	}),
	loanInstallments: many(loanInstallments),
	bonusPenaltyRecords: many(bonusPenaltyRecords),
	payrollPayouts: many(payrollPayouts),
	payrollRuns: many(payrollRuns),
	payslips: many(payslips),
}));

export const managerApprovalsRelations = relations(managerApprovals, ({one}) => ({
	branch: one(branches, {
		fields: [managerApprovals.branchId],
		references: [branches.id]
	}),
	user: one(users, {
		fields: [managerApprovals.managerId],
		references: [users.id]
	}),
}));

export const attendanceGeofencesRelations = relations(attendanceGeofences, ({one}) => ({
	branch_branchId: one(branches, {
		fields: [attendanceGeofences.branchId],
		references: [branches.id],
		relationName: "attendanceGeofences_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceGeofences.branchId],
		references: [branches.id],
		relationName: "attendanceGeofences_branchId_branches_id"
	}),
}));

export const attendanceSessionsRelations = relations(attendanceSessions, ({one, many}) => ({
	branch_branchId: one(branches, {
		fields: [attendanceSessions.branchId],
		references: [branches.id],
		relationName: "attendanceSessions_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceSessions.branchId],
		references: [branches.id],
		relationName: "attendanceSessions_branchId_branches_id"
	}),
	attendanceRawLog_checkInRawLogId: one(attendanceRawLogs, {
		fields: [attendanceSessions.checkInRawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceSessions_checkInRawLogId_attendanceRawLogs_id"
	}),
	attendanceRawLog_checkInRawLogId: one(attendanceRawLogs, {
		fields: [attendanceSessions.checkInRawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceSessions_checkInRawLogId_attendanceRawLogs_id"
	}),
	attendanceRawLog_checkOutRawLogId: one(attendanceRawLogs, {
		fields: [attendanceSessions.checkOutRawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceSessions_checkOutRawLogId_attendanceRawLogs_id"
	}),
	attendanceRawLog_checkOutRawLogId: one(attendanceRawLogs, {
		fields: [attendanceSessions.checkOutRawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceSessions_checkOutRawLogId_attendanceRawLogs_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceSessions.employeeId],
		references: [employees.id],
		relationName: "attendanceSessions_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceSessions.employeeId],
		references: [employees.id],
		relationName: "attendanceSessions_employeeId_employees_id"
	}),
	attendanceExceptions_sessionId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_sessionId_attendanceSessions_id"
	}),
	attendanceExceptions_sessionId: many(attendanceExceptions, {
		relationName: "attendanceExceptions_sessionId_attendanceSessions_id"
	}),
	attendanceCorrections_sessionId: many(attendanceCorrections, {
		relationName: "attendanceCorrections_sessionId_attendanceSessions_id"
	}),
	attendanceCorrections_sessionId: many(attendanceCorrections, {
		relationName: "attendanceCorrections_sessionId_attendanceSessions_id"
	}),
}));

export const tablesRelations = relations(tables, ({one}) => ({
	branch: one(branches, {
		fields: [tables.branchId],
		references: [branches.id]
	}),
	floorZone: one(floorZones, {
		fields: [tables.zoneId],
		references: [floorZones.id]
	}),
}));

export const userSessionsRelations = relations(userSessions, ({one}) => ({
	user: one(users, {
		fields: [userSessions.userId],
		references: [users.id]
	}),
}));

export const attendanceExceptionsRelations = relations(attendanceExceptions, ({one}) => ({
	user_assignedTo: one(users, {
		fields: [attendanceExceptions.assignedTo],
		references: [users.id],
		relationName: "attendanceExceptions_assignedTo_users_id"
	}),
	user_assignedTo: one(users, {
		fields: [attendanceExceptions.assignedTo],
		references: [users.id],
		relationName: "attendanceExceptions_assignedTo_users_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceExceptions.branchId],
		references: [branches.id],
		relationName: "attendanceExceptions_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendanceExceptions.branchId],
		references: [branches.id],
		relationName: "attendanceExceptions_branchId_branches_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceExceptions.employeeId],
		references: [employees.id],
		relationName: "attendanceExceptions_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceExceptions.employeeId],
		references: [employees.id],
		relationName: "attendanceExceptions_employeeId_employees_id"
	}),
	attendanceRawLog_rawLogId: one(attendanceRawLogs, {
		fields: [attendanceExceptions.rawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceExceptions_rawLogId_attendanceRawLogs_id"
	}),
	attendanceRawLog_rawLogId: one(attendanceRawLogs, {
		fields: [attendanceExceptions.rawLogId],
		references: [attendanceRawLogs.id],
		relationName: "attendanceExceptions_rawLogId_attendanceRawLogs_id"
	}),
	user_resolvedBy: one(users, {
		fields: [attendanceExceptions.resolvedBy],
		references: [users.id],
		relationName: "attendanceExceptions_resolvedBy_users_id"
	}),
	user_resolvedBy: one(users, {
		fields: [attendanceExceptions.resolvedBy],
		references: [users.id],
		relationName: "attendanceExceptions_resolvedBy_users_id"
	}),
	attendanceSession_sessionId: one(attendanceSessions, {
		fields: [attendanceExceptions.sessionId],
		references: [attendanceSessions.id],
		relationName: "attendanceExceptions_sessionId_attendanceSessions_id"
	}),
	attendanceSession_sessionId: one(attendanceSessions, {
		fields: [attendanceExceptions.sessionId],
		references: [attendanceSessions.id],
		relationName: "attendanceExceptions_sessionId_attendanceSessions_id"
	}),
}));

export const attendanceCorrectionsRelations = relations(attendanceCorrections, ({one}) => ({
	user_approvedBy: one(users, {
		fields: [attendanceCorrections.approvedBy],
		references: [users.id],
		relationName: "attendanceCorrections_approvedBy_users_id"
	}),
	user_approvedBy: one(users, {
		fields: [attendanceCorrections.approvedBy],
		references: [users.id],
		relationName: "attendanceCorrections_approvedBy_users_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceCorrections.employeeId],
		references: [employees.id],
		relationName: "attendanceCorrections_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [attendanceCorrections.employeeId],
		references: [employees.id],
		relationName: "attendanceCorrections_employeeId_employees_id"
	}),
	user_requestedBy: one(users, {
		fields: [attendanceCorrections.requestedBy],
		references: [users.id],
		relationName: "attendanceCorrections_requestedBy_users_id"
	}),
	user_requestedBy: one(users, {
		fields: [attendanceCorrections.requestedBy],
		references: [users.id],
		relationName: "attendanceCorrections_requestedBy_users_id"
	}),
	attendanceSession_sessionId: one(attendanceSessions, {
		fields: [attendanceCorrections.sessionId],
		references: [attendanceSessions.id],
		relationName: "attendanceCorrections_sessionId_attendanceSessions_id"
	}),
	attendanceSession_sessionId: one(attendanceSessions, {
		fields: [attendanceCorrections.sessionId],
		references: [attendanceSessions.id],
		relationName: "attendanceCorrections_sessionId_attendanceSessions_id"
	}),
}));

export const fiscalPeriodsRelations = relations(fiscalPeriods, ({one}) => ({
	user: one(users, {
		fields: [fiscalPeriods.closedBy],
		references: [users.id]
	}),
}));

export const inventoryBatchesRelations = relations(inventoryBatches, ({one, many}) => ({
	inventoryItem: one(inventoryItems, {
		fields: [inventoryBatches.itemId],
		references: [inventoryItems.id]
	}),
	warehouse: one(warehouses, {
		fields: [inventoryBatches.warehouseId],
		references: [warehouses.id]
	}),
	batchTransactions: many(batchTransactions),
}));

export const attendancePoliciesRelations = relations(attendancePolicies, ({one, many}) => ({
	branch_branchId: one(branches, {
		fields: [attendancePolicies.branchId],
		references: [branches.id],
		relationName: "attendancePolicies_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [attendancePolicies.branchId],
		references: [branches.id],
		relationName: "attendancePolicies_branchId_branches_id"
	}),
	shiftTemplates_attendancePolicyId: many(shiftTemplates, {
		relationName: "shiftTemplates_attendancePolicyId_attendancePolicies_id"
	}),
	shiftTemplates_attendancePolicyId: many(shiftTemplates, {
		relationName: "shiftTemplates_attendancePolicyId_attendancePolicies_id"
	}),
	payrollProfiles: many(payrollProfiles),
}));

export const shiftTemplatesRelations = relations(shiftTemplates, ({one, many}) => ({
	attendancePolicy_attendancePolicyId: one(attendancePolicies, {
		fields: [shiftTemplates.attendancePolicyId],
		references: [attendancePolicies.id],
		relationName: "shiftTemplates_attendancePolicyId_attendancePolicies_id"
	}),
	attendancePolicy_attendancePolicyId: one(attendancePolicies, {
		fields: [shiftTemplates.attendancePolicyId],
		references: [attendancePolicies.id],
		relationName: "shiftTemplates_attendancePolicyId_attendancePolicies_id"
	}),
	branch_branchId: one(branches, {
		fields: [shiftTemplates.branchId],
		references: [branches.id],
		relationName: "shiftTemplates_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [shiftTemplates.branchId],
		references: [branches.id],
		relationName: "shiftTemplates_branchId_branches_id"
	}),
	employeeShiftAssignments_shiftTemplateId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_shiftTemplateId_shiftTemplates_id"
	}),
	employeeShiftAssignments_shiftTemplateId: many(employeeShiftAssignments, {
		relationName: "employeeShiftAssignments_shiftTemplateId_shiftTemplates_id"
	}),
	shiftPlanEntries: many(shiftPlanEntries),
}));

export const paymentMethodAccountsRelations = relations(paymentMethodAccounts, ({one}) => ({
	chartOfAccount: one(chartOfAccounts, {
		fields: [paymentMethodAccounts.accountId],
		references: [chartOfAccounts.id]
	}),
	branch: one(branches, {
		fields: [paymentMethodAccounts.branchId],
		references: [branches.id]
	}),
}));

export const taxAccountsRelations = relations(taxAccounts, ({one}) => ({
	chartOfAccount: one(chartOfAccounts, {
		fields: [taxAccounts.accountId],
		references: [chartOfAccounts.id]
	}),
}));

export const inventoryStockRelations = relations(inventoryStock, ({one}) => ({
	inventoryItem: one(inventoryItems, {
		fields: [inventoryStock.itemId],
		references: [inventoryItems.id]
	}),
	warehouse: one(warehouses, {
		fields: [inventoryStock.warehouseId],
		references: [warehouses.id]
	}),
}));

export const employeeShiftAssignmentsRelations = relations(employeeShiftAssignments, ({one}) => ({
	branch_branchId: one(branches, {
		fields: [employeeShiftAssignments.branchId],
		references: [branches.id],
		relationName: "employeeShiftAssignments_branchId_branches_id"
	}),
	branch_branchId: one(branches, {
		fields: [employeeShiftAssignments.branchId],
		references: [branches.id],
		relationName: "employeeShiftAssignments_branchId_branches_id"
	}),
	employee_employeeId: one(employees, {
		fields: [employeeShiftAssignments.employeeId],
		references: [employees.id],
		relationName: "employeeShiftAssignments_employeeId_employees_id"
	}),
	employee_employeeId: one(employees, {
		fields: [employeeShiftAssignments.employeeId],
		references: [employees.id],
		relationName: "employeeShiftAssignments_employeeId_employees_id"
	}),
	shiftTemplate_shiftTemplateId: one(shiftTemplates, {
		fields: [employeeShiftAssignments.shiftTemplateId],
		references: [shiftTemplates.id],
		relationName: "employeeShiftAssignments_shiftTemplateId_shiftTemplates_id"
	}),
	shiftTemplate_shiftTemplateId: one(shiftTemplates, {
		fields: [employeeShiftAssignments.shiftTemplateId],
		references: [shiftTemplates.id],
		relationName: "employeeShiftAssignments_shiftTemplateId_shiftTemplates_id"
	}),
}));

export const domainEventsRelations = relations(domainEvents, ({one}) => ({
	branch: one(branches, {
		fields: [domainEvents.branchId],
		references: [branches.id]
	}),
}));

export const employeeLoansRelations = relations(employeeLoans, ({one, many}) => ({
	user_approvedBy: one(users, {
		fields: [employeeLoans.approvedBy],
		references: [users.id],
		relationName: "employeeLoans_approvedBy_users_id"
	}),
	branch: one(branches, {
		fields: [employeeLoans.branchId],
		references: [branches.id]
	}),
	employee: one(employees, {
		fields: [employeeLoans.employeeId],
		references: [employees.id]
	}),
	user_requestedBy: one(users, {
		fields: [employeeLoans.requestedBy],
		references: [users.id],
		relationName: "employeeLoans_requestedBy_users_id"
	}),
	loanInstallments: many(loanInstallments),
}));

export const employeePayrollAssignmentsRelations = relations(employeePayrollAssignments, ({one}) => ({
	employee: one(employees, {
		fields: [employeePayrollAssignments.employeeId],
		references: [employees.id]
	}),
	payrollProfile: one(payrollProfiles, {
		fields: [employeePayrollAssignments.payrollProfileId],
		references: [payrollProfiles.id]
	}),
}));

export const payrollProfilesRelations = relations(payrollProfiles, ({one, many}) => ({
	employeePayrollAssignments: many(employeePayrollAssignments),
	payrollRules: many(payrollRules),
	branch: one(branches, {
		fields: [payrollProfiles.branchId],
		references: [branches.id]
	}),
	attendancePolicy: one(attendancePolicies, {
		fields: [payrollProfiles.defaultAttendancePolicyId],
		references: [attendancePolicies.id]
	}),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({one}) => ({
	employee: one(employees, {
		fields: [leaveBalances.employeeId],
		references: [employees.id]
	}),
}));

export const loanInstallmentsRelations = relations(loanInstallments, ({one}) => ({
	employeeLoan: one(employeeLoans, {
		fields: [loanInstallments.loanId],
		references: [employeeLoans.id]
	}),
	payrollCycle: one(payrollCycles, {
		fields: [loanInstallments.payrollCycleId],
		references: [payrollCycles.id]
	}),
}));

export const bonusPenaltyRecordsRelations = relations(bonusPenaltyRecords, ({one}) => ({
	user_approvedBy: one(users, {
		fields: [bonusPenaltyRecords.approvedBy],
		references: [users.id],
		relationName: "bonusPenaltyRecords_approvedBy_users_id"
	}),
	branch: one(branches, {
		fields: [bonusPenaltyRecords.branchId],
		references: [branches.id]
	}),
	employee: one(employees, {
		fields: [bonusPenaltyRecords.employeeId],
		references: [employees.id]
	}),
	payrollCycle: one(payrollCycles, {
		fields: [bonusPenaltyRecords.payrollCycleId],
		references: [payrollCycles.id]
	}),
	user_requestedBy: one(users, {
		fields: [bonusPenaltyRecords.requestedBy],
		references: [users.id],
		relationName: "bonusPenaltyRecords_requestedBy_users_id"
	}),
}));

export const shiftsRelations = relations(shifts, ({one, many}) => ({
	branch: one(branches, {
		fields: [shifts.branchId],
		references: [branches.id]
	}),
	user: one(users, {
		fields: [shifts.userId],
		references: [users.id]
	}),
	shiftTaskRuns: many(shiftTaskRuns),
}));

export const payrollPayoutsRelations = relations(payrollPayouts, ({one}) => ({
	payrollCycle: one(payrollCycles, {
		fields: [payrollPayouts.cycleId],
		references: [payrollCycles.id]
	}),
	employee: one(employees, {
		fields: [payrollPayouts.employeeId],
		references: [employees.id]
	}),
}));

export const payrollComponentsRelations = relations(payrollComponents, ({one, many}) => ({
	branch: one(branches, {
		fields: [payrollComponents.branchId],
		references: [branches.id]
	}),
	payrollRules: many(payrollRules),
}));

export const payrollLocksRelations = relations(payrollLocks, ({one}) => ({
	branch: one(branches, {
		fields: [payrollLocks.branchId],
		references: [branches.id]
	}),
	user: one(users, {
		fields: [payrollLocks.lockedBy],
		references: [users.id]
	}),
}));

export const payrollRulesRelations = relations(payrollRules, ({one}) => ({
	branch: one(branches, {
		fields: [payrollRules.branchId],
		references: [branches.id]
	}),
	payrollComponent: one(payrollComponents, {
		fields: [payrollRules.componentId],
		references: [payrollComponents.id]
	}),
	payrollProfile: one(payrollProfiles, {
		fields: [payrollRules.payrollProfileId],
		references: [payrollProfiles.id]
	}),
}));

export const onboardingRecordsRelations = relations(onboardingRecords, ({one}) => ({
	branch: one(branches, {
		fields: [onboardingRecords.tenantBranchId],
		references: [branches.id]
	}),
}));

export const payrollRunsRelations = relations(payrollRuns, ({one, many}) => ({
	branch: one(branches, {
		fields: [payrollRuns.branchId],
		references: [branches.id]
	}),
	user_closedBy: one(users, {
		fields: [payrollRuns.closedBy],
		references: [users.id],
		relationName: "payrollRuns_closedBy_users_id"
	}),
	user_createdBy: one(users, {
		fields: [payrollRuns.createdBy],
		references: [users.id],
		relationName: "payrollRuns_createdBy_users_id"
	}),
	payrollCycle: one(payrollCycles, {
		fields: [payrollRuns.cycleId],
		references: [payrollCycles.id]
	}),
	payslips: many(payslips),
	payrollRunLines: many(payrollRunLines),
}));

export const payslipsRelations = relations(payslips, ({one}) => ({
	payrollCycle: one(payrollCycles, {
		fields: [payslips.cycleId],
		references: [payrollCycles.id]
	}),
	employee: one(employees, {
		fields: [payslips.employeeId],
		references: [employees.id]
	}),
	user: one(users, {
		fields: [payslips.generatedBy],
		references: [users.id]
	}),
	payrollRun: one(payrollRuns, {
		fields: [payslips.runId],
		references: [payrollRuns.id]
	}),
}));

export const shiftTaskRunsRelations = relations(shiftTaskRuns, ({one}) => ({
	user: one(users, {
		fields: [shiftTaskRuns.completedBy],
		references: [users.id]
	}),
	shift: one(shifts, {
		fields: [shiftTaskRuns.shiftId],
		references: [shifts.id]
	}),
	shiftTask: one(shiftTasks, {
		fields: [shiftTaskRuns.taskId],
		references: [shiftTasks.id]
	}),
}));

export const shiftTasksRelations = relations(shiftTasks, ({one, many}) => ({
	shiftTaskRuns: many(shiftTaskRuns),
	branch: one(branches, {
		fields: [shiftTasks.branchId],
		references: [branches.id]
	}),
}));

export const shiftPlansRelations = relations(shiftPlans, ({one, many}) => ({
	user_approvedBy: one(users, {
		fields: [shiftPlans.approvedBy],
		references: [users.id],
		relationName: "shiftPlans_approvedBy_users_id"
	}),
	branch: one(branches, {
		fields: [shiftPlans.branchId],
		references: [branches.id]
	}),
	user_createdBy: one(users, {
		fields: [shiftPlans.createdBy],
		references: [users.id],
		relationName: "shiftPlans_createdBy_users_id"
	}),
	shiftPlanEntries: many(shiftPlanEntries),
}));

export const menuItemModifiersRelations = relations(menuItemModifiers, ({one}) => ({
	menuItem: one(menuItems, {
		fields: [menuItemModifiers.menuItemId],
		references: [menuItems.id]
	}),
	modifierGroup: one(modifierGroups, {
		fields: [menuItemModifiers.modifierGroupId],
		references: [modifierGroups.id]
	}),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({one}) => ({
	order: one(orders, {
		fields: [orderStatusHistory.orderId],
		references: [orders.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	order: one(orders, {
		fields: [payments.orderId],
		references: [orders.id]
	}),
}));

export const payrollRunLinesRelations = relations(payrollRunLines, ({one}) => ({
	employee: one(employees, {
		fields: [payrollRunLines.employeeId],
		references: [employees.id]
	}),
	payrollRun: one(payrollRuns, {
		fields: [payrollRunLines.runId],
		references: [payrollRuns.id]
	}),
}));

export const shiftPlanEntriesRelations = relations(shiftPlanEntries, ({one}) => ({
	branch: one(branches, {
		fields: [shiftPlanEntries.branchId],
		references: [branches.id]
	}),
	employee: one(employees, {
		fields: [shiftPlanEntries.employeeId],
		references: [employees.id]
	}),
	shiftPlan: one(shiftPlans, {
		fields: [shiftPlanEntries.planId],
		references: [shiftPlans.id]
	}),
	shiftTemplate: one(shiftTemplates, {
		fields: [shiftPlanEntries.shiftTemplateId],
		references: [shiftTemplates.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	subscriptionPlan: one(subscriptionPlans, {
		fields: [subscriptions.planId],
		references: [subscriptionPlans.id]
	}),
	branch: one(branches, {
		fields: [subscriptions.tenantBranchId],
		references: [branches.id]
	}),
}));

export const subscriptionPlansRelations = relations(subscriptionPlans, ({many}) => ({
	subscriptions: many(subscriptions),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({one}) => ({
	inventoryItem: one(inventoryItems, {
		fields: [recipeIngredients.inventoryItemId],
		references: [inventoryItems.id]
	}),
	recipe: one(recipes, {
		fields: [recipeIngredients.recipeId],
		references: [recipes.id]
	}),
}));

export const stockMovementsRelations = relations(stockMovements, ({one, many}) => ({
	warehouse_fromWarehouseId: one(warehouses, {
		fields: [stockMovements.fromWarehouseId],
		references: [warehouses.id],
		relationName: "stockMovements_fromWarehouseId_warehouses_id"
	}),
	inventoryItem: one(inventoryItems, {
		fields: [stockMovements.itemId],
		references: [inventoryItems.id]
	}),
	warehouse_toWarehouseId: one(warehouses, {
		fields: [stockMovements.toWarehouseId],
		references: [warehouses.id],
		relationName: "stockMovements_toWarehouseId_warehouses_id"
	}),
	batchTransactions: many(batchTransactions),
}));

export const batchTransactionsRelations = relations(batchTransactions, ({one}) => ({
	inventoryBatch: one(inventoryBatches, {
		fields: [batchTransactions.batchId],
		references: [inventoryBatches.id]
	}),
	stockMovement: one(stockMovements, {
		fields: [batchTransactions.stockMovementId],
		references: [stockMovements.id]
	}),
}));

export const attendanceRelations = relations(attendance, ({one}) => ({
	branch: one(branches, {
		fields: [attendance.branchId],
		references: [branches.id]
	}),
	employee: one(employees, {
		fields: [attendance.employeeId],
		references: [employees.id]
	}),
}));