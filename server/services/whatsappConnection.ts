export type BaileysConnectionState = 'open' | 'close' | 'connecting';

export type ConnectionUpdateInput = {
  connection?: BaileysConnectionState;
  lastDisconnect?: { error?: any } | null;
  qr?: string;
};

export type MappedConnection = {
  status: 'INITIALIZING' | 'AWAITING_SCAN' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED' | 'AUTH_ERROR';
  reason?: string;
  qr?: string;
};

const getStatusCode = (error: any): number | undefined => {
  if (error == null) return undefined;
  if (typeof error?.output?.statusCode === 'number') return error.output.statusCode;
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.statusCode === 'number') return error.statusCode;
  return undefined;
};

const getMessage = (error: any): string | undefined => {
  const msg = error?.message || error?.output?.payload?.message;
  return typeof msg === 'string' && msg.length > 0 ? msg : undefined;
};

// Pure mapping of Baileys connection.update onto existing WhatsAppStatus union.
// qrScanned flag = phone accepted scan but socket not open yet (AUTHENTICATED linking state).
export const mapConnectionUpdate = (
  update: ConnectionUpdateInput,
  opts: { qrScanned?: boolean } = {},
): MappedConnection => {
  if (update.qr) {
    return { status: 'AWAITING_SCAN', qr: update.qr };
  }
  if (update.connection === 'open') {
    return { status: 'READY' };
  }
  if (update.connection === 'connecting') {
    return { status: opts.qrScanned ? 'AUTHENTICATED' : 'INITIALIZING' };
  }
  if (update.connection === 'close') {
    const error = update.lastDisconnect?.error;
    const code = getStatusCode(error);
    const reason = getMessage(error);
    if (code === 401) {
      return { status: 'AUTH_ERROR', ...(reason ? { reason } : {}) };
    }
    return { status: 'DISCONNECTED', ...(reason ?? code ? { reason: reason || `disconnect-${code}` } : {}) };
  }
  return { status: 'DISCONNECTED' };
};

// Backoff caps: 5s / 15s / 60s. Pins no-tight-loop reconnect.
export const reconnectDelay = (attempt: number): number => {
  const steps = [5000, 15000, 60000];
  const index = Math.min(Math.max(0, Math.floor(attempt)), steps.length - 1);
  return Math.max(5000, steps[index]!);
};
