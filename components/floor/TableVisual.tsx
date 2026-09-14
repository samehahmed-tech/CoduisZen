import React, { useMemo } from 'react';
import { Crown } from 'lucide-react';

export type TableShapeKind = 'square' | 'round' | 'rectangle' | 'oval' | 'booth' | 'bar' | 'circle';

interface TableVisualProps {
  shape: string;
  seats: number;
  name: string | number;
  selected?: boolean;
  isVIP?: boolean;
  status?: string;
  showChairs?: boolean;
  compact?: boolean;
}

const chairBase =
  'absolute rounded-[5px] border shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-colors';

function chairColor(selected?: boolean, isVIP?: boolean) {
  if (selected) return 'bg-indigo-500 border-indigo-200';
  if (isVIP) return 'bg-amber-700 border-amber-200/70';
  return 'bg-slate-600 border-slate-300/40 dark:bg-slate-500';
}

function distributeRound(count: number, radiusX: number, radiusY: number) {
  const n = Math.max(1, Math.min(12, count));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      left: `${50 + Math.cos(a) * radiusX}%`,
      top: `${50 + Math.sin(a) * radiusY}%`,
      rotate: `${(a * 180) / Math.PI + 90}deg`,
    };
  });
}

function distributeSides(count: number) {
  // top, right, bottom, left round-robin
  const n = Math.max(1, Math.min(12, count));
  const perSide: Record<string, number[]> = { top: [], right: [], bottom: [], left: [] };
  const order = ['top', 'right', 'bottom', 'left'];
  for (let i = 0; i < n; i++) perSide[order[i % 4]].push(i);
  const positions: { side: string; frac: number; index: number }[] = [];
  (Object.keys(perSide) as Array<keyof typeof perSide>).forEach((side) => {
    const list = perSide[side];
    list.forEach((idx, k) => {
      positions.push({ side, frac: list.length === 1 ? 0.5 : (k + 1) / (list.length + 1), index: idx });
    });
  });
  return positions.sort((a, b) => a.index - b.index);
}

