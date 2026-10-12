import { describe, expect, test, vi } from 'vitest';
import { mapConnectionUpdate, reconnectDelay } from '../server/services/whatsappConnection';

vi.mock('@whiskeysockets/baileys', () => ({
  default: () => ({ ev: { on() {} } }),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] as any }),
  useMultiFileAuthState: async () => ({ state: {}, saveCreds() {} }),
}));
vi.mock('../server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/db')>();
  return { ...actual };
});
vi.mock('../server/socket', () => ({ getIO: () => ({ emit() {} }) }));

import {
  isOptedOut,
  isStopOptOut,
  mapReceiptToStatus,
  normalizeBaileysInbound,
  noteOptOut,
  shouldRequeueAfterFailure,
  shouldSkipQueuedMessage,
} from '../server/services/whatsappService';

describe('whatsapp baileys connection mapping', () => {
  test('close 401 maps to AUTH_ERROR needing fresh QR', () => {
    expect(mapConnectionUpdate({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } }).status).toBe('AUTH_ERROR');
  });

  test('open maps to READY', () => {
    expect(mapConnectionUpdate({ connection: 'open' }).status).toBe('READY');
  });

  test('connecting maps to INITIALIZING, AUTHENTICATED after scan accepted', () => {
    expect(mapConnectionUpdate({ connection: 'connecting' }).status).toBe('INITIALIZING');
    expect(mapConnectionUpdate({ connection: 'connecting' }, { qrScanned: true }).status).toBe('AUTHENTICATED');
  });

  test('close 408/515 maps to retryable DISCONNECTED', () => {
    expect(mapConnectionUpdate({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } }).status).toBe('DISCONNECTED');
    expect(mapConnectionUpdate({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } }).status).toBe('DISCONNECTED');
  });

  test('qr update maps to AWAITING_SCAN', () => {
    expect(mapConnectionUpdate({ qr: 'test-qr' }).status).toBe('AWAITING_SCAN');
  });

  test('reconnect backoff never below 5s', () => {
    expect(reconnectDelay(0)).toBeGreaterThanOrEqual(5000);
  });

  test('reconnect backoff caps at 60s', () => {
    expect(reconnectDelay(1)).toBe(15000);
    expect(reconnectDelay(99)).toBe(60000);
  });
});

describe('whatsapp baileys task 3: incoming, receipts, STOP', () => {
  test('STOP skips queued marketing to that number', () => {
    expect(isStopOptOut('STOP')).toBe(true);
    expect(isStopOptOut('stop please')).toBe(true);
    expect(isStopOptOut('إيقاف')).toBe(true);
    expect(isStopOptOut('الغاء الاشتراك')).toBe(true);
    expect(isStopOptOut('hello, I want to order pizza')).toBe(false);
    const phone = '201011100001';
    expect(isOptedOut(phone)).toBe(false);
    noteOptOut(phone);
    expect(isOptedOut(phone)).toBe(true);
    expect(shouldSkipQueuedMessage({ to: phone, text: 'offer', isMarketing: true })).toBe(true);
    expect(shouldSkipQueuedMessage({ to: phone, text: 'your OTP is 1234' })).toBe(false);
    expect(shouldSkipQueuedMessage({ to: '2010999888777', text: 'offer', isMarketing: true })).toBe(false);
  });

  test('receipt ack maps to READ status update', () => {
    expect(mapReceiptToStatus({ readTimestamp: 1728660000 })).toBe('READ');
    expect(mapReceiptToStatus({ receiptTimestamp: 1728660000 })).toBe('DELIVERED');
    expect(mapReceiptToStatus({})).toBeNull();
    expect(mapReceiptToStatus(null)).toBeNull();
  });

  test('failed send requeues once then marks FAILED', () => {
    expect(shouldRequeueAfterFailure({ to: '201011100002', text: 'hi' })).toBe(true);
    expect(shouldRequeueAfterFailure({ to: '201011100002', text: 'hi', _retried: true })).toBe(false);
  });

  test('group and broadcast upserts are dropped, domain stripped', () => {
    expect(normalizeBaileysInbound({ key: { remoteJid: '120363012345@g.us', id: 'g1' } })).toBeNull();
    expect(normalizeBaileysInbound({ key: { remoteJid: 'status@broadcast', id: 's1' } })).toBeNull();
    const inbound = normalizeBaileysInbound({
      key: { remoteJid: '201011100003@s.whatsapp.net', id: 'm1' },
      message: { conversation: 'menu' },
    });
    expect(inbound).toMatchObject({ from: '201011100003', body: 'menu', hasMedia: false, id: 'm1' });
  });
});
