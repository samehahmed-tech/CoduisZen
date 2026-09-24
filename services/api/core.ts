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
        DATABASE_UNAVAILABLE: 'السيرفر بيعيد الاتصال بقاعدة البيانات. استنى ثوانٍ وهتتحمل البيانات لوحدها.',
        REQUEST_TIMEOUT: 'الطلب أخد وقت أطول من اللازم. حاول مرة أخرى.',
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
        BRANCH_MISMATCH: 'الفرع المختار لا يطابق الفرع المسموح به لحسابك. تم تصحيح الفرع، حاول فتح الشيفت مرة أخرى.',
        BRANCH_NOT_ASSIGNED: 'حسابك غير مرتبط بأي فرع. اربط المستخدم بفرع ثم أعد المحاولة.',
        BRANCH_ID_REQUIRED: 'يجب اختيار فرع قبل فتح الشيفت.',
        USER_ID_REQUIRED: 'تعذر تحديد المستخدم الحالي. أعد تسجيل الدخول ثم حاول مرة أخرى.',
        CANCELLATION_REASON_REQUIRED: 'سبب الإلغاء مطلوب قبل إلغاء الطلب.',
        SHIFT_REQUIRED: 'لا يوجد شيفت مفتوح. افتح شيفت أولاً ثم أعد المحاولة.',
        IDEMPOTENCY_KEY_PAYLOAD_CONFLICT: 'تم إرسال نفس العملية ببيانات مختلفة. راجع الطلب وأعد الإرسال.',
        IDEMPOTENCY_KEY_IN_PROGRESS: 'جاري تنفيذ نفس العملية بالفعل. انتظر لحظات ثم حدّث الشاشة.',
        TOO_MANY_LOGIN_ATTEMPTS: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
        UNSUPPORTED_REPORT_EXPORT: 'تصدير CSV/Excel غير متاح لهذا التقرير. استخدم PDF أو الطباعة.',
        VALIDATION_ERROR: 'بعض البيانات غير صحيحة. راجع المدخلات.',
        ACCOUNT_CODE_AND_NAME_REQUIRED: 'لازم تكتب كود الحساب (3 أرقام على الأقل) واسم الحساب.',
        ACCOUNT_NAME_REQUIRED: 'اسم الحساب مطلوب.',
        ACCOUNT_CODE_INVALID: 'كود الحساب لازم يكون أرقام من 3 لـ 12 خانة.',
        ACCOUNT_TYPE_INVALID: 'نوع الحساب غير صحيح.',
        ACCOUNT_CODE_ALREADY_EXISTS: 'كود الحساب مستخدم بالفعل لحساب آخر.',
        ACCOUNT_HAS_CHILDREN_MOVE_OR_DEACTIVATE_CHILDREN_FIRST: 'انقل الحسابات الفرعية أو أرشفها أولًا قبل أرشفة الحساب الرئيسي.',
        PARENT_ACCOUNT_INACTIVE: 'الحساب الأب مؤرشف. اختر حسابًا نشطًا.',
        CHART_RESET_CONFIRMATION_REQUIRED: 'اكتب نص التأكيد الصحيح لبدء شجرة جديدة.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_POSTING_RULE: 'اختر حسابًا نشطًا لقاعدة الترحيل.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_PAYMENT_MAPPING: 'اختر حسابًا نشطًا لطريقة الدفع.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_TAX_MAPPING: 'اختر حسابًا نشطًا للحساب الضريبي.',
    };
    const mapEn: Record<string, string> = {
        DATABASE_UNAVAILABLE: 'The server is reconnecting to the database. Data will load automatically in a few seconds.',
        REQUEST_TIMEOUT: 'The request took too long. Please retry.',
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
        BRANCH_MISMATCH: 'Selected branch is outside your access scope. The branch was corrected; try opening the shift again.',
        BRANCH_NOT_ASSIGNED: 'Your account is not assigned to a branch. Assign a branch to the user and retry.',
        BRANCH_ID_REQUIRED: 'Select a branch before opening the shift.',
        USER_ID_REQUIRED: 'The current user could not be identified. Sign in again and retry.',
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
        ACCOUNT_CODE_AND_NAME_REQUIRED: 'Account code (at least 3 digits) and account name are required.',
        ACCOUNT_NAME_REQUIRED: 'Account name is required.',
        ACCOUNT_CODE_INVALID: 'Account code must be 3 to 12 digits.',
        ACCOUNT_TYPE_INVALID: 'Invalid account type.',
        ACCOUNT_CODE_ALREADY_EXISTS: 'This account code is already used by another account.',
        ACCOUNT_HAS_CHILDREN_MOVE_OR_DEACTIVATE_CHILDREN_FIRST: 'Move or archive the child accounts before archiving this parent account.',
        PARENT_ACCOUNT_INACTIVE: 'The selected parent account is archived. Choose an active account.',
        CHART_RESET_CONFIRMATION_REQUIRED: 'Enter the exact confirmation text to start a new chart.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_POSTING_RULE: 'Choose an active account for this posting rule.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_PAYMENT_MAPPING: 'Choose an active account for this payment method.',
        ACTIVE_ACCOUNT_REQUIRED_FOR_TAX_MAPPING: 'Choose an active account for this tax mapping.',
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

const handleUnauthorizedToken = (endpoint: string, code?: string) => {
    if (endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/mfa') || endpoint.startsWith('/auth/refresh') || endpoint.startsWith('/setup/')) return;
    const hadSession = Boolean(getAuthToken() || getRefreshToken());
    if (!hadSession) return;
    try {
        console.warn(`[auth] session invalid (${code || 'UNKNOWN'}) at ${endpoint} — logging out`);
    } catch {
        // logging must never break logout
    }
    try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
    } catch {
        // ignore storage errors
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('coduiszen:auth-invalid', { detail: { endpoint, code: code || 'UNKNOWN' } }));
    }
};