const TableVisual: React.FC<TableVisualProps> = ({
  shape,
  seats,
  name,
  selected,
  isVIP,
  showChairs = true,
  compact = false,
}) => {
  const kind = (shape === 'circle' ? 'round' : shape || 'square') as TableShapeKind;
  const seatCount = Math.max(1, Math.min(12, seats || 4));

  const chairs = useMemo(() => {
    if (kind === 'round' || kind === 'oval') return distributeRound(seatCount, kind === 'oval' ? 44 : 40, 42);
    if (kind === 'booth') return [] as any[];
    if (kind === 'bar') {
      const n = Math.max(1, Math.min(8, seatCount));
      return Array.from({ length: n }, (_, i) => ({
        left: `${n === 1 ? 50 : 8 + (i * 84) / (n - 1)}%`,
        top: '88%',
        rotate: '0deg',
      }));
    }
    // square / rectangle -> sides
    return distributeSides(seatCount);
  }, [kind, seatCount]);

  const topStyle: React.CSSProperties = useMemo(() => {
    const vipGlow = isVIP
      ? { boxShadow: '0 10px 28px rgba(217,119,6,0.35), inset 0 2px 6px rgba(255,255,255,0.5)' }
      : { boxShadow: '0 10px 24px rgba(0,0,0,0.28), inset 0 2px 5px rgba(255,255,255,0.45), inset 0 -3px 8px rgba(0,0,0,0.25)' };
    return vipGlow;
  }, [isVIP]);

  const woodBg = isVIP
    ? 'linear-gradient(135deg,#fef3c7 0%,#f59e0b 22%,#b45309 55%,#78350f 100%)'
    : 'linear-gradient(135deg,#d6a86c 0%,#a9763f 30%,#7c4f26 62%,#5b3a1c 100%)';

  const renderChairsSides = () =>
    (chairs as { side: string; frac: number }[]).map((c, i) => {
      const s = compact ? 'w-3.5 h-2.5' : 'w-6 h-4';
      const pos: React.CSSProperties =
        c.side === 'top'
          ? { left: `${c.frac * 100}%`, top: '-4%', transform: 'translate(-50%,-100%)' }
          : c.side === 'bottom'
            ? { left: `${c.frac * 100}%`, bottom: '-4%', transform: 'translate(-50%,100%)' }
            : c.side === 'left'
              ? { left: '-5%', top: `${c.frac * 100}%`, transform: 'translate(-100%,-50%) rotate(-90deg)' }
              : { right: '-5%', top: `${c.frac * 100}%`, transform: 'translate(100%,-50%) rotate(90deg)' };
      return <div key={i} className={`${chairBase} ${s} ${chairColor(selected, isVIP)}`} style={pos} />;
    });

  const renderChairsRound = () =>
    (chairs as { left: string; top: string; rotate: string }[]).map((c, i) => (
      <div
        key={i}
        className={`${chairBase} ${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} ${chairColor(selected, isVIP)}`}
        style={{ left: c.left, top: c.top, transform: `translate(-50%,-50%) rotate(${c.rotate})`, borderRadius: kind === 'round' ? 6 : 5 }}
      />
    ));

  const plaque = (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div
        className={`${compact ? 'min-w-6 px-1 py-0.5 text-[10px]' : 'min-w-9 px-2 py-1 text-sm'} rounded-full font-black tracking-wide border-2 shadow-lg ${
          selected
            ? 'bg-indigo-600 text-white border-white'
            : isVIP
              ? 'bg-amber-950 text-amber-200 border-amber-300'
              : 'bg-white/95 text-slate-800 border-slate-900/10 dark:bg-slate-900/95 dark:text-white dark:border-white/20'
        }`}
      >
        {name}
      </div>
      {!compact && (
        <div
          className={`mt-1 rounded-full px-1.5 text-[9px] font-black ${
            selected ? 'bg-indigo-600/90 text-white' : 'bg-black/55 text-white'
          }`}
        >
          {seatCount} 👤
        </div>
      )}
    </div>
  );

  const plates = (kind === 'round' || kind === 'oval') && !compact && (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        className="rounded-full border border-white/50 bg-white/15"
        style={{ width: '44%', height: kind === 'oval' ? '34%' : '44%', boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.4)' }}
      />
    </div>
  );

  const runner =
    (kind === 'rectangle' || kind === 'bar' || kind === 'square') && !compact ? (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className={`${kind === 'bar' ? 'w-[86%] h-[22%]' : kind === 'rectangle' ? 'w-[80%] h-[26%]' : 'w-[56%] h-[56%] rounded-xl'} bg-white/20 border border-white/30 backdrop-blur-[1px]`}
          style={{ borderRadius: kind === 'square' ? 10 : 999 }}
        />
      </div>
    ) : null;

  if (kind === 'booth') {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {/* benches */}
        <div className="absolute top-[6%] left-[12%] right-[12%] h-[22%] rounded-xl bg-gradient-to-b from-rose-800 to-rose-950 border border-rose-300/30 shadow-lg" />
        <div className="absolute bottom-[6%] left-[12%] right-[12%] h-[22%] rounded-xl bg-gradient-to-b from-rose-800 to-rose-950 border border-rose-300/30 shadow-lg" />
        {/* table */}
        <div
          className={`relative ${compact ? 'w-[62%] h-[30%]' : 'w-[64%] h-[32%]'} rounded-lg border-2 overflow-hidden`}
          style={{ background: woodBg, ...topStyle, borderColor: selected ? '#6366f1' : isVIP ? '#fbbf24' : 'rgba(0,0,0,0.3)' }}
        >
          {runner}
          {plaque}
        </div>
        {isVIP && !compact && (
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center text-white border-2 border-white shadow">
            <Crown size={12} />
          </div>
        )}
      </div>
    );
  }

  if (kind === 'bar') {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {showChairs && renderChairsRound()}
        <div
          className="relative w-[84%] h-[38%] overflow-hidden border-2"
          style={{ background: woodBg, ...topStyle, borderRadius: 999, borderColor: selected ? '#6366f1' : isVIP ? '#fbbf24' : 'rgba(0,0,0,0.3)' }}
        >
          {/* beer taps hint */}
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'repeating-linear-gradient(90deg,transparent 0 18px,rgba(255,255,255,0.35) 18px 20px)' }} />
          {plaque}
        </div>
      </div>
    );
  }

  const isRound = kind === 'round';
  const isOval = kind === 'oval';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {showChairs && (isRound || isOval ? renderChairsRound() : renderChairsSides())}
      <div
        className="relative overflow-hidden border-2"
        style={{
          width: kind === 'rectangle' ? '68%' : isOval ? '58%' : '56%',
          height: kind === 'rectangle' ? '46%' : isOval ? '52%' : isRound ? '62%' : '58%',
          background: woodBg,
          borderRadius: isRound ? '50%' : isOval ? '50%' : kind === 'rectangle' ? 14 : 16,
          borderColor: selected ? '#6366f1' : isVIP ? '#fbbf24' : 'rgba(0,0,0,0.32)',
          ...topStyle,
          outline: selected ? '3px solid rgba(99,102,241,0.45)' : undefined,
          outlineOffset: 2,
        }}
      >
        {/* wood grain lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            background: isRound || isOval
              ? 'repeating-radial-gradient(circle at 50% 50%, transparent 0 8px, rgba(0,0,0,0.35) 8px 9px)'
              : 'repeating-linear-gradient(0deg, transparent 0 10px, rgba(0,0,0,0.22) 10px 11px)',
          }}
        />
        {/* glossy highlight */}
        <div className="absolute left-[12%] right-[12%] top-[8%] h-[22%] rounded-full bg-white/30 blur-[2px] pointer-events-none" />
        {plates}
        {runner}
        {plaque}
      </div>
    </div>
  );
};

export default TableVisual;
