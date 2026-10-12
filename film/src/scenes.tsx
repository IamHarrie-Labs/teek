import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, H, W, MONO, SERIF, SANS, Statement, Label, bloom, clamp, dots, glide, prog, settle, LOGO_A, LOGO_B } from './lib';

const Room: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill style={{ background: C.room }}>{children}</AbsoluteFill>;
const pad = (n: number, l: number) => String(n).padStart(l, '0');
const Clock: React.FC<{ ms: number; hot?: boolean; rewind?: boolean }> = ({ ms, hot, rewind }) => (
  <div style={{ position: 'absolute', left: 120, top: 96, fontFamily: MONO, fontSize: 34, letterSpacing: '0.06em', color: hot ? C.ivory : C.muted }}>
    {rewind ? '◀◀ ' : ''}00:00:00.{pad(Math.round(ms), 3)}
  </div>
);

// ---------- 01 Zero ----------
export const Zero: React.FC = () => {
  const f = useCurrentFrame();
  const line = glide(prog(f, 50, 120));
  return (
    <Room>
      <Clock ms={0} />
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <line x1={AX.x} y1={AX.top} x2={AX.x} y2={AX.top + (AX.y - AX.top) * line} stroke={C.ivory} strokeOpacity={0.55} strokeWidth={2} />
      </svg>
      <Statement text="A token goes live." from={24} to={240} x={120} y={430} size={128} />
    </Room>
  );
};

// ---------- 02 The race (also played backwards in 03) ----------
const crowd = dots(34, 7);
const ranks = crowd.map((d, i) => ({ d, i })).sort((a, b) => a.d.d - b.d.d).map((x, rank) => ({ ...x, rank }));
// The price chart. The line drawn in shot 01 becomes its price axis.
const AX = { x: W * 0.58, y: H * 0.88, top: H * 0.24, right: W * 0.96 };
export const raceCurve = (s: number): [number, number] => [AX.x + s * W * 0.37, AX.y - s * s * H * 0.6];
const axisText = (text: string, x: number, y: number, opacity: number, align: 'left' | 'right' | 'center' = 'left', color = C.muted) => (
  <div style={{ position: 'absolute', left: align === 'left' ? x : align === 'right' ? x - 700 : x - 350, width: 700, top: y, textAlign: align, fontFamily: MONO, fontSize: 22, letterSpacing: '0.12em', color, opacity }}>{text}</div>
);
export const arrivalFrame = (d: { d: number }) => 120 + d.d * 150;

