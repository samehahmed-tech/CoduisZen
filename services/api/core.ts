const resolveApiBaseUrl = () => {
    const configured = import.meta.env.VITE_API_URL || '/api';
    if (configured && !configured.startsWith('/')) return configured.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && import.meta.env.DEV && ['3000', '5173'].includes(window.location.port)) {
        return `${window.location.protocol}//${window.location.hostname}:3001/api`;
    }
    return configured;
};

const API_BASE_URL = resolveApiBaseUrl();

export type AppApiError = Error & {
    status?: number;
    endpoint?: string;
    code?: string;
    requestId?: string;
    details?: any;
    silent?: boolean;
};

const toAppApiError = (
    payload: any,
    status: number,
    endpoint: string,
): AppApiError => {
    const code = String(payload?.code || payload?.error || `HTTP_${status}`);
    const detailSummary = Array.isArray(payload?.details)
        ? payload.details
            .map((detail: any) => {
                const field = detail?.field ? String(detail.field) : '';
                const detailMessage = detail?.message ? String(detail.message) : '';
                return [field, detailMessage].filter(Boolean).join(': ');
            })
            .filter(Boolean)
            .join('; ')
        : '';
    const baseMessage = String(payload?.message || payload?.error || code);
    const message = detailSummary ? `${baseMessage}: ${detailSummary}` : baseMessage;
    const err = new Error(message) as AppApiError;
    err.status = status;
    err.endpoint = endpoint;
    err.code = code;
    err.requestId = payload?.requestId ? String(payload.requestId) : undefined;
    err.details = payload?.details;
    return err;
};

