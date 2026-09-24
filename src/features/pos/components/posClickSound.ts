/* POS click sound — polished WebAudio micro-chimes, no asset files needed.
   Change anytime: localStorage 'pos-click-sound' = pop | tick | glass | soft | off
   (a settings UI can call setClickPreset). Mute flag: 'pos-click-muted' = 1.
   Engine: shared master (gain + soft compressor + gentle lowpass) so rapid
   cashier taps glue together instead of stacking harshly. Every preset layers
   a tactile 12ms "tap" transient + a round musical body with exponential
   decay, plus tiny humanisation (pitch/volume jitter) to avoid fatigue. */

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
    // Juicy-but-soft bubble: cuts through a busy floor without the old
    // glassy harshness during long cashier shifts.
    return 'pop';
}

export function setClickPreset(preset: PosClickPreset) {
    try {
        localStorage.setItem(PRESET_KEY, preset);
        localStorage.setItem(MUTE_KEY, preset === 'off' ? '1' : '0');
    } catch { /* noop */ }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastPlay = 0;

function audio(): AudioContext | null {
    try {
        if (typeof window === 'undefined') return null;
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        if (!ctx) {
            ctx = new AC();
            // Shared bus: tames stacking when the cashier taps fast.
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -18;
            comp.knee.value = 18;
            comp.ratio.value = 5;
            comp.attack.value = 0.002;
            comp.release.value = 0.12;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 7500;
            lp.Q.value = 0.4;
            master = ctx.createGain();
            master.gain.value = 0.55;
            master.connect(lp);
            lp.connect(comp);
            comp.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

/** Tiny humanisation so 200 taps/shift never sound robotic. */
function humanize(base: number, cents = 18): number {
    return base * Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);
}

interface ToneOpts {
    f0: number;
    f1?: number;
    dur: number;
    type: OscillatorType;
    vol: number;
    delay?: number;
    attack?: number;
}

/** Round pluck: fast soft attack, exponential decay to silence. */
function tone({ f0, f1, dur, type, vol, delay = 0, attack = 0.006 }: ToneOpts) {
    const ac = audio();
    if (!ac || !master) return;
    try {
        const t0 = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        const freq = humanize(f0);
        osc.frequency.setValueAtTime(Math.max(freq, 1), t0);
        if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(humanize(f1), 1), t0 + dur);
        const peak = vol * (0.92 + Math.random() * 0.16);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
    } catch { /* noop */ }
}

/** 12ms tactile "tap" so presses feel physical even at low volume. */
function tapTransient(vol: number, delay = 0, hp = 1800) {
    const ac = audio();
    if (!ac || !master) return;
    try {
        const t0 = ac.currentTime + delay;
        const len = Math.max(1, Math.floor(ac.sampleRate * 0.014));
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const env = 1 - i / len;
            data[i] = (Math.random() * 2 - 1) * env * env;
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = hp;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
        src.connect(filter).connect(gain).connect(master);
        src.start(t0);
    } catch { /* noop */ }
}

/** Play the configured click. Safe to call on every add/remove tap. */
export function playPosClick() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastPlay < 28) return; // let the previous chime breathe
    lastPlay = now;
    const preset = getClickPreset();
    switch (preset) {
        case 'pop':
            // Juicy bubble: round sine body gliding up + airy octave + tap.
            tapTransient(0.16);
            tone({ f0: 430, f1: 780, dur: 0.11, type: 'sine', vol: 0.5 });
            tone({ f0: 860, f1: 1290, dur: 0.08, type: 'triangle', vol: 0.14, delay: 0.012 });
            break;
        case 'tick':
            // Precision tick: short, bright, never harsh (no square wave).
            tapTransient(0.2, 0, 2600);
            tone({ f0: 2150, f1: 1720, dur: 0.035, type: 'triangle', vol: 0.16 });
            break;
        case 'glass':
            // Marimba-like chime: E6 body + 3rd harmonic shimmer + B6 answer.
            tapTransient(0.1, 0, 3200);
            tone({ f0: 1318, dur: 0.26, type: 'sine', vol: 0.34, attack: 0.004 });
            tone({ f0: 3954, dur: 0.14, type: 'sine', vol: 0.06, delay: 0.004 });
            tone({ f0: 1975, dur: 0.22, type: 'sine', vol: 0.16, delay: 0.05 });
            break;
        case 'soft':
            // Warm wooden thump for night mode / quiet floors.
            tapTransient(0.08, 0, 1200);
            tone({ f0: 330, f1: 235, dur: 0.14, type: 'sine', vol: 0.42 });
            tone({ f0: 660, f1: 520, dur: 0.09, type: 'triangle', vol: 0.08, delay: 0.008 });
            break;
        case 'off':
            break;
    }
}
