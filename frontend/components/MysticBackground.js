'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

/* =========================================================================
   MysticBackground
   ----------------------------------------------------------------------
   Two modes:
     - Default / ambient: fixed grid of eyes that blink organically (home,
       about, result). Never moves, no gaze, just quiet blinks.
     - Quiz overlay (MysticEyesOverlay): eyes spawn at peripheral zones,
       blink 2–3 times at random intervals, fade out, then another appears
       elsewhere — never over the central question/response area.

   Visual discipline:
     - All eyes sit at zIndex 0; page content is always above (zIndex ≥ 1).
     - Stroke widths are scaled so eyes remain subtle on large screens.
     - Opacity is capped so white eyes never compete with white text.
   ========================================================================= */

// Ambient eyes — fixed positions for home/about/result
const AMBIENT_EYES = [
  { cx: 8,  cy: 12, rx: 7,  ry: 3.0, delay: '0s',   dur: '7s',  op: 0.085 },
  { cx: 25, cy: 78, rx: 9,  ry: 3.5, delay: '1.6s', dur: '8s',  op: 0.078 },
  { cx: 42, cy: 20, rx: 8,  ry: 3.2, delay: '3.1s', dur: '6.5s', op: 0.095 },
  { cx: 68, cy: 35, rx: 10, ry: 4.0, delay: '0.8s', dur: '9s',  op: 0.08  },
  { cx: 85, cy: 68, rx: 7,  ry: 2.8, delay: '4.4s', dur: '7s',  op: 0.072 },
  { cx: 15, cy: 55, rx: 9,  ry: 3.5, delay: '2.3s', dur: '10s', op: 0.088 },
  { cx: 55, cy: 88, rx: 8,  ry: 3.2, delay: '5.7s', dur: '8s',  op: 0.068 },
  { cx: 78, cy: 15, rx: 11, ry: 4.2, delay: '1.2s', dur: '6s',  op: 0.098 },
  { cx: 32, cy: 45, rx: 7,  ry: 2.8, delay: '6.8s', dur: '9s',  op: 0.072 },
  { cx: 90, cy: 82, rx: 8,  ry: 3.0, delay: '3.9s', dur: '7.5s', op: 0.082 },
  { cx: 5,  cy: 35, rx: 6,  ry: 2.5, delay: '7.2s', dur: '8s',  op: 0.068 },
  { cx: 60, cy: 60, rx: 9,  ry: 3.5, delay: '4.9s', dur: '10s', op: 0.088 },
];

// Subtle floating particles (light specks)
const PARTICLES = [
  { left: '8%',  bottom: '15%', delay: '0s',   dur: '8s'  },
  { left: '18%', bottom: '8%',  delay: '1.5s', dur: '11s' },
  { left: '35%', bottom: '20%', delay: '3s',   dur: '9s'  },
  { left: '52%', bottom: '5%',  delay: '0.8s', dur: '13s' },
  { left: '65%', bottom: '12%', delay: '4s',   dur: '10s' },
  { left: '78%', bottom: '18%', delay: '2.2s', dur: '8s'  },
  { left: '88%', bottom: '7%',  delay: '5.5s', dur: '12s' },
  { left: '45%', bottom: '25%', delay: '7s',   dur: '9s'  },
  { left: '22%', bottom: '40%', delay: '9s',   dur: '14s' },
  { left: '70%', bottom: '50%', delay: '6s',   dur: '11s' },
];

/* --------------------------------------------------------------------------
   Peripheral safe-zones for the quiz overlay. Coordinates are viewport
   percentages. All zones stay away from the central text band (≈ 25–75% X,
   20–80% Y) to guarantee eyes never compete with questions or answers.

   `size` is a CSS value (clamp) so eyes scale responsively: compact on
   mobile, substantial on desktop.
   -------------------------------------------------------------------------- */
const ZONE_WIDE = 'clamp(92px, 13vmin, 170px)';   // top/bottom bands
const ZONE_MED  = 'clamp(82px, 11vmin, 150px)';   // side edges
const ZONE_TALL = 'clamp(88px, 12vmin, 160px)';   // outer corners

const QUIZ_PERIPHERAL_ZONES = [
  // top band
  { x: 7,  y: 13, size: ZONE_TALL },
  { x: 16, y: 7,  size: ZONE_WIDE },
  { x: 26, y: 14, size: ZONE_WIDE },
  { x: 74, y: 14, size: ZONE_WIDE },
  { x: 84, y: 7,  size: ZONE_WIDE },
  { x: 93, y: 13, size: ZONE_TALL },
  // far-left vertical edge
  { x: 4,  y: 28, size: ZONE_MED },
  { x: 3,  y: 44, size: ZONE_MED },
  { x: 5,  y: 60, size: ZONE_MED },
  { x: 4,  y: 76, size: ZONE_MED },
  // far-right vertical edge
  { x: 96, y: 28, size: ZONE_MED },
  { x: 97, y: 44, size: ZONE_MED },
  { x: 95, y: 60, size: ZONE_MED },
  { x: 96, y: 76, size: ZONE_MED },
  // bottom band
  { x: 8,  y: 87, size: ZONE_WIDE },
  { x: 18, y: 93, size: ZONE_WIDE },
  { x: 30, y: 87, size: ZONE_WIDE },
  { x: 70, y: 87, size: ZONE_WIDE },
  { x: 82, y: 93, size: ZONE_WIDE },
  { x: 92, y: 87, size: ZONE_TALL },
];