export const getActionableErrorMessage = (error: any, lang: 'en' | 'ar' = 'en') => {
    const code = String(error?.code || error?.message || '').toUpperCase();
    const fallback = lang === 'ar' ? 'حدث خطأ غير متوقع. حاول مرة أخرى.' : 'Unexpected error. Please try again.';
    const mapAr: Record<string, string> = {
        ORDER_BUSINESS_DAY_CLOSED: 'يوم تشغيل هذا الطلب مغلق. الطلب متاح للمراجعة والطباعة فقط.',
        ORDER_HISTORY_READ_ONLY: 'هذا الطلب تابع ليوم تشغيل سابق ومتاح للمراجعة والطباعة فقط.',
        PACKING_HANDOVER_TYPE_INVALID: 'شاشة التسليم مخصصة لطلبات التيك أواي والاستلام والكشك فقط.',
        INVALID_MODIFIER_OPTION: 'أحد اختيارات الصنف غير متاح حاليًا. ارجع للصنف واختر مرة أخرى.',
        INVALID_CUSTOMER_REFERENCE: 'بيانات العميل غير محفوظة أو غير مكتملة. اختر العميل من القائمة أو احفظ بياناته ثم أعد إرسال الطلب.',
        INVALID_BRANCH_REFERENCE: 'الفرع المختار غير موجود أو غير متاح. حدّث الصفحة واختر الفرع الصحيح.',
        INVALID_SHIFT_REFERENCE: 'الشيفت المرتبط بالطلب غير صالح أو اتقفل. افتح أو حدّث الشيفت ثم أعد المحاولة.',
        INVALID_SHIFT_BRANCH: 'الشيفت الحالي لا يخص الفرع المختار. حدّث الصفحة أو افتح شيفت جديد للفرع الحالي.',
        SHIFT_CLOSED: 'الشيفت المحدد اتقفل. افتح شيفت جديد ثم أعد إرسال الطلب.',
        INVALID_REFERENCE: 'أحد الاختيارات المرتبطة بالطلب غير موجود. حدّث الصفحة وراجع البيانات ثم أعد المحاولة.',
        INSUFFICIENT_INVENTORY: 'المخزون لا يكفي لحفظ الطلب. راجع مخزون مكونات الصنف أو اختر صنفًا آخر.',
        DUPLICATE_RECORD: 'هذا السجل موجود بالفعل. حدّث الصفحة ثم حاول مرة أخرى.',
        DATABASE_QUERY_FAILED: 'تعذر حفظ الطلب بسبب بيانات مرتبطة غير متناسقة. حدّث الصفحة وراجع العميل والفرع والشيفت.',
        RECORD_HAS_LINKED_DATA: 'لا يمكن حذف هذا السجل لأنه مرتبط ببيانات تشغيل. استخدم الأرشفة أو التعطيل بدل الحذف.',
        ORDER_CREATE_FAILED: 'تعذر حفظ الطلب. راجع بيانات العميل والفرع والشيفت ثم حاول مرة أخرى.',
        ORDER_VERSION_CONFLICT: 'الطلب تم تعديله من جهاز آخر. تم تحديث البيانات، حاول مرة أخرى.',
        FORBIDDEN: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
        FORBIDDEN_BRANCH_SCOPE: 'لا يمكن تنفيذ الإجراء خارج فرعك الحالي.',
        STATUS_TRANSITION_FORBIDDEN: 'ليس لديك صلاحية تغيير حالة الطلب إلى هذه الحالة.',
        INVALID_STATUS_TRANSITION: 'لا يمكن نقل الطلب لهذه الحالة مباشرة.',
        KITCHEN_TICKETS_MISSING: 'لا يمكن تسليم الطلب لأنه لا توجد له تذاكر مطبخ.',
        KITCHEN_TICKETS_NOT_READY: 'لا يمكن تسليم الطلب قبل جاهزية كل تذاكر المطبخ.',
        ORDER_CANCELLED: 'لا يمكن تسليم طلب ملغي.',
        INVALID_CASH_BALANCE: 'مبلغ الخزنة يجب أن يكون رقمًا صحيحًا وصفرًا أو أكثر.',
        OPENING_BALANCE_REQUIRED: 'الرصيد الافتتاحي مطلوب.',
        ACTUAL_BALANCE_REQUIRED: 'العد الفعلي للخزنة مطلوب.',
        VARIANCE_REASON_REQUIRED: 'اكتب سبب العجز أو الزيادة قبل إغلاق الشيفت.',
        TABLE_MINIMUM_SPEND_NOT_MET: 'إجمالي الطلب أقل من الحد الأدنى المحدد للطاولة.',
        INVALID_TABLE_REFERENCE: 'الطاولة المختارة غير موجودة في الفرع الحالي.',
        SOURCE_ORDER_NOT_FOUND: 'لا يوجد طلب نشط على الطاولة المصدر. حدّث خريطة الطاولات.',
        TARGET_TABLE_HAS_ACTIVE_ORDER: 'الطاولة المستهدفة مشغولة. استخدم الدمج أو نقل أصناف.',
        TARGET_ORDER_NOT_FOUND: 'الطاولة المستهدفة لا تحتوي طلباً نشطاً للدمج.',
        SOURCE_TABLE_NOT_FOUND: 'الطاولة المصدر غير موجودة في الفرع الحالي.',
        TARGET_TABLE_NOT_FOUND: 'الطاولة المستهدفة غير موجودة في الفرع الحالي.',
        NO_ITEMS_SELECTED: 'اختر صنفاً واحداً على الأقل.',
        ORDER_ITEM_QUANTITY_UNAVAILABLE: 'كمية الصنف تغيرت من جهاز آخر. حدّث الطلب وحاول مرة أخرى.',
        TABLE_MANAGEMENT_REQUIRES_ONLINE: 'نقل ودمج وتقسيم الطاولات يحتاج اتصالاً بالسيرفر.',
        BRANCH_SCOPE_REQUIRED: 'اختر الفرع الحالي ثم حاول مرة أخرى.',
        CANCELLATION_REASON_REQUIRED: 'سبب الإلغاء مطلوب قبل إلغاء الطلب.',
        SHIFT_REQUIRED: 'لا يوجد شيفت مفتوح. افتح شيفت أولاً ثم أعد المحاولة.',
        IDEMPOTENCY_KEY_PAYLOAD_CONFLICT: 'تم إرسال نفس العملية ببيانات مختلفة. راجع الطلب وأعد الإرسال.',
        IDEMPOTENCY_KEY_IN_PROGRESS: 'جاري تنفيذ نفس العملية بالفعل. انتظر لحظات ثم حدّث الشاشة.',
        TOO_MANY_LOGIN_ATTEMPTS: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
        UNSUPPORTED_REPORT_EXPORT: 'تصدير CSV/Excel غير متاح لهذا التقرير. استخدم PDF أو الطباعة.',
        VALIDATION_ERROR: 'بعض البيانات غير صحيحة. راجع المدخلات.',
    };
    const mapEn: Record<string, string> = {
        ORDER_BUSINESS_DAY_CLOSED: 'This order belongs to a closed business day and is available for review and printing only.',
        ORDER_HISTORY_READ_ONLY: 'This order belongs to a previous business day and is available for review and printing only.',
        PACKING_HANDOVER_TYPE_INVALID: 'Packing handover is only available for takeaway, pickup, and kiosk orders.',
        INVALID_MODIFIER_OPTION: 'One selected item option is no longer available. Reopen the item and choose again.',
        ORDER_VERSION_CONFLICT: 'Order was updated from another device. Data was refreshed, please retry.',
        FORBIDDEN: 'You do not have permission to perform this action.',
        FORBIDDEN_BRANCH_SCOPE: 'Action is not allowed outside your branch scope.',
        STATUS_TRANSITION_FORBIDDEN: 'You are not allowed to move order to this status.',
        INVALID_STATUS_TRANSITION: 'This order status transition is not allowed.',
        KITCHEN_TICKETS_MISSING: 'This order cannot be handed over because it has no kitchen tickets.',
        KITCHEN_TICKETS_NOT_READY: 'All kitchen tickets must be ready before handover.',
        ORDER_CANCELLED: 'A cancelled order cannot be handed over.',
        INVALID_CASH_BALANCE: 'Cash balance must be a valid number greater than or equal to zero.',
        OPENING_BALANCE_REQUIRED: 'Opening cash balance is required.',
        ACTUAL_BALANCE_REQUIRED: 'Actual drawer count is required.',
        VARIANCE_REASON_REQUIRED: 'A reason is required for cash overage or shortage.',
        TABLE_MINIMUM_SPEND_NOT_MET: 'Order subtotal is below this table’s minimum spend.',
        INVALID_TABLE_REFERENCE: 'Selected table does not exist in the current branch.',
        SOURCE_ORDER_NOT_FOUND: 'No active order exists on the source table. Refresh the floor map.',
        TARGET_TABLE_HAS_ACTIVE_ORDER: 'Target table is occupied. Use merge or move selected items.',
        TARGET_ORDER_NOT_FOUND: 'Target table has no active order to merge into.',
        SOURCE_TABLE_NOT_FOUND: 'Source table does not exist in the current branch.',
        TARGET_TABLE_NOT_FOUND: 'Target table does not exist in the current branch.',
        NO_ITEMS_SELECTED: 'Select at least one item.',
        ORDER_ITEM_QUANTITY_UNAVAILABLE: 'Item quantity changed on another device. Refresh and retry.',
        TABLE_MANAGEMENT_REQUIRES_ONLINE: 'Table transfer, merge, and split require a server connection.',
        BRANCH_SCOPE_REQUIRED: 'Select the active branch and retry.',
        CANCELLATION_REASON_REQUIRED: 'Cancellation reason is required before cancelling this order.',
        SHIFT_REQUIRED: 'No active shift. Open a shift first, then retry.',
        INVALID_CUSTOMER_REFERENCE: 'Customer data is missing or was not saved. Select/save the customer, then resend the order.',
        INVALID_BRANCH_REFERENCE: 'Selected branch does not exist or is unavailable. Refresh and select the correct branch.',
        INVALID_SHIFT_REFERENCE: 'The order shift is missing or no longer valid. Open or refresh the active shift, then retry.',
        INVALID_SHIFT_BRANCH: 'The active shift belongs to a different branch. Refresh or open a shift for the current branch.',
        SHIFT_CLOSED: 'The selected shift is closed. Open a new shift, then resend the order.',
        INVALID_REFERENCE: 'One selected record is missing. Refresh, review the order data, then retry.',
        INVALID_MENU_ITEM: 'One cart item is not linked to an existing menu item. Remove it and add it again from the menu.',
        INSUFFICIENT_INVENTORY: 'Not enough recipe stock to save this order. Review item ingredients stock or choose another item.',
        DUPLICATE_RECORD: 'This record already exists. Refresh the page and retry.',
        DATABASE_QUERY_FAILED: 'The order could not be saved because related data is inconsistent. Review customer, branch, and shift.',
        RECORD_HAS_LINKED_DATA: 'This record is linked to operational data. Archive or deactivate it instead of deleting.',
        ORDER_CREATE_FAILED: 'The order could not be saved. Review customer, branch, and shift, then retry.',
        IDEMPOTENCY_KEY_PAYLOAD_CONFLICT: 'Same request key used with different payload. Review and retry.',
        IDEMPOTENCY_KEY_IN_PROGRESS: 'Same request is still processing. Wait and refresh.',
        TOO_MANY_LOGIN_ATTEMPTS: 'Too many attempts. Please wait and retry.',
        UNSUPPORTED_REPORT_EXPORT: 'CSV/Excel export is not available for this report. Use PDF or print.',
        VALIDATION_ERROR: 'Some fields are invalid. Please review your input.',
    };
    const mapped = (lang === 'ar' ? mapAr : mapEn)[code];
    if (code === 'VALIDATION_ERROR' && Array.isArray(error?.details) && error.details.length > 0) {
        const details = error.details
            .map((detail: any) => [detail?.field, detail?.message].filter(Boolean).join(': '))
            .filter(Boolean)
            .join('; ');
        if (details) return lang === 'ar' ? `بيانات غير صحيحة: ${details}` : `Invalid fields: ${details}`;
    }
    if (mapped) return mapped;
    return error?.message || fallback;
};

