import { describe, expect, it, vi } from 'vitest';
import { reconcileKdsPolling } from '../src/utils/kdsPolling';

describe('KDS disconnected polling', () => {
    it('starts once while disconnected and stops on reconnect', () => {
        const start = vi.fn(() => 42);
        const stop = vi.fn();

        let timer = reconcileKdsPolling(false, null, start, stop);
        timer = reconcileKdsPolling(false, timer, start, stop);

        expect(start).toHaveBeenCalledTimes(1);
        expect(stop).not.toHaveBeenCalled();

        timer = reconcileKdsPolling(true, timer, start, stop);
        expect(stop).toHaveBeenCalledWith(42);
        expect(timer).toBeNull();
    });
});