export const RaceField: React.FC<{ f: number; rewinding?: boolean }> = ({ f, rewinding }) => {
  const ms = Math.min(400, prog(f, 0, 54) * 400);
  const curveOn = settle(prog(f, 0, 30));
  const [bx0, by0] = [W * 0.06, H * 0.68];
  const [bx1, by1] = raceCurve(0.02);
  const bt = prog(f, 50, 54);
  const path = Array.from({ length: 51 }, (_, i) => raceCurve(i / 50)).map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const [, topY] = raceCurve(0.1 + ((crowd.length - 1) / crowd.length) * 0.86);
  const [topX] = raceCurve(0.1 + ((crowd.length - 1) / crowd.length) * 0.86);
  const guides = settle(prog(f, 280, 310));
  return (
    <>
      <Clock ms={ms} hot={!rewinding && f >= 54 && f < 74 && Math.floor(f / 4) % 2 === 0} rewind={rewinding} />
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <line x1={AX.x} y1={AX.top} x2={AX.x} y2={AX.y} stroke={C.ivory} strokeOpacity={0.55} strokeWidth={2} />
        <line x1={AX.x} y1={AX.y} x2={AX.x + (AX.right - AX.x) * curveOn} y2={AX.y} stroke={C.ivory} strokeOpacity={0.55} strokeWidth={2} />
        <path d={path} fill="none" stroke={C.line} strokeWidth={3} opacity={curveOn} />
        {guides > 0 && (
          <g opacity={guides}>
            <line x1={AX.x} x2={topX} y1={topY} y2={topY} stroke={C.ivory} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="8 10" />
            <line x1={AX.x - 14} x2={AX.x} y1={topY} y2={topY} stroke={C.ivory} strokeWidth={2} />
            <line x1={AX.x - 14} x2={AX.x} y1={by1} y2={by1} stroke={C.steel} strokeWidth={2} />
          </g>
        )}
        {ranks.map(({ d, rank, i }) => {
          const sx = W * (0.05 + d.x * 0.3), sy = H * (0.46 + d.y * 0.44);
          const t = settle(prog(f, 70 + d.d * 150, 120 + d.d * 150));
          const [tx, ty] = raceCurve(0.1 + (rank / crowd.length) * 0.86);
          return <circle key={i} cx={sx + (tx - sx) * t} cy={sy + (ty - sy) * t} r={11} fill={C.ivory} />;
        })}
        <rect x={bx0 + (bx1 - bx0) * bt - 17} y={by0 + (by1 - by0) * bt - 17} width={34} height={34} fill={C.steel} />
      </svg>
      {axisText('PRICE PER TOKEN ↑', AX.x + 18, AX.top - 8, curveOn)}
      {axisText('BUYERS, IN THE ORDER THEY BOUGHT →', AX.right, AX.y + 22, curveOn, 'right')}
      {f >= 56 && f < 130 && axisText('the bot', bx1 + 26, by1 - 54, settle(prog(f, 56, 72)) * (1 - prog(f, 110, 130)), 'left', C.steel)}
      {guides > 0 && axisText("the bot's price", AX.x - 26, by1 - 14, guides, 'right', C.steel)}
      {guides > 0 && axisText("the last person's price", AX.x - 26, topY - 14, guides, 'right', C.ivory)}
    </>
  );
};

export const Race: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Room>
      <RaceField f={f} />
      <Statement text={'0.4 seconds later,\na bot already bought it.'} from={62} to={232} x={120} y={160} size={84} em={['bot']} />
      <Statement text={'Everyone after it\npays more.'} from={240} to={420} x={120} y={160} size={84} em={['more.']} />
    </Room>
  );
};

// ---------- 03 Rewind ----------
export const Rewind: React.FC = () => {
  const f = useCurrentFrame();
  const back = Math.max(0, 420 - f * 9);
  const jitter = f < 50 ? Math.sin(f * 7.3) * 8 : 0;
  return (
    <Room>
      {f < 50 && (
        <AbsoluteFill style={{ transform: `translateX(${jitter}px)`, opacity: f % 6 < 2 ? 0.75 : 1 }}>
          <RaceField f={back} rewinding />
          <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, transparent 2px 6px)' }} />
        </AbsoluteFill>
      )}
      {f >= 50 && <Clock ms={0} />}
      <Statement text={'What if there was\nno first second?'} from={74} to={240} x={W / 2} y={350} size={140} width={1600} align="center" em={['first']} />
    </Room>
  );
};

// ---------- 04 The rules ----------
const terms: [string, string][] = [['Minimum raise', '0.1'], ['Raise cap', '0.6'], ['Bids close', '10:46 PM'], ['Settlement deadline', '10:56 PM']];
export const Rules: React.FC = () => {
  const f = useCurrentFrame();
  const stamp = prog(f, 190, 214);
  const locked = f >= 190;
  return (
    <Room>
      <Statement text={'First, the creator\nsets the rules.'} from={12} to={176} x={120} y={300} size={104} />
      <Statement text={'Then they\'re locked.'} from={184} to={360} x={120} y={300} size={104} em={['locked.']} />
      <div style={{ position: 'absolute', left: 1080, top: 300, width: 720, fontFamily: MONO, color: C.muted }}>
        <div style={{ fontSize: 22, letterSpacing: '0.14em', color: C.coral, opacity: 0 }}>.</div>
        <div style={{ fontSize: 22, letterSpacing: '0.14em', marginBottom: 34, opacity: settle(prog(f, 20, 40)) }}>LAUNCH TERMS · SOLANA DEVNET</div>
        {terms.map(([k, v], i) => {
          const start = 40 + i * 22, typed = Math.floor(clamp((f - start) / 14) * v.length);
          const o = settle(prog(f, start, start + 16));
          return (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '18px 0', borderTop: `1px solid ${C.line}`, fontSize: 34, opacity: o * (locked ? 0.72 : 1), transform: `translateY(${(1 - o) * 16}px)` }}>
              <span>{k}</span><span style={{ color: C.ivory }}>{v.slice(0, typed)}</span>
            </div>
          );
        })}
        {f >= 190 && (
          <div style={{ marginTop: 40, display: 'inline-block', border: `2px solid ${C.ivory}`, borderRadius: 999, padding: '12px 30px', fontSize: 28, letterSpacing: '0.2em', color: C.ivory, transform: `scale(${1.5 - 0.5 * bloom(stamp)})`, opacity: settle(prog(f, 190, 198)), transformOrigin: 'left center' }}>LOCKED</div>
        )}
      </div>
    </Room>
  );
};