const getAuthToken = () => {
    try {
        return localStorage.getItem('auth_token');
    } catch {
        return null;
    }
};

const getRefreshToken = () => {
    try {
        return localStorage.getItem('auth_refresh_token');
    } catch {
        return null;
    }
};

const setAuthToken = (token: string) => {
    try { localStorage.setItem('auth_token', token); } catch { /* */ }
};

const handleUnauthorizedToken = (endpoint: string) => {
    if (endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/mfa') || endpoint.startsWith('/auth/refresh') || endpoint.startsWith('/setup/')) return;
    const hadSession = Boolean(getAuthToken() || getRefreshToken());
    if (!hadSession) return;
    try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
    } catch {
        // ignore storage errors
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('coduiszen:auth-invalid', { detail: { endpoint } }));
    }
};

const canAttemptTokenRefresh = (endpoint: string) => ![
    '/auth/login',
    '/auth/pin-login',
    '/auth/mfa',
    '/auth/refresh',
].some((path) => endpoint.startsWith(path));

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

const tryRefreshToken = async (): Promise<string | null> => {
    if (isRefreshing && refreshPromise) return refreshPromise;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (data.token) {
                setAuthToken(data.token);
                return data.token as string;
            }
            return null;
        } catch {
            return null;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    const authToken = getAuthToken();
    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ code: `HTTP_${response.status}`, message: 'Request failed' }));

            if (response.status === 401 && canAttemptTokenRefresh(endpoint)) {
                const newToken = await tryRefreshToken();
                if (newToken) {
                    const retryResponse = await fetch(url, {
                        ...options,
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${newToken}`,
                            ...options.headers,
                        },
                    });
                    if (retryResponse.ok) {
                        return await retryResponse.json();
                    }
                }
                handleUnauthorizedToken(endpoint);
            }

            const err = toAppApiError(error, response.status, endpoint);
            if (response.status === 401 && endpoint === '/auth/me') {
                err.silent = true;
            }
            if (endpoint === '/health') {
                err.silent = true;
            }
            throw err;
        }

        return await response.json();
    } catch (error: any) {
        throw error;
    }
}

export async function apiRequestBlob(
    endpoint: string,
    options: RequestInit = {},
): Promise<Blob> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const authToken = getAuthToken();
    const config: RequestInit = {
        ...options,
        headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...options.headers,
        },
    };
    const response = await fetch(url, config);
    if (!response.ok) {
        const text = await response.text().catch(() => 'Request failed');
        throw toAppApiError({ message: text || 'Request failed' }, response.status, endpoint);
    }
    return response.blob();
}

export const checkHealth = async () => {
    try {
        return await apiRequest<{ status: string; timestamp: string; database?: string }>('/health');
    } catch {
        return { status: 'down', timestamp: new Date().toISOString() };
    }
};
