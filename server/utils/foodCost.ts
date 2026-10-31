export interface FoodCostVarianceInput {
    theoreticalCost: number;
    actualCost: number;
    revenue?: number;
}

export interface FoodCostVariance {
    theoreticalCost: number;
    actualCost: number;
    variance: number;
    variancePercent: number;
    theoreticalFoodCostPercent: number;
    actualFoodCostPercent: number;
}

const round = (value: number, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
};

/** Positive variance means actual consumption exceeded theoretical cost. */
export const calculateFoodCostVariance = ({ theoreticalCost, actualCost, revenue = 0 }: FoodCostVarianceInput): FoodCostVariance => {
    const theoretical = Math.max(0, Number(theoreticalCost) || 0);
    const actual = Math.max(0, Number(actualCost) || 0);
    const sales = Math.max(0, Number(revenue) || 0);
    const variance = actual - theoretical;

    return {
        theoreticalCost: round(theoretical),
        actualCost: round(actual),
        variance: round(variance),
        variancePercent: theoretical > 0 ? round((variance / theoretical) * 100, 1) : 0,
        theoreticalFoodCostPercent: sales > 0 ? round((theoretical / sales) * 100, 1) : 0,
        actualFoodCostPercent: sales > 0 ? round((actual / sales) * 100, 1) : 0,
    };
};