// ---------- 05 Private bids, 06 The opening ----------
const bidders = dots(12, 5);
const extra = dots(36, 11);
const glowAt = (d: { x: number; y: number }) => [W * (0.45 + d.x * 0.12), H * (0.34 + d.y * 0.5)] as const;
const PANE = { x0: W * 0.42, x1: W * 0.6, y0: H * 0.26, y1: H * 0.88 };

const Pane: React.FC<{ lift?: number; appear?: number }> = ({ lift = 0, appear = 1 }) => (
  <div style={{ position: 'absolute', left: PANE.x0, top: PANE.y0 - lift * H * 0.9, width: PANE.x1 - PANE.x0, height: PANE.y1 - PANE.y0, borderRadius: 28, border: '1.5px solid rgba(245,235,220,.26)', background: 'linear-gradient(180deg, rgba(245,235,220,.075), rgba(245,235,220,.035))', opacity: appear * (1 - lift), transform: `scale(${0.96 + 0.04 * appear})` }} />
);

export const Private: React.FC = () => {
  const f = useCurrentFrame();
  const botX = f < 260 ? W * 0.84 : f < 264 ? W * 0.84 - (W * 0.16) * prog(f, 260, 264) : f < 400 ? W * 0.68 + (f > 370 ? Math.sin(f * 2.1) * 9 : 0) : W * 0.68 + W * 0.16 * prog(f, 400, 404);
  const scanY = PANE.y0 + (PANE.y1 - PANE.y0) * prog(f, 276, 366);
  return (
    <Room>
      <Pane appear={settle(prog(f, 0, 34))} />
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <defs><filter id="blurA" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="22" /></filter></defs>
        {bidders.map((d, i) => {
          const sx = W * 0.06, sy = H * (0.34 + d.y * 0.5);
          const t = glide(prog(f, 40 + i * 15, 100 + i * 15));
          const [gx, gy] = glowAt(d);
          const x = sx + (gx - sx) * t, y = sy + (gy - sy) * t;
          const inside = prog(t, 0.72, 1);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={11} fill={C.ivory} opacity={1 - inside} />
              <circle cx={gx} cy={gy} r={22 + d.s * 26} fill={C.ivory} opacity={0.32 * inside} filter="url(#blurA)" />
            </g>
          );
        })}
        <rect x={botX - 17} y={H * 0.56 - 17} width={34} height={34} fill={C.steel} />
        {f >= 276 && f < 370 && <line x1={PANE.x0 + 6} x2={PANE.x1 - 6} y1={scanY} y2={scanY} stroke={C.steel} strokeWidth={2} opacity={0.75} />}
      </svg>
      <Label text="the bot sees only blur" from={372} to={440} x={W * 0.68 - 17} y={H * 0.56 - 70} align="left" color={C.steel} />
      <Statement text="Everyone bids in private." from={18} to={436} x={120} y={110} size={104} em={['private.']} />
      <Label text="Bids stay private inside MagicBlock's Private Ephemeral Rollup until bidding closes" from={70} to={440} x={W / 2} y={H - 96} align="center" size={26} />
    </Room>
  );
};

