import { describe, expect, test, vi } from 'vitest';
import { mapConnectionUpdate, reconnectDelay } from '../server/services/whatsappConnection';

vi.mock('@whiskeysockets/baileys', () => ({
  default: () => ({
    ev: {
      on(e: string, h: (...a: any[]) => void) {
        const g = globalThis as any;
        (g.__baileysEv ??= {});
        (g.__baileysEv[e] ??= []).push(h);
      },
    },
  }),
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
  whatsappService,
} from '../server/services/whatsappService';
import { db } from '../server/db';
import { customers, whatsappMessages } from '../src/db/schema';

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
    expect(isStopOptOut('STOP!')).toBe(true);
    expect(isStopOptOut('nonstop music please')).toBe(false);
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
    expect(mapReceiptToStatus({ receipt: { readTimestamp: 1728660000 } })).toBe('READ');
    expect(mapReceiptToStatus([{ receiptTimestamp: 1728660000 }])).toBe('DELIVERED');
    expect(mapReceiptToStatus([{ receipt: { readTimestamp: 1728660000 } }])).toBe('READ');
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

describe('whatsapp baileys task 3 fix round 1: wiring', () => {
  const mockDbUpdate = () => {
    const calls: { table: unknown; set: unknown }[] = [];
    const spy = vi.spyOn(db, 'update').mockImplementation(((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          calls.push({ table, set: values });
          return [];
        },
      }),
    })) as any);
    return { calls, restore: () => spy.mockRestore() };
  };

  test('STOP inbound purges queued marketing and persists opt-out', async () => {
    const { calls, restore } = mockDbUpdate();
    try {
      const phone = '201077700001';
      const before = whatsappService.getQueueCount();
      whatsappService.enqueueMessage({ to: phone, text: 'sale offer', isMarketing: true });
      whatsappService.enqueueMessage({ to: phone, text: 'order confirmed' });
      await whatsappService.handleIncomingWebhookMessage({ from: phone, body: 'STOP' });
      expect(isOptedOut(phone)).toBe(true);
      // Marketing purged (-1), STOP confirmation enqueued (+1): net before + 2.
      expect(whatsappService.getQueueCount()).toBe(before + 2);
      const persisted = calls.filter((c) => c.table === customers);
      expect(persisted.length).toBeGreaterThan(0);
      expect(persisted[0]!.set).toMatchObject({ marketingOptIn: false });
    } finally {
      restore();
    }
  });

  test('receipt listener updates message status and warns on unknown shape', async () => {
    await vi.waitFor(() => {
      const handlers = (globalThis as any).__baileysEv?.['message-receipt.update'];
      if (!handlers?.length) throw new Error('receipt listener not registered yet');
    });
    const handler = (globalThis as any).__baileysEv['message-receipt.update'][0];
    const { calls, restore } = mockDbUpdate();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await handler([{ key: { id: 'ext-1' }, receipt: { readTimestamp: 1728660000 } }]);
      const receiptWrites = calls.filter((c) => c.table === whatsappMessages);
      expect(receiptWrites.length).toBe(1);
      expect(receiptWrites[0]!.set).toMatchObject({ status: 'READ' });
      expect((receiptWrites[0]!.set as any).readAt).toBeInstanceOf(Date);

      const writesBefore = calls.length;
      await handler([{ key: { id: 'ext-2' }, receipt: {} }]);
      expect(calls.length).toBe(writesBefore);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unmapped shape'),
        expect.anything(),
      );
    } finally {
      restore();
      warnSpy.mockRestore();
    }
  });
});
