/* POS click sound — tiny WebAudio blips, no asset files needed.
   Change anytime: localStorage 'pos-click-sound' = pop | tick | glass | soft | off
   (a settings UI can call setClickPreset). Mute flag: 'pos-click-muted' = 1. */

export type PosClickPreset = 'pop' | 'tick' | 'glass' | 'soft' | 'off';

const PRESET_KEY = 'pos-click-sound';
const MUTE_KEY = 'pos-click-muted';

export const POS_CLICK_PRESETS: { id: Exclude<PosClickPreset, 'off'>; labelAr: string; labelEn: string }[] = [
    { id: 'pop', labelAr: 'بوب', labelEn: 'Pop' },
    { id: 'tick', labelAr: 'تيك', labelEn: 'Tick' },
    { id: 'glass', labelAr: 'زجاجي', labelEn: 'Glass' },
    { id: 'soft', labelAr: 'ناعم', labelEn: 'Soft' },
];

export function getClickPreset(): PosClickPreset {
    try {
        const v = localStorage.getItem(PRESET_KEY);
        if (v === 'pop' || v === 'tick' || v === 'glass' || v === 'soft' || v === 'off') return v;
        if (localStorage.getItem(MUTE_KEY) === '1') return 'off';
    } catch { /* noop */ }
    // A short glassy two-note chime is easier on the ear during long cashier shifts
    // and still cuts through a busy POS floor.
    return 'glass';
}

export function setClickPreset(preset: PosClickPreset) {
    try {
        localStorage.setItem(PRESET_KEY, preset);
        localStorage.setItem(MUTE_KEY, preset === 'off' ? '1' : '0');
    } catch { /* noop */ }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
    try {
        if (typeof window === 'undefined') return null;
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

function blip(freqFrom: number, freqTo: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ac = audio();
    if (!ac) return;
    try {
        const t0 = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqFrom, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    } catch { /* noop */ }
}

/** Play the configured click. Safe to call on every add/remove tap. */
export function playPosClick() {
    const preset = getClickPreset();
    switch (preset) {
        case 'pop':
            blip(520, 940, 0.08, 'triangle', 0.25);
            break;
        case 'tick':
            blip(1500, 1100, 0.035, 'square', 0.08);
            break;
        case 'glass':
            blip(1320, 1980, 0.12, 'sine', 0.22);
            blip(1980, 2640, 0.1, 'sine', 0.1, 0.03);
            break;
        case 'soft':
            blip(480, 420, 0.09, 'sine', 0.18);
            break;
        case 'off':
            break;
    }
}
