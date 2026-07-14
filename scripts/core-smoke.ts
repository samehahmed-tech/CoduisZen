import * as dotenv from 'dotenv';

dotenv.config();

type StepResult = {
    name: string;
    ok: boolean;
    level: 'required' | 'recommended';
    detail: string;
};

type ApiError = Error & { status?: number; code?: string; requestId?: string; details?: any };

const configuredApiBaseUrl = String(process.env.SMOKE_API_BASE_URL || '').trim();
const frontendApiBaseUrl = String(process.env.VITE_API_URL || '').trim();
const API_BASE_URL = (
    configuredApiBaseUrl
    || (/^https?:\/\//i.test(frontendApiBaseUrl) ? frontendApiBaseUrl : 'http://localhost:3001/api')
).replace(/\/+$/, '');
const SMOKE_TOKEN = String(process.env.SMOKE_TOKEN || '').trim();
const SMOKE_BRANCH_ID = String(process.env.SMOKE_BRANCH_ID || 'b1').trim();

const results: StepResult[] = [];

const pushResult = (name: string, ok: boolean, level: 'required' | 'recommended', detail: string) => {
    const status = ok ? 'PASS' : level === 'required' ? 'FAIL' : 'WARN';
    console.log(`[${status}] (${level}) ${name} - ${detail}`);
    results.push({ name, ok, level, detail });
};

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(SMOKE_TOKEN ? { Authorization: `Bearer ${SMOKE_TOKEN}` } : {}),
            ...(init?.headers || {}),
        },
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const err = new Error(String(payload?.message || payload?.error || payload?.code || `HTTP_${response.status}`)) as ApiError;
        err.status = response.status;
        err.code = payload?.code || payload?.error;
        err.requestId = payload?.requestId;
        err.details = payload?.details;
        throw err;
    }
    return response.json() as Promise<T>;
};

const ensurePreconditions = () => {
    if (!SMOKE_TOKEN) {
        pushResult('Smoke token', false, 'required', 'SMOKE_TOKEN is missing');
        printSummaryAndExit();
    }
};

const formatErr = (error: any) => {
    const code = error?.code ? `code=${error.code}` : '';
    const requestId = error?.requestId ? `requestId=${error.requestId}` : '';
    const msg = error?.message || 'unknown_error';
    return [msg, code, requestId].filter(Boolean).join(' | ');
};