export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  // Everything merges at (cx, cy), then the coral dot settles onto the chart's origin.
  const cx = W * 0.44, cy = H * 0.58;
  const O = { x: W * 0.44, y: H * 0.84, top: H * 0.2, right: W * 0.95 };
  const curve = (s: number): [number, number] => [O.x + s * W * 0.47, O.y - s * s * H * 0.6];
  const m = glide(prog(f, 18, 90));
  const merged = f >= 90;
  const push = f < 90 ? 1 + 0.07 * glide(prog(f, 18, 90)) : 1.07 - 0.07 * settle(prog(f, 90, 160));
  const b = prog(f, 90, 150);
  const settleDot = glide(prog(f, 112, 150));
  const dotX = cx + (O.x - cx) * settleDot, dotY = cy + (O.y - cy) * settleDot;
  const axes = settle(prog(f, 136, 170));
  const draw = glide(prog(f, 156, 300));
  const steps = Math.max(2, Math.round(draw * 120));
  const curvePts = Array.from({ length: steps }, (_, i) => { const [x, y] = curve((i / (steps - 1)) * draw); return `${i ? 'L' : 'M'}${x} ${y}`; }).join(' ');
  // The group's purchase covers the first part of the curve in one go, and everyone pays its average.
  const A = 0.55, fill = settle(prog(f, 320, 370)), avg = settle(prog(f, 390, 430));
  const areaPts = Array.from({ length: 60 }, (_, i) => curve((i / 59) * A)).map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + ` L${curve(A)[0]} ${O.y} L${O.x} ${O.y} Z`;
  const avgY = O.y - ((A * A) / 3) * H * 0.6;
  const [aX] = curve(A);
  const chartText = (text: string, x: number, y: number, o: number, align: 'left' | 'right' | 'center' = 'left', color: string = C.muted) => (
    <div style={{ position: 'absolute', left: align === 'left' ? x : align === 'right' ? x - 800 : x - 400, width: 800, top: y, textAlign: align, fontFamily: MONO, fontSize: 22, letterSpacing: '0.1em', color, opacity: o }}>{text}</div>
  );
  const points = [
    ...bidders.map((d) => { const [x, y] = glowAt(d); return { x, y, r: 12, glow: true }; }),
    ...extra.map((d) => { const a = d.x * Math.PI * 2, r = (0.34 + d.y * 0.3) * W; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.62, r: 6 + d.s * 6, glow: false }; }),
  ];
  return (
    <Room>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${cx}px ${cy}px` }}>
        <Pane lift={glide(prog(f, 0, 40))} />
        <svg width={W} height={H} style={{ position: 'absolute' }}>
          <defs>
            <radialGradient id="coralGlow"><stop offset="0" stopColor={C.coral} stopOpacity="0.55" /><stop offset="1" stopColor={C.coral} stopOpacity="0" /></radialGradient>
            <filter id="blurB" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="16" /></filter>
          </defs>
          {!merged && points.map((p, i) => {
            const a0 = Math.atan2(p.y - cy, p.x - cx), r0 = Math.hypot(p.x - cx, p.y - cy);
            const enter = p.glow ? 1 : settle(prog(f, 0, 24));
            const a = a0 + m * 2.6, r = r0 * (1 - m);
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            return <g key={i} opacity={enter}>{p.glow && <circle cx={x} cy={y} r={34 * (1 - m) + 10} fill={C.ivory} opacity={0.25 * (1 - m)} filter="url(#blurB)" />}<circle cx={x} cy={y} r={p.r * (1 - 0.4 * m)} fill={C.ivory} opacity={0.65 + 0.35 * m} /></g>;
          })}
          {merged && (
            <>
              <circle cx={dotX} cy={dotY} r={180 + 220 * settle(b)} fill="url(#coralGlow)" opacity={(1 - prog(f, 140, 220)) * 0.9 + 0.1} />
              <circle cx={cx} cy={cy} r={30 + 900 * settle(prog(f, 90, 170))} fill="none" stroke={C.coral} strokeWidth={4} opacity={1 - prog(f, 90, 170)} />
              <line x1={O.x} y1={O.y} x2={O.x} y2={O.y - (O.y - O.top) * axes} stroke={C.ivory} strokeOpacity={0.55} strokeWidth={2} />
              <line x1={O.x} y1={O.y} x2={O.x + (O.right - O.x) * axes} y2={O.y} stroke={C.ivory} strokeOpacity={0.55} strokeWidth={2} />
              {fill > 0 && <path d={areaPts} fill={C.coral} opacity={0.24 * fill} />}
              {fill > 0 && <line x1={aX} x2={aX} y1={O.y} y2={curve(A)[1]} stroke={C.coral} strokeWidth={2} opacity={fill} />}
              <path d={curvePts} fill="none" stroke={C.coral} strokeWidth={7} strokeLinecap="round" />
              {avg > 0 && <line x1={O.x} x2={O.x + (aX - O.x) * avg} y1={avgY} y2={avgY} stroke={C.ivory} strokeWidth={3} strokeDasharray="12 10" />}
              <circle cx={dotX} cy={dotY} r={(8 + 18 * bloom(prog(f, 90, 116))) * (1 - 0.45 * settleDot)} fill={C.coral} />
            </>
          )}
        </svg>
      </AbsoluteFill>
      {merged && <AbsoluteFill style={{ background: C.coral, opacity: 0.2 * (1 - prog(f, 90, 97)) }} />}
      {chartText('PRICE PER TOKEN ↑', O.x + 18, O.top - 8, axes)}
      {chartText('TOKENS SOLD →', O.right, O.y + 22, axes, 'right')}
      {chartText("Meteora's price curve", curve(0.72)[0] + 34, curve(0.72)[1] + 18, settle(prog(f, 270, 300)), 'left', C.coral)}
      {chartText('bought together, in one go', (O.x + aX) / 2, O.y + 22, fill, 'center', C.coral)}
      {chartText('everyone pays this one price', aX + 28, avgY - 14, avg, 'left', C.ivory)}
      <Statement text={'Then everyone\nbuys together.'} from={104} to={300} x={120} y={140} size={96} em={['together.']} emColor={C.coral} />
      <Statement text={'One transaction.\nOne price.'} from={310} to={566} x={120} y={140} size={96} em={['price.']} emColor={C.coral} />
    </Room>
  );
};

// ---------- 07 Proof ----------
const instructions: [string, string][] = [['SettleLaunch', 'closes the sale'], ['InitializeVirtualPoolWithSplToken', 'creates the Meteora pool'], ['Swap', 'makes the opening buy'], ['TransferPoolCreator', 'hands the pool to the creator']];
export const Proof: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Room>
      <Label text="ONE REAL TRANSACTION ON SOLANA DEVNET" from={0} to={300} x={120} y={110} spacing={0.14} size={24} />
      <Statement text={'The pool and the first buy\nhappen together.'} from={10} to={292} x={120} y={170} size={92} em={['together.']} emColor={C.coral} />
      <div style={{ position: 'absolute', left: 120, top: 470, width: 1680 }}>
        {instructions.map(([name, plain], i) => {
          const start = 40 + i * 22, o = settle(prog(f, start, start + 22));
          const hot = i === 1 || i === 2;
          return (
            <div key={name} style={{ display: 'flex', gap: 40, alignItems: 'baseline', padding: '20px 0', borderTop: `1px solid ${C.line}`, opacity: o, transform: `translateY(${(1 - o) * 26}px)` }}>
              <span style={{ fontFamily: MONO, fontSize: 30, color: C.muted, width: 40 }}>{i + 1}</span>
              <span style={{ fontFamily: MONO, fontSize: 40, color: hot ? C.coral : C.ivory }}>{name}</span>
              <span style={{ fontFamily: SANS, fontSize: 30, color: hot ? C.ivory : C.muted, marginLeft: 'auto' }}>{plain}</span>
            </div>
          );
        })}
        <div style={{ fontFamily: MONO, fontSize: 24, color: C.muted, paddingTop: 28, borderTop: `1px solid ${C.line}`, opacity: settle(prog(f, 140, 160)), letterSpacing: '0.04em' }}>2AJEnG1zssa5aL8RaXaBBQX29zJSwdT6zcaZGTBKdP76hxeYnCc2qA7Tphom6ij2tFVqNFyxE96VgcDZmeBXiQA1</div>
      </div>
    </Room>
  );
};

// ---------- 08 Fair shares ----------
const sharers = dots(12, 23);
export const Shares: React.FC = () => {
  const f = useCurrentFrame();
  const cx = W * 0.5, cy = H * 0.4;
  return (
    <Room>
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <defs><radialGradient id="shimmer"><stop offset="0" stopColor={C.coral} stopOpacity="0.7" /><stop offset="1" stopColor={C.coral} stopOpacity="0" /></radialGradient></defs>
        {sharers.map((d, i) => {
          const a = 0.18 * Math.PI + (i / (sharers.length - 1)) * 0.64 * Math.PI;
          const tx = cx + Math.cos(a) * H * 0.42 * 1.45, ty = cy + Math.sin(a) * H * 0.42;
          const t = settle(prog(f, 40 + i * 4, 110 + i * 4));
          const shimmer = i % 4 === 1 ? Math.sin(Math.PI * prog(f, 180, 250)) : 0;
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={cx + (tx - cx) * t} y2={cy + (ty - cy) * t} stroke={C.coral} strokeOpacity={0.4 * (1 - prog(f, 150, 210))} strokeWidth={2} />
              {shimmer > 0 && <circle cx={tx} cy={ty} r={70} fill="url(#shimmer)" opacity={shimmer} />}
              <circle cx={tx} cy={ty} r={7 + d.s * 26 * t} fill={C.ivory} />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={28 - 16 * settle(prog(f, 60, 140))} fill={C.coral} />
      </svg>
      <Statement text="Everyone gets their exact share," from={10} to={160} x={120} y={110} size={84} em={['exact']} />
      <Statement text="plus whatever they didn't spend." from={166} to={300} x={120} y={110} size={84} />
      <Label text="A random number from MagicBlock VRF shares out the last crumbs fairly" from={180} to={300} x={W / 2} y={H - 80} align="center" />
    </Room>
  );
};

// ---------- 09 Or nobody pays ----------
const savers = dots(12, 31);
export const Refund: React.FC = () => {
  const f = useCurrentFrame();
  const box = { x: W * 0.38, y: H * 0.46, w: W * 0.24, h: H * 0.36 };
  const level = settle(prog(f, 20, 90)) * 0.2;
  const open = glide(prog(f, 110, 230));
  const boxFade = 1 - prog(f, 220, 250);
  return (
    <Room>
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <line x1={W * 0.3} x2={W * 0.7} y1={box.y - 40} y2={box.y - 40} stroke={C.muted} strokeDasharray="10 12" strokeWidth={2} opacity={boxFade} />
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={18} fill="none" stroke="rgba(245,235,220,.35)" strokeWidth={2} opacity={boxFade} />
        <rect x={box.x + 2} y={box.y + box.h * (1 - level)} width={box.w - 4} height={box.h * level - 2} rx={14} fill="rgba(245,235,220,.08)" opacity={boxFade} />
        {savers.map((d, i) => {
          const ix = box.x + box.w * (0.14 + (i % 4) * 0.24), iy = box.y + box.h * (0.3 + Math.floor(i / 4) * 0.24);
          const hx = i % 2 ? W * (0.05 + d.x * 0.14) : W * (0.81 + d.x * 0.14), hy = H * (0.2 + d.y * 0.7);
          const t = settle(prog(open, i * 0.035, 0.6 + i * 0.035));
          return <circle key={i} cx={ix + (hx - ix) * t} cy={iy + (hy - iy) * t} r={11} fill={C.ivory} />;
        })}
      </svg>
      <Label text="the minimum it needed to open" from={0} to={250} x={W * 0.7} y={box.y - 84} align="right" size={24} />
      <Label text={`deposits returned ${(1.5 * open).toFixed(2)} of 1.50`} from={110} to={360} x={W / 2} y={H - 110} align="center" color={C.ivory} size={30} />
      {f >= 240 && (
        <div style={{ position: 'absolute', left: W / 2 - 230, width: 460, top: H * 0.58, textAlign: 'center', padding: '20px 0', border: `2px solid ${C.ivory}`, borderRadius: 999, fontFamily: SANS, fontSize: 38, color: C.ivory, opacity: settle(prog(f, 240, 258)), transform: `scale(${1.2 - 0.2 * bloom(prog(f, 240, 266))})` }}>All refunds paid</div>
      )}
      <Statement text="Miss the minimum?" from={10} to={150} x={120} y={110} size={104} />
      <Statement text="Everyone gets their money back." from={158} to={360} x={120} y={110} size={92} em={['back.']} />
    </Room>
  );
};

// ---------- 10 The real thing ----------
const screens = ['ui-settled.png', 'ui-list.png', 'ui-record.png'];
export const Montage: React.FC = () => {
  const f = useCurrentFrame();
  const rx = 12 - 7 * glide(prog(f, 0, 180)), ry = -16 + 10 * glide(prog(f, 0, 180));
  return (
    <Room>
      <Label text="LIVE ON SOLANA DEVNET" from={0} to={180} x={120} y={90} spacing={0.14} size={24} />
      <AbsoluteFill style={{ perspective: 2200, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1440, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.line}`, background: '#221d1a', boxShadow: '0 60px 120px -30px rgba(0,0,0,.8)', transform: `rotateX(${rx}deg) rotateY(${ry}deg) translateY(30px)` }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderBottom: `1px solid ${C.line}` }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 99, background: C.line }} />)}
            <span style={{ marginLeft: 24, fontFamily: MONO, fontSize: 20, color: C.muted }}>useteek.xyz/launch</span>
          </div>
          <div style={{ position: 'relative', height: 900 }}>
            {screens.map((src, i) => {
              const start = i * 60, o = i === 0 ? 1 - prog(f, 52, 64) : prog(f, start - 8, start + 4) * (i === 2 ? 1 : 1 - prog(f, start + 52, start + 64));
              const zoom = 1 + 0.06 * prog(f, start, start + 70);
              return <Img key={src} src={staticFile(src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: o, transform: `scale(${zoom})`, transformOrigin: '50% 30%' }} />;
            })}
          </div>
        </div>
      </AbsoluteFill>
    </Room>
  );
};

