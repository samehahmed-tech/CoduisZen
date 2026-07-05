import Dexie, { Table } from 'dexie';
import { Order, SyncStatus } from '../../types';

export interface LocalOrder extends Order {
    id: string;
    syncStatus: SyncStatus;
}

export interface SyncQueueItem {
    id: string;
    entity: string;
    action: string;
    payload: any;
    dedupeKey: string;
    status: 'PENDING' | 'SYNCED' | 'FAILED';
    retryCount: number;
    lastError?: string;
    createdAt: number;
    updatedAt?: number;
    lastAttemptAt?: number;
    nextAttemptAt?: number;
    lockedAt?: number;
}

export class CoduisZenLocalDb extends Dexie {
    orders!: Table<LocalOrder>;
    menuCategories!: Table<any>;
    menuItems!: Table<any>;
    customers!: Table<any>;
    inventoryItems!: Table<any>;
    warehouses!: Table<any>;
    settings!: Table<{ key: string; value: any; updatedAt?: number }>;
    users!: Table<any>;
    branches!: Table<any>;
    auditLogs!: Table<any>;
    floorTables!: Table<any>;
    floorZones!: Table<any>;
    syncQueue!: Table<SyncQueueItem>;

    constructor() {
        super('CoduisZenLocalDb');

        // Legacy version
        this.version(1).stores({
            orders: 'id, status, syncStatus, createdAt',
        });

        // Current version
        this.version(2).stores({
            orders: 'id, status, syncStatus, createdAt',
            menuCategories: 'id, updatedAt',
            menuItems: 'id, categoryId, updatedAt',
            customers: 'id, phone, updatedAt',
            inventoryItems: 'id, updatedAt',
            warehouses: 'id, branchId, updatedAt',
            settings: 'key, updatedAt',
            users: 'id, email',
            branches: 'id',
            auditLogs: 'id, createdAt',
            floorTables: 'id, branchId',
            floorZones: 'id, branchId',
            syncQueue: 'id, status, createdAt, entity'
        });

        // Bump version to ensure IndexedDB picks up renamed stores
        this.version(3).stores({
            orders: 'id, status, syncStatus, createdAt',
            menuCategories: 'id, updatedAt',
            menuItems: 'id, categoryId, updatedAt',
            customers: 'id, phone, updatedAt',
            inventoryItems: 'id, updatedAt',
            warehouses: 'id, branchId, updatedAt',
            settings: 'key, updatedAt',
            users: 'id, email',
            branches: 'id',
            auditLogs: 'id, createdAt',
            floorTables: 'id, branchId',
            floorZones: 'id, branchId',
            syncQueue: 'id, status, createdAt, entity'
        });

        // Phase 1: Add de-dup + retry metadata to sync queue
        this.version(4).stores({
            orders: 'id, status, syncStatus, createdAt',
            menuCategories: 'id, updatedAt',
            menuItems: 'id, categoryId, updatedAt',
            customers: 'id, phone, updatedAt',
            inventoryItems: 'id, updatedAt',
            warehouses: 'id, branchId, updatedAt',
            settings: 'key, updatedAt',
            users: 'id, email',
            branches: 'id',
            auditLogs: 'id, createdAt',
            floorTables: 'id, branchId',
            floorZones: 'id, branchId',
            syncQueue: 'id, status, createdAt, entity, dedupeKey, nextAttemptAt'
        });

        // Phase 2: Offline depth for Procurement
        this.version(5).stores({
            orders: 'id, status, syncStatus, createdAt',
            menuCategories: 'id, updatedAt',
            menuItems: 'id, categoryId, updatedAt',
            customers: 'id, phone, updatedAt',
            inventoryItems: 'id, updatedAt',
            warehouses: 'id, branchId, updatedAt',
            suppliers: 'id, name',
            purchaseOrders: 'id, supplierId, status, createdAt',
            settings: 'key, updatedAt',
            users: 'id, email',
            branches: 'id',
            auditLogs: 'id, createdAt',
            floorTables: 'id, branchId',
            floorZones: 'id, branchId',
            syncQueue: 'id, status, createdAt, entity, dedupeKey, nextAttemptAt'
        });
    }

    suppliers!: Table<any>;
    purchaseOrders!: Table<any>;
}

export const localDb = new CoduisZenLocalDb();