const MAX_VISIBLE_EYES = 3;

function almondPath(cx, cy, rx, ry) {
  return `M ${cx - rx},${cy} Q ${cx},${cy - ry} ${cx + rx},${cy} Q ${cx},${cy + ry} ${cx - rx},${cy} Z`;
}

function CornerSigil({ x, y }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="0" cy="0" r="2.6" fill="none" stroke="white" strokeWidth="0.25" />
      <line x1="-3.8" y1="0" x2="3.8" y2="0" stroke="white" strokeWidth="0.2" />
      <line x1="0" y1="-3.8" x2="0" y2="3.8" stroke="white" strokeWidth="0.2" />
      <circle cx="0" cy="0" r="0.65" fill="white" />
    </g>
  );
}

/* --------------------------------------------------------------------------
   AmbientEyeNodes: eyes that blink organically at fixed positions.
   No translation, no gaze — pure blinks.
   -------------------------------------------------------------------------- */
function AmbientEyeNodes({ prefix, eyes }) {
  return eyes.map((e, i) => {
    const path = almondPath(e.cx, e.cy, e.rx, e.ry);
    const irisR = e.ry * 0.72;
    const pupilR = e.ry * 0.36;

    return (
      <g key={`${prefix}-${i}`} opacity={e.op}>
        <g clipPath={`url(#${prefix}-${i})`}>
          <circle cx={e.cx} cy={e.cy} r={irisR} fill="none" stroke="white" strokeWidth="0.22" />
          <circle cx={e.cx} cy={e.cy} r={pupilR} fill="white" />

          {/* Upper + lower lids closing toward the middle */}
          <rect
            x={e.cx - e.rx}
            y={e.cy - e.ry}
            width={e.rx * 2}
            height={e.ry}
            fill="black"
            style={{
              transform: 'scaleY(0)',
              transformOrigin: '50% 0%',
              animation: `ambientBlinkTop ${e.dur} ${e.delay} ease-in-out infinite`,
            }}
          />
          <rect
            x={e.cx - e.rx}
            y={e.cy}
            width={e.rx * 2}
            height={e.ry}
            fill="black"
            style={{
              transform: 'scaleY(0)',
              transformOrigin: '50% 100%',
              animation: `ambientBlinkBottom ${e.dur} ${e.delay} ease-in-out infinite`,
            }}
          />
        </g>
        <path d={path} fill="none" stroke="white" strokeWidth="0.28" />
      </g>
    );
  });
}

/* --------------------------------------------------------------------------
   QuizEye: a single peripheral eye with its own lifecycle.
     enter (1.35s) → visible window with 1–2 (rarely 3) slow blinks → exit (1.15s)

   Blinks are deliberately slow (lid glides down in ~180 ms and stays closed
   for another ~350 ms), so the observer feels contemplative rather than
   nervous. The visible window is short (1.8–2.8s) so no eye lingers.
   -------------------------------------------------------------------------- */
const LID_TRANSITION_MS = 180;