// ---------- End card ----------
export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = glide(prog(f, 0, 40));
  const drop = prog(f, 34, 62);
  const S = 4.4, lx = W / 2 - 36 * S, ly = 250;
  return (
    <Room>
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <defs><clipPath id="logoClip"><rect x={0} y={0} width={72 * reveal} height={64} /></clipPath></defs>
        <g transform={`translate(${lx} ${ly}) scale(${S})`}>
          <g clipPath="url(#logoClip)"><path d={LOGO_A} fill={C.ivory} /><path d={LOGO_B} fill={C.ivory} /></g>
          {f >= 34 && <circle cx={64} cy={-50 + 59 * bloom(drop)} r={6} fill={C.coral} />}
        </g>
      </svg>
      <div style={{ position: 'absolute', top: 600, width: W, textAlign: 'center', fontFamily: SERIF, fontSize: 112, color: C.ivory, opacity: settle(prog(f, 66, 86)), transform: `translateY(${(1 - settle(prog(f, 66, 86))) * 20}px)` }}>
        Private bids. <span style={{ fontStyle: 'italic', color: C.coral }}>One opening.</span>
      </div>
      <Label text="useteek.xyz   ·   @useteekapp" from={92} to={400} x={W / 2} y={780} align="center" size={34} color={C.ivory} />
      <Label text="Live on Solana devnet · Built with MagicBlock and Meteora" from={106} to={400} x={W / 2} y={846} align="center" size={24} />
    </Room>
  );
};