const main = async () => {
    ensurePreconditions();

    try {
        await apiFetch('/health');
        pushResult('Health check', true, 'required', 'API reachable');
    } catch (error: any) {
        pushResult('Health check', false, 'required', formatErr(error));
        printSummaryAndExit();
        return;
    }

    let activeShift: any = null;
    try {
        activeShift = await apiFetch(`/shifts/active?branchId=${encodeURIComponent(SMOKE_BRANCH_ID)}`);
        if (!activeShift?.id) {
            pushResult('Active shift lookup', false, 'required', `No active shift in branch ${SMOKE_BRANCH_ID}`);
            printSummaryAndExit();
            return;
        }
        pushResult('Active shift lookup', true, 'required', `shift=${activeShift.id}`);
    } catch (error: any) {
        pushResult('Active shift lookup', false, 'required', formatErr(error));
        printSummaryAndExit();
        return;
    }

    const orderId = `SMK-${Date.now()}`;
    let createdOrder: any = null;
    try {
        const menuItems = await apiFetch<any[]>('/menu/items');
        const smokeItem = menuItems.find((item) => item?.id && item?.isAvailable !== false) || menuItems.find((item) => item?.id);
        if (!smokeItem?.id) {
            pushResult('Create order', false, 'required', 'No menu item exists for smoke order');
            printSummaryAndExit();
            return;
        }
        const smokePrice = Number(smokeItem.price || 50);
        const smokeTax = Number((smokePrice * 0.14).toFixed(2));
        const smokeTotal = Number((smokePrice + smokeTax).toFixed(2));
        createdOrder = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify({
                id: orderId,
                type: 'TAKEAWAY',
                source: 'smoke',
                branch_id: SMOKE_BRANCH_ID,
                status: 'PENDING',
                subtotal: smokePrice,
                discount: 0,
                tax: smokeTax,
                total: smokeTotal,
                payment_method: 'CASH',
                payments: [{ method: 'CASH', amount: smokeTotal }],
                notes: 'core smoke script order',
                items: [
                    {
                        menu_item_id: smokeItem.id,
                        name: smokeItem.name || smokeItem.nameAr || 'Smoke Test Item',
                        price: smokePrice,
                        quantity: 1,
                    },
                ],
            }),
        });
        pushResult('Create order', Boolean(createdOrder?.id), 'required', `order=${createdOrder?.id || orderId}`);
    } catch (error: any) {
        pushResult('Create order', false, 'required', formatErr(error));
        printSummaryAndExit();
        return;
    }

    const statusOrderId = createdOrder?.id || orderId;
    try {
        await apiFetch(`/orders/${encodeURIComponent(statusOrderId)}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'PREPARING' }),
        });
        await apiFetch(`/orders/${encodeURIComponent(statusOrderId)}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'READY' }),
        });
        pushResult('Order status progression', true, 'required', `${statusOrderId}: PENDING -> PREPARING -> READY`);
    } catch (error: any) {
        pushResult('Order status progression', false, 'required', formatErr(error));
    }

    let assigned = false;
    try {
        const drivers = await apiFetch<any[]>(`/delivery/drivers/all?branchId=${encodeURIComponent(SMOKE_BRANCH_ID)}`);
        const available = drivers.find((driver) => String(driver?.status || '').toUpperCase() === 'AVAILABLE') || drivers[0];
        if (!available?.id) {
            pushResult('Driver assignment', false, 'recommended', 'No drivers found for assignment');
        } else {
            await apiFetch('/delivery/assign', {
                method: 'POST',
                body: JSON.stringify({ orderId: statusOrderId, driverId: available.id }),
            });
            assigned = true;
            pushResult('Driver assignment', true, 'recommended', `order=${statusOrderId} driver=${available.id}`);
        }
    } catch (error: any) {
        pushResult('Driver assignment', false, 'recommended', formatErr(error));
    }

    try {
        const report = await apiFetch<any>(`/shifts/${encodeURIComponent(activeShift.id)}/x-report`);
        pushResult('Shift close preview (X report)', Boolean(report), 'required', `shift=${activeShift.id}`);
    } catch (error: any) {
        pushResult('Shift close preview (X report)', false, 'required', formatErr(error));
    }

    try {
        const today = new Date().toISOString().slice(0, 10);
        const report = await apiFetch<any>(`/day-close/${encodeURIComponent(SMOKE_BRANCH_ID)}/${today}`);
        const status = report?.status ? `status=${report.status}` : 'report fetched';
        pushResult('Day-close preview', true, 'required', `${today} ${status}`);
    } catch (error: any) {
        pushResult('Day-close preview', false, 'required', formatErr(error));
    }

    if (assigned) {
        pushResult('Dispatch flow', true, 'recommended', 'Order reached dispatch assignment path');
    }

    printSummaryAndExit();
};

const printSummaryAndExit = () => {
    const requiredFails = results.filter((result) => result.level === 'required' && !result.ok);
    const recommendedFails = results.filter((result) => result.level === 'recommended' && !result.ok);

    console.log('');
    console.log(JSON.stringify({
        ok: requiredFails.length === 0,
        requiredFailed: requiredFails.map((result) => ({ name: result.name, detail: result.detail })),
        recommendedWarnings: recommendedFails.map((result) => ({ name: result.name, detail: result.detail })),
    }, null, 2));

    process.exit(requiredFails.length === 0 ? 0 : 1);
};

main().catch((error) => {
    pushResult('Smoke script runtime', false, 'required', formatErr(error));
    printSummaryAndExit();
});
