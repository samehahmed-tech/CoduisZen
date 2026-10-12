import { describe, expect, test } from 'vitest';
import { mapConnectionUpdate, reconnectDelay } from '../server/services/whatsappConnection';

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
