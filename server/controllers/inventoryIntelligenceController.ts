/**
 * Inventory Intelligence Controller
 * Handles: Reorder Alerts, Purchase Suggestions, Unit Conversion, Stock Count
 */

import { Request, Response } from 'express';
import { inventoryIntelligence } from '../services/inventoryIntelligence';
import { getStringParam } from '../utils/request';

export const getReorderAlerts = async (req: Request, res: Response) => {
    try {
        const warehouseId = req.query.warehouseId as string | undefined;
        const alerts = await inventoryIntelligence.getReorderAlerts(warehouseId);
        res.json(alerts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getPurchaseSuggestions = async (req: Request, res: Response) => {
    try {
        const warehouseId = req.query.warehouseId as string | undefined;
        const suggestions = await inventoryIntelligence.getPurchaseSuggestions(warehouseId);
        res.json(suggestions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const convertUnit = async (req: Request, res: Response) => {
    try {
        const { value, from, to } = req.query;
        if (!value || !from || !to) {
            return res.status(400).json({ error: 'value, from, and to are required' });
        }
        const result = inventoryIntelligence.convert(Number(value), String(from), String(to));
        if (!result) {
            return res.status(400).json({ error: `Cannot convert from ${from} to ${to}` });
        }
        res.json({ ...result, from: String(from), to: String(to), originalValue: Number(value) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getSupportedUnits = async (_req: Request, res: Response) => {
    try {
        res.json(inventoryIntelligence.getSupportedUnits());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// Stock Count
export const createStockCount = async (req: Request, res: Response) => {
    try {
        const { warehouseId } = req.body;
        if (!warehouseId) return res.status(400).json({ error: 'warehouseId is required' });
        const session = await inventoryIntelligence.createStockCountSession(warehouseId, req.user?.id || 'system');
        res.status(201).json(session);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateStockCount = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { counts } = req.body;
        if (!sessionId || !counts) return res.status(400).json({ error: 'sessionId and counts are required' });
        const session = await inventoryIntelligence.updateStockCount(String(sessionId), counts, req.user?.id || 'system');
        res.json(session);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const completeStockCount = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { applyAdjustments } = req.body;
        const session = await inventoryIntelligence.completeStockCount(
            String(sessionId),
            req.user?.id || 'system',
            applyAdjustments !== false
        );
        res.json(session);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAIForecast = async (req: Request, res: Response) => {
    try {
        const itemId = getStringParam(req.params.itemId);
        if (!itemId) return res.status(400).json({ error: 'itemId is required' });
        const forecast = await inventoryIntelligence.getAIForecast(itemId);
        res.json(forecast);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
