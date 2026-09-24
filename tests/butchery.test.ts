import { describe, expect, it } from 'vitest';
import {
    allocateCost,
    calcUsableYieldPct,
    calcWastePct,
    calcYieldPct,
    calcYieldVariance,
    validateButcheryInput,
} from '../server/services/butcheryService';

// Canonical scenario from the spec:
// 20 KG Whole Beef Leg @ 10,000 EGP total.
const SCENARIO = {
    sourceQty: 20,
    sourceUnit: 'KG',
    sourceTotalCost: 10000,
    outputs: [
        { quantity: 6, unit: 'KG', outputType: 'USABLE' as const },
        { quantity: 4, unit: 'KG', outputType: 'USABLE' as const },
        { quantity: 3, unit: 'KG', outputType: 'USABLE' as const },
        { quantity: 2, unit: 'KG', outputType: 'BY_PRODUCT' as const },
        { quantity: 3, unit: 'KG', outputType: 'BY_PRODUCT' as const },
        { quantity: 2, unit: 'KG', outputType: 'WASTE' as const },
    ],
};

describe('butchery yield calculation', () => {
    it('computes per-output yield % against input weight', () => {
        expect(calcYieldPct(6, 20)).toBeCloseTo(30);
        expect(calcYieldPct(2, 20)).toBeCloseTo(10);
    });

    it('computes usable yield excluding waste (6+4+3+2+3 = 18/20 = 90%)', () => {
        const allocated = allocateCost(SCENARIO.sourceQty, SCENARIO.sourceUnit, SCENARIO.sourceTotalCost, SCENARIO.outputs);
        const usable = calcUsableYieldPct(
            allocated.map((o) => ({ quantityInSourceUnit: o.quantityInSourceUnit, outputType: o.outputType })),
            SCENARIO.sourceQty,
        );
        expect(usable).toBeCloseTo(90, 1);
    });

    it('computes waste % (2/20 = 10%)', () => {
        const allocated = allocateCost(SCENARIO.sourceQty, SCENARIO.sourceUnit, SCENARIO.sourceTotalCost, SCENARIO.outputs);
        const waste = calcWastePct(
            allocated.map((o) => ({ quantityInSourceUnit: o.quantityInSourceUnit, outputType: o.outputType })),
            SCENARIO.sourceQty,
        );
        expect(waste).toBeCloseTo(10, 1);
    });

    it('handles gram recipe units against KG inventory units', () => {
        const allocated = allocateCost(20, 'KG', 10000, [
            { quantity: 6000, unit: 'GRAM', outputType: 'USABLE' },
            { quantity: 14000, unit: 'GRAM', outputType: 'BY_PRODUCT' },
        ]);
        expect(allocated[0].yieldPct).toBeCloseTo(30, 1);
        expect(allocated[1].yieldPct).toBeCloseTo(70, 1);
    });
});

describe('butchery cost allocation', () => {
    it('conserves value: allocated + waste == input cost (10,000)', () => {
        const allocated = allocateCost(SCENARIO.sourceQty, SCENARIO.sourceUnit, SCENARIO.sourceTotalCost, SCENARIO.outputs);
        const sum = allocated.reduce((s, o) => s + o.totalAllocatedCost, 0);
        expect(sum).toBeCloseTo(10000, 2);
    });

    it('allocates proportionally by weight (steak 6/20 -> 3000)', () => {
        const allocated = allocateCost(SCENARIO.sourceQty, SCENARIO.sourceUnit, SCENARIO.sourceTotalCost, SCENARIO.outputs);
        expect(allocated[0].totalAllocatedCost).toBeCloseTo(3000, 2);
        expect(allocated[0].allocatedUnitCost).toBeCloseTo(500, 2);
    });

    it('absorbs rounding without creating or destroying value', () => {
        const allocated = allocateCost(3, 'KG', 1000, [
            { quantity: 1, unit: 'KG', outputType: 'USABLE' },
            { quantity: 1, unit: 'KG', outputType: 'USABLE' },
            { quantity: 1, unit: 'KG', outputType: 'USABLE' },
        ]);
        const sum = allocated.reduce((s, o) => s + o.totalAllocatedCost, 0);
        expect(sum).toBeCloseTo(1000, 2);
    });

    it('supports 100% waste (total loss recorded, nothing stockable)', () => {
        const allocated = allocateCost(5, 'KG', 2500, [{ quantity: 5, unit: 'KG', outputType: 'WASTE' }]);
        expect(allocated[0].totalAllocatedCost).toBeCloseTo(2500, 2);
        const waste = calcWastePct(
            allocated.map((o) => ({ quantityInSourceUnit: o.quantityInSourceUnit, outputType: o.outputType })),
            5,
        );
        expect(waste).toBeCloseTo(100);
    });

    it('supports zero waste', () => {
        const allocated = allocateCost(10, 'KG', 5000, [{ quantity: 10, unit: 'KG', outputType: 'USABLE' }]);
        expect(calcWastePct(allocated.map((o) => ({ quantityInSourceUnit: o.quantityInSourceUnit, outputType: o.outputType })), 10)).toBe(0);
    });

    it('rejects incompatible units instead of silently mis-costing', () => {
        expect(() => allocateCost(20, 'KG', 10000, [{ quantity: 5, unit: 'piece', outputType: 'USABLE' }])).toThrow('INCOMPATIBLE_UNITS');
    });
});

describe('butchery validation', () => {
    it('rejects zero input, missing outputs, bad types', () => {
        expect(validateButcheryInput(0, 'KG', SCENARIO.outputs)).toBe('INVALID_SOURCE_QTY');
        expect(validateButcheryInput(20, 'KG', [])).toBe('OUTPUTS_REQUIRED');
        expect(validateButcheryInput(20, 'KG', [{ quantity: 1, unit: 'KG', outputType: 'NOPE' as any }])).toBe('INVALID_OUTPUT_TYPE');
        expect(validateButcheryInput(20, 'KG', [{ quantity: -1, unit: 'KG', outputType: 'USABLE' }])).toBe('INVALID_OUTPUT_QTY');
    });

    it('requires an item for stockable outputs but not for pure waste', () => {
        expect(validateButcheryInput(20, 'KG', [{ quantity: 2, unit: 'KG', outputType: 'WASTE' }])).toBeNull();
        expect(validateButcheryInput(20, 'KG', [{ quantity: 2, unit: 'KG', outputType: 'USABLE' }])).toBe('OUTPUT_ITEM_REQUIRED');
    });

    it('accepts the canonical scenario', () => {
        expect(
            validateButcheryInput(20, 'KG', SCENARIO.outputs.map((o, i) => ({ ...o, itemId: `item-${i}` }))),
        ).toBeNull();
    });
});

describe('butchery yield variance', () => {
    it('reports expected vs actual variance (30% expected, 26% actual -> -4%)', () => {
        expect(calcYieldVariance(30, 26)).toBeCloseTo(-4);
    });
});