function QuizEye({ x, y, size, uid, onDone }) {
  const [phase, setPhase] = useState('entering'); // entering | visible | exiting | gone
  const [blink, setBlink] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    const timers = timersRef.current;
    const fadeInMs = 1350;
    const visibleMs = 1800 + Math.random() * 1000; // 1.8s – 2.8s
    const fadeOutMs = 1150;

    const schedule = (fn, at) => {
      const t = window.setTimeout(fn, at);
      timers.push(t);
      return t;
    };

    schedule(() => setPhase('visible'), fadeInMs);

    // 1 blink (60%), 2 blinks (35%), 3 blinks (5%) — mostly a single slow
    // contemplative blink. Each blink ≈ 700 ms total (down + hold + up).
    const r = Math.random();
    const blinkCount = r < 0.6 ? 1 : r < 0.95 ? 2 : 3;
    const step = visibleMs / (blinkCount + 1);
    for (let i = 0; i < blinkCount; i++) {
      const jitter = (Math.random() - 0.5) * step * 0.4;
      const at = fadeInMs + step * (i + 1) + jitter;
      schedule(() => {
        setBlink(true);
        schedule(() => setBlink(false), 320 + Math.random() * 140); // hold 0.32–0.46s
      }, at);
    }

    schedule(() => setPhase('exiting'), fadeInMs + visibleMs);
    schedule(() => {
      setPhase('gone');
      onDone?.();
    }, fadeInMs + visibleMs + fadeOutMs);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [onDone]);

  // Final opacity ceiling — peripheral + dim so white eyes never compete
  // with white body copy that lives at the centre of the page.
  const visibleOpacity = 0.22;
  const opacity =
    phase === 'entering'
      ? 0
      : phase === 'visible'
      ? visibleOpacity
      : 0;

  const transition =
    phase === 'entering'
      ? 'opacity 1.35s cubic-bezier(.4,.0,.2,1)'
      : phase === 'exiting'
      ? 'opacity 1.15s cubic-bezier(.4,.0,.2,1)'
      : 'opacity 200ms ease-out';

  const clipId = `quiz-eye-clip-${uid}`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        aspectRatio: '100 / 42',
        transform: 'translate(-50%, -50%)',
        opacity,
        transition,
        pointerEvents: 'none',
        filter: 'blur(0.35px)',
        willChange: 'opacity',
      }}
    >
      <svg
        viewBox="0 0 100 42"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M 2,21 Q 50,1 98,21 Q 50,41 2,21 Z" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Iris */}
          <circle cx="50" cy="21" r="14" fill="none" stroke="white" strokeWidth="0.9" />
          {/* Pupil */}
          <circle cx="50" cy="21" r="6.2" fill="white" />
          {/* Specular highlight */}
          <circle cx="52.5" cy="19" r="1.4" fill="white" opacity="0.85" />

          {/* Upper lid */}
          <rect
            x="0" y="0" width="100" height="21"
            fill="black"
            style={{
              transform: blink ? 'scaleY(1)' : 'scaleY(0)',
              transformOrigin: '50% 0%',
              transition: `transform ${LID_TRANSITION_MS}ms cubic-bezier(.4,.0,.3,1)`,
            }}
          />
          {/* Lower lid */}
          <rect
            x="0" y="21" width="100" height="21"
            fill="black"
            style={{
              transform: blink ? 'scaleY(1)' : 'scaleY(0)',
              transformOrigin: '50% 100%',
              transition: `transform ${LID_TRANSITION_MS}ms cubic-bezier(.4,.0,.3,1)`,
            }}
          />
        </g>

        {/* Almond outline */}
        <path
          d="M 2,21 Q 50,1 98,21 Q 50,41 2,21 Z"
          fill="none"
          stroke="white"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------------------
   MysticEyesOverlay: quiz-screen peripheral-eye manager.

   The number of eyes on screen is NOT fixed — at each spawn decision we
   pick a "desired" target weighted as: 1 eye (55%), 2 eyes (35%),
   3 eyes (10%). A spawn only happens if the current count is below the
   desired target, which makes the scene naturally breathe: mostly one
   calm observer, sometimes two, rarely three.
   -------------------------------------------------------------------------- */
function pickDesiredCount() {
  const r = Math.random();
  if (r < 0.55) return 1;
  if (r < 0.9) return 2;
  return 3;
}