const canAttemptTokenRefresh = (endpoint: string) => ![
    '/auth/login',
    '/auth/pin-login',
    '/auth/mfa',
    '/auth/refresh',
].some((path) => endpoint.startsWith(path));

let isRefreshing = false;
let refreshPromise: Promise<RefreshOutcome> | null = null;

// Tiny request cache: absorbs duplicate GETs fired by page mount + shell refresh.
// Short TTL keeps operational screens fresh; every mutation clears it.
const GET_CACHE_TTL_MS = 1500;
const getCache = new Map<string, { expiresAt: number; value: unknown }>();
const getInflight = new Map<string, Promise<unknown>>();
export const clearApiCache = () => { getCache.clear(); };

// ── Resilience: the backend can restart/reconnect (DB pool, watchdog).
// GETs are safe to retry with backoff; mutations are never auto-retried.
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [600, 1800];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isNetworkFailure = (error: any) =>
    error instanceof TypeError
    || /failed to fetch|networkerror|load failed|err_connection|econn|etimedout|network request failed/i.test(String(error?.message || error || ''));
const isRetryableServiceError = (status: number, payload: any) =>
    RETRYABLE_STATUS.has(status)
    || String(payload?.code || payload?.error || '').toUpperCase() === 'DATABASE_UNAVAILABLE';

type RefreshOutcome =
    | { token: string; transient: false; code?: string }
    | { token: null; transient: boolean; code?: string };

// Refresh retry: the backend restarts briefly during hotfix apply / watchdog
// recovery. A 5xx or network failure here means "server is busy", NOT "session
// is dead" — so retry a couple of times, and only report a definitive failure
// (400/401 = bad or revoked token) as session-invalid. Returning transient
// keeps the cashier logged in; the request fails with a retryable error and
// the next poll succeeds once the server is back.
const REFRESH_RETRY_DELAYS_MS = [800, 2000];