export function MysticEyesOverlay() {
  const [eyes, setEyes] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Set());
  const activeZonesRef = useRef(new Set());

  const spawnEye = useCallback(() => {
    const busy = activeZonesRef.current;

    // Hard cap first, then probabilistic target
    if (busy.size >= MAX_VISIBLE_EYES) return;
    const desired = pickDesiredCount();
    if (busy.size >= desired) return;

    // Prefer zones not currently in use AND not adjacent to a busy zone
    const inUse = (i) => busy.has(i);
    const nearBusy = (i) => [...busy].some((b) => Math.abs(i - b) <= 1);

    const free = QUIZ_PERIPHERAL_ZONES
      .map((z, idx) => ({ z, idx }))
      .filter(({ idx }) => !inUse(idx));

    if (free.length === 0) return;

    const preferred = free.filter(({ idx }) => !nearBusy(idx));
    const pool = preferred.length > 0 ? preferred : free;
    const { z, idx } = pool[Math.floor(Math.random() * pool.length)];

    // Positional jitter so repeat appearances in the same zone feel organic
    const xJitter = (Math.random() - 0.5) * 2.5;
    const yJitter = (Math.random() - 0.5) * 2;
    const sizeJitter = 0.92 + Math.random() * 0.2; // 0.92 – 1.12
    const sizedValue = `calc(${z.size} * ${sizeJitter.toFixed(3)})`;

    const id = ++idRef.current;
    busy.add(idx);

    setEyes((prev) => [
      ...prev,
      {
        id,
        zoneIdx: idx,
        x: Math.max(1, Math.min(99, z.x + xJitter)),
        y: Math.max(1, Math.min(99, z.y + yJitter)),
        size: sizedValue,
        uid: id,
      },
    ]);
  }, []);

  const scheduleSpawn = useCallback(
    (minMs, maxMs) => {
      const delay = minMs + Math.random() * (maxMs - minMs);
      const t = window.setTimeout(() => {
        timersRef.current.delete(t);
        spawnEye();
        // Re-queue so the scene keeps breathing even if this call decided
        // not to spawn (desired target already met). Jittered to avoid
        // polling feel.
        scheduleSpawn(900, 3200);
      }, delay);
      timersRef.current.add(t);
    },
    [spawnEye]
  );

  const removeEye = useCallback(
    (id, zoneIdx) => {
      activeZonesRef.current.delete(zoneIdx);
      setEyes((prev) => prev.filter((e) => e.id !== id));
      // Eye-death does NOT force an immediate respawn — the scheduler
      // already owns the rhythm. Leaving the scene to briefly stay empty
      // is a feature, not a bug.
    },
    []
  );

  useEffect(() => {
    // First eye arrives quickly so the scene isn't empty at mount.
    const t0 = window.setTimeout(spawnEye, 600);
    timersRef.current.add(t0);

    // Independent poll that makes spawn decisions at irregular intervals.
    scheduleSpawn(1800, 3600);

    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
      activeZonesRef.current.clear();
    };
  }, [spawnEye, scheduleSpawn]);

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {eyes.map((eye) => (
        <QuizEye
          key={eye.id}
          x={eye.x}
          y={eye.y}
          size={eye.size}
          uid={eye.uid}
          onDone={() => removeEye(eye.id, eye.zoneIdx)}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   MysticBackground: ambient scene (scanlines, vignette, grain, particles
   and fixed-position blinking eyes).
   -------------------------------------------------------------------------- */
export default function MysticBackground({ showEyes = true }) {
  const prefix = 'ambient-eye';

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div className="mystic-scanlines" />
      <div className="mystic-vignette" />
      <div className="mystic-grain" />

      {showEyes && (
        <>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {AMBIENT_EYES.map((e, i) => (
                <clipPath key={i} id={`${prefix}-${i}`}>
                  <path d={almondPath(e.cx, e.cy, e.rx, e.ry)} />
                </clipPath>
              ))}
            </defs>

            <CornerSigil x={3.5} y={3.5} />
            <CornerSigil x={96.5} y={3.5} />
            <CornerSigil x={3.5} y={96.5} />
            <CornerSigil x={96.5} y={96.5} />

            <AmbientEyeNodes prefix={prefix} eyes={AMBIENT_EYES} />
          </svg>

          <div className="absolute inset-0">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: p.left,
                  bottom: p.bottom,
                  width: '1px',
                  height: '1px',
                  opacity: 0,
                  animation: `floatParticle ${p.dur} ${p.delay} ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        </>
      )}

      <style jsx>{sharedStyles}</style>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Shared keyframes (scoped via styled-jsx).
   -------------------------------------------------------------------------- */
const sharedStyles = `
  .mystic-scanlines {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.028),
      rgba(255, 255, 255, 0.028) 1px,
      transparent 1px,
      transparent 4px
    );
    opacity: 0.22;
  }

  .mystic-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 28%, rgba(0, 0, 0, 0.7) 100%);
  }

  .mystic-grain {
    position: absolute;
    inset: 0;
    opacity: 0.07;
    background-image: radial-gradient(rgba(255, 255, 255, 0.22) 0.55px, transparent 0.55px);
    background-size: 3px 3px;
    animation: grainMove 12s linear infinite;
  }

  /* Ambient blink: eyes are mostly open, closed briefly, with a half-lid
     "second-look" moment shortly after. Stays in sync between upper/lower
     because they share the same keyframe. */
  @keyframes ambientBlinkTop {
    0%, 86%, 100% { transform: scaleY(0); }
    88%, 91%      { transform: scaleY(1); }
    93%, 95%      { transform: scaleY(0.55); }
  }

  @keyframes ambientBlinkBottom {
    0%, 86%, 100% { transform: scaleY(0); }
    88%, 91%      { transform: scaleY(1); }
    93%, 95%      { transform: scaleY(0.55); }
  }

  @keyframes floatParticle {
    0%   { transform: translateY(0px);  opacity: 0;    }
    15%  {                              opacity: 0.3; }
    55%  {                              opacity: 0.12; }
    100% { transform: translateY(-18px); opacity: 0;    }
  }

  @keyframes grainMove {
    0%   { transform: translate(0, 0); }
    25%  { transform: translate(-0.4%, 0.5%); }
    50%  { transform: translate(0.6%, -0.5%); }
    75%  { transform: translate(-0.3%, -0.2%); }
    100% { transform: translate(0, 0); }
  }
`;