const tryRefreshToken = async (): Promise<RefreshOutcome> => {
    if (isRefreshing && refreshPromise) return refreshPromise;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return { token: null, transient: false };

    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            for (let attempt = 0; ; attempt += 1) {
                let response: Response;
                try {
                    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken }),
                    });
                } catch (error) {
                    if (attempt < REFRESH_RETRY_DELAYS_MS.length && isNetworkFailure(error)) {
                        await sleep(REFRESH_RETRY_DELAYS_MS[attempt]);
                        continue;
                    }
                    return { token: null, transient: true };
                }
                if (response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (data?.token) {
                        setAuthToken(data.token);
                        primeProactiveRefresh(data.token);
                        return { token: data.token as string, transient: false };
                    }
                    return { token: null, transient: false, code: 'EMPTY_REFRESH_RESPONSE' };
                }
                // Definitive: the token itself is missing/invalid/expired/revoked.
                // Capture the server reason (SESSION_EXPIRED / INVALID_REFRESH_TOKEN /
                // USER_INACTIVE) so kick-outs are diagnosable instead of silent.
                if (response.status === 400 || response.status === 401) {
                    const body = await response.json().catch(() => null);
                    const code = String(body?.error || body?.code || `HTTP_${response.status}`);
                    try {
                        sessionStorage.setItem('coduiszen:auth-last-refresh', JSON.stringify({ code, at: Date.now() }));
                    } catch {
                        // diagnostics must never break auth
                    }
                    return { token: null, transient: false, code };
                }
                // Transient (5xx while restarting, 429, ...): back off and retry.
                if (attempt < REFRESH_RETRY_DELAYS_MS.length) {
                    await sleep(REFRESH_RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                return { token: null, transient: true };
            }
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

// ── Proactive refresh: renew the access token BEFORE it dies, so the app
// never hits the 401 → refresh → retry storm (and its console spam) in the
// first place. Single-flight tryRefreshToken dedupes overlapping triggers;
// failures here are silent by design — the normal request-time 401 path
// remains the single place that can ever log the user out.
const PROACTIVE_REFRESH_MARGIN_MS = 90_000;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

const getAccessTokenExpMs = (token: string | null): number => {
    try {
        if (!token) return 0;
        const part = token.split('.')[1];
        if (!part) return 0;
        const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        const exp = Number(payload?.exp);
        return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
    } catch {
        return 0;
    }
};

export const primeProactiveRefresh = (token?: string | null) => {
    try {
        if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
        if (typeof window === 'undefined') return;
        const expMs = getAccessTokenExpMs(token ?? getAuthToken());
        if (!expMs) return;
        const delay = expMs - Date.now() - PROACTIVE_REFRESH_MARGIN_MS;
        if (delay <= 0) {
            // Already inside the margin (woke from sleep, slow timer, ...):
            // refresh now instead of waiting for the next 401.
            void tryRefreshToken().catch(() => {});
            return;
        }
        proactiveTimer = setTimeout(() => {
            proactiveTimer = null;
            // Success re-primes from the fresh token (see tryRefreshToken);
            // failure stays silent — request-time 401 decides logout.
            void tryRefreshToken().catch(() => {});
        }, Math.min(delay, 2_147_483_647));
    } catch {
        // priming must never break requests
    }
};

const maybeProactiveRefresh = (endpoint: string) => {
    try {
        if (!canAttemptTokenRefresh(endpoint)) return;
        const expMs = getAccessTokenExpMs(getAuthToken());
        if (expMs && expMs - Date.now() < PROACTIVE_REFRESH_MARGIN_MS) {
            void tryRefreshToken().catch(() => {});
        }
    } catch {
        // never break requests
    }
};

if (typeof window !== 'undefined' && !(window as any).__coduiszenRefreshPrimer) {
    (window as any).__coduiszenRefreshPrimer = true;
    // Sleep/wake, locked PC, throttled tab: revalidate silently on return
    // instead of spraying 401s across every poller.
    document.addEventListener('visibilitychange', () => {
        try {
            if (document.hidden) return;
            const expMs = getAccessTokenExpMs(getAuthToken());
            if (expMs && expMs - Date.now() < PROACTIVE_REFRESH_MARGIN_MS) {
                void tryRefreshToken().catch(() => {});
            }
        } catch {
            // ignore
        }
    });
}

// ── Session heartbeat: the session must NEVER die while the user keeps the
// app open (a cashier may stare at an idle POS for hours waiting for an
// order — that is not "abandonment"). Every 10 minutes this silently renews
// the access token, which also slides the server session window forward, so
// expiresAt perpetually stays ~12h ahead. No-ops without stored tokens
// (login page, logged out) and never logs anyone out: failures stay silent,
// the request-time 401 path remains the sole logout decider. Hidden/minimized
// tabs still fire (throttled but well within the window).
const HEARTBEAT_MS = 10 * 60 * 1000;
if (typeof window !== 'undefined' && !(window as any).__coduiszenHeartbeat) {
    (window as any).__coduiszenHeartbeat = true;
    window.setInterval(() => {
        try {
            if (!getRefreshToken()) return;
            void tryRefreshToken().catch(() => {});
        } catch {
            // heartbeat must never break the app
        }
    }, HEARTBEAT_MS);
}

export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const method = String(options.method || 'GET').toUpperCase();
    // Renew ahead of expiry so this request (and every poller behind it)
    // rarely meets a dead access token at all.
    maybeProactiveRefresh(endpoint);
    const cacheable = method === 'GET' && options.cache !== 'no-store';
    const cacheKey = `${url}|${getAuthToken() || ''}`;
    if (cacheable) {
        const cached = getCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.value as T;
        const pending = getInflight.get(cacheKey);
        if (pending) return pending as Promise<T>;
    } else if (method !== 'GET') {
        clearApiCache();
    }

    const authToken = getAuthToken();
    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...options.headers,
        },
    };

    const requestPromise = (async () => {
      const attemptRequest = async (attempt: number): Promise<T> => {
      const timedOut = { value: false };
      const timeoutController = new AbortController();
      const callerSignal = (options as any)?.signal as AbortSignal | undefined;
      const timer = setTimeout(() => { timedOut.value = true; timeoutController.abort(); }, REQUEST_TIMEOUT_MS);
      if (callerSignal) {
          if (callerSignal.aborted) timeoutController.abort();
          else callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
      }
      try {
        let response = await fetch(url, { ...config, signal: timeoutController.signal });

        // A 304 carries no body — parsing it as JSON throws and wipes live
        // lists (mail inbox, badges). Re-request with no-cache so the server
        // must answer 200 with a real body instead of revalidating.
        if (response.status === 304 && method === 'GET') {
            const fresh = await fetch(url, {
                ...config,
                cache: 'no-store',
                headers: {
                    ...(config.headers as Record<string, string>),
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });
            if (fresh.ok && fresh.status !== 304) {
                response = fresh;
            } else {
                const cached = getCache.get(cacheKey);
                if (cached && cached.expiresAt > Date.now()) return cached.value as T;
                throw toAppApiError({ code: 'HTTP_304', message: 'Not modified' }, 304, endpoint);
            }
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ code: `HTTP_${response.status}`, message: 'Request failed' }));

            if (response.status === 401 && canAttemptTokenRefresh(endpoint)) {
                const outcome = await tryRefreshToken();
                if (outcome.token) {
                    const newToken = outcome.token;
                    const retryResponse = await fetch(url, {
                        ...options,
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${newToken}`,
                            ...options.headers,
                        },
                    });
                    if (retryResponse.ok) {
                        const retryValue = await retryResponse.json();
                        if (cacheable) getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: retryValue });
                        return retryValue as T;
                    }
                    // Refresh worked but retry still failed: only treat a
                    // second 401 as session-invalid. Any other status (403/500/...)
                    // must NOT log the cashier out mid-shift.
                    if (retryResponse.status !== 401) {
                        const retryError = await retryResponse.json().catch(() => ({ code: `HTTP_${retryResponse.status}`, message: 'Request failed' }));
                        throw toAppApiError(retryError, retryResponse.status, endpoint);
                    }
                    // Fresh token rejected: the session died between refresh
                    // and retry (concurrent revoke). Definitive logout.
                    const retryBody = await retryResponse.json().catch(() => null);
                    handleUnauthorizedToken(endpoint, String(retryBody?.error || retryBody?.code || 'SESSION_REVOKED'));
                    throw toAppApiError(retryBody || { code: 'HTTP_401', message: 'Request failed' }, 401, endpoint);
                } else if (outcome.transient) {
                    // Refresh failed because the server is restarting / busy
                    // (5xx, timeout, connection reset) — the session itself is
                    // NOT proven invalid. Keep tokens, fail retryably, and let
                    // the next poll succeed. Never log out here.
                    throw toAppApiError(
                        { code: 'DATABASE_UNAVAILABLE', message: 'Server is restarting. Please retry in a few seconds.' },
                        503,
                        endpoint,
                    );
                } else {
                    // Definitive refresh failure — log out exactly once,
                    // carrying the server reason (SESSION_EXPIRED /
                    // INVALID_REFRESH_TOKEN / USER_INACTIVE) for diagnosis
                    // and the login notice.
                    handleUnauthorizedToken(endpoint, outcome.code);
                }
            }

            // Backend restarting / DB reconnecting: back off and retry GETs
            // instead of failing every widget on the screen at once.
            if (method === 'GET' && attempt < RETRY_DELAYS_MS.length && isRetryableServiceError(response.status, error)) {
                await sleep(RETRY_DELAYS_MS[attempt]);
                return attemptRequest(attempt + 1);
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

        const value = await response.json();
        if (cacheable) getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value });
        return value as T;
      } catch (error: any) {
        // Aborted searches (typing fast in POS customer box) are normal —
        // never surface them and never trigger logout flows.
        if (error?.name === 'AbortError' || (options as any)?.signal?.aborted) {
            if (timedOut.value && !(options as any)?.signal?.aborted) {
                throw toAppApiError({ code: 'REQUEST_TIMEOUT', message: 'Request timed out. Please retry.' }, 408, endpoint);
            }
            const abortErr = new Error('Aborted') as AppApiError;
            abortErr.name = 'AbortError';
            abortErr.silent = true;
            abortErr.endpoint = endpoint;
            throw abortErr;
        }
        // Offline / connection refused / reset while the server restarts:
        // retry GETs with backoff. Mutations are never auto-retried.
        if (method === 'GET' && attempt < RETRY_DELAYS_MS.length && isNetworkFailure(error)) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            return attemptRequest(attempt + 1);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      };
      try {
        return await attemptRequest(0);
      } catch (error: any) {
        throw error;
      }
    })();
    if (cacheable) {
        getInflight.set(cacheKey, requestPromise);
        requestPromise.finally(() => getInflight.delete(cacheKey)).catch(() => {});
    }
    return requestPromise;
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
