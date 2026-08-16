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

   Além das piscadas, cada olho tem um drift de olhar em CSS puro
   (`ambientGaze`): a íris dardeja para um lado, fixa, volta ao centro,
   dardeja para o outro — durações e delays diferentes por olho para que
   nunca olhem todos juntos. A pupila respira (dilatação lenta, classe
   global .pupil-breath). Zero JavaScript por olho.
   -------------------------------------------------------------------------- */
function AmbientEyeNodes({ prefix, eyes, readingFocus = false }) {
  return eyes.map((e, i) => {
    const path = almondPath(e.cx, e.cy, e.rx, e.ry);
    const irisR = e.ry * 0.72;
    const pupilR = e.ry * 0.36;
    // Timing dessincronizado por olho: 13–24s por ciclo de olhar, com o
    // delay da piscada reaproveitado como offset para quebrar qualquer
    // sincronia perceptível.
    const gazeDur = readingFocus
      ? 42 + ((i * 7.5) % 24)
      : 13 + ((i * 3.7) % 11);
    const gazeDelay = readingFocus
      ? `${(i * 5.5) % 22}s`
      : `${(i * 1.9) % 8}s`;

    return (
      <g key={`${prefix}-${i}`} opacity={e.op}>
        <g clipPath={`url(#${prefix}-${i})`}>
          <g
            style={{
              animation: `ambientGaze ${gazeDur}s ${gazeDelay} ease-in-out infinite`,
            }}
          >
            <circle cx={e.cx} cy={e.cy} r={irisR} fill="none" stroke="white" strokeWidth="0.22" />
            <circle className="pupil-breath" cx={e.cx} cy={e.cy} r={pupilR} fill="white" />
          </g>

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
              animation: readingFocus
                ? 'none'
                : `ambientBlinkTop ${e.dur} ${e.delay} ease-in-out infinite`,
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
              animation: readingFocus
                ? 'none'
                : `ambientBlinkBottom ${e.dur} ${e.delay} ease-in-out infinite`,
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

   Em vez de fade de opacidade, o olho ABRE: nasce como linha fechada, as
   pálpebras se partem revelando a íris, e ele se despede fechando. A pupila
   é viva — sacadas em repouso, perseguição do cursor quando o mouse se move,
   olhada ao centro quando o usuário responde (evento `thyself:answered`),
   respiração lenta de dilatação e constrição junto do flash oracular.

   Anatomia da piscada: fecha rápido (~110 ms), reabre mais devagar (~240 ms);
   a pálpebra superior faz a maior parte do percurso. Squint ocasional segura
   meio-fechado por 1–2 s — o "olhar avaliador".

   `prefers-reduced-motion`: pupila estática, sem sacadas/gaze/squint; a
   entrada/saída vira fade simples e as piscadas continuam discretas.
   -------------------------------------------------------------------------- */

// Poses das pálpebras em scaleY. Cada rect cobre METADE do olho, então a
// pálpebra superior usa scaleY > 1 para cruzar a linha média (o clip-path
// amendoado corta o excesso) — é ela quem faz ~80% do percurso, como na
// anatomia real; a inferior sobe pouco.
const LID_POSES = {
  closed: { upper: 1.7, lower: 0.5 },
  open: { upper: 0, lower: 0 },
  blink: { upper: 1.7, lower: 0.45 },
  squint: { upper: 1.05, lower: 0.25 },
};

// Limites de deslocamento da íris dentro da amêndoa (unidades do viewBox).
const GAZE_MAX_X = 12;
const GAZE_MAX_Y = 3.8;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function QuizEye({ x, y, size, uid, onDone }) {
  // Inicializador lazy do useState (não ref lida durante o render): o valor é
  // computado uma única vez por olho e nunca muda durante a vida do componente.
  const [reduced] = useState(prefersReducedMotion);

  const [visible, setVisible] = useState(false);
  const [lidPose, setLidPose] = useState(reduced ? 'open' : 'closed');
  // 'fast' ao fechar, 'slow' ao reabrir — assimetria anatômica da piscada.
  const [lidSpeed, setLidSpeed] = useState('slow');
  const [gaze, setGaze] = useState({ dx: 0, dy: 0 });
  const [pupilScale, setPupilScale] = useState(1);

  const timersRef = useRef([]);
  const exitingRef = useRef(false);
  // 'idle' (sacadas aleatórias) | 'attend' (seguindo cursor / evento)
  const gazeModeRef = useRef('idle');
  const attendUntilRef = useRef(0);

  // Muda a pose escolhendo a velocidade certa pela direção do movimento
  // (fechar = rápido, abrir = lento).
  const poseTo = useCallback((next) => {
    setLidPose((prev) => {
      const closing = LID_POSES[next].upper > LID_POSES[prev].upper;
      setLidSpeed(closing ? 'fast' : 'slow');
      return next;
    });
  }, []);

  // ── Ciclo de vida: abrir → observar (piscadas / squint) → fechar ──
  useEffect(() => {
    const timers = timersRef.current;
    const schedule = (fn, at) => {
      const t = window.setTimeout(fn, at);
      timers.push(t);
      return t;
    };

    const openAt = 260;                                // pálpebras se partem
    const visibleMs = 2400 + Math.random() * 1400;     // 2.4s – 3.8s de observação
    const closeAt = openAt + 420 + visibleMs;          // início do fechamento
    const goneAt = closeAt + 700;

    schedule(() => setVisible(true), 30);
    schedule(() => poseTo('open'), openAt);

    if (!reduced) {
      // 1 piscada (55%) ou 2 (45%); 20% de chance de a primeira ser dupla.
      const blinkCount = Math.random() < 0.55 ? 1 : 2;
      const doubleBlink = Math.random() < 0.2;
      const step = visibleMs / (blinkCount + 1);

      const doBlink = (at) => {
        schedule(() => {
          if (exitingRef.current) return;
          poseTo('blink');
          schedule(() => poseTo('open'), 130 + Math.random() * 90);
        }, at);
      };

      for (let i = 0; i < blinkCount; i++) {
        const jitter = (Math.random() - 0.5) * step * 0.4;
        const at = openAt + 420 + step * (i + 1) + jitter;
        doBlink(at);
        if (i === 0 && doubleBlink) doBlink(at + 380);
      }

      // Squint ocasional (25%): segura o olhar meio-fechado por 1.1–1.8s.
      if (Math.random() < 0.25) {
        const at = openAt + 420 + visibleMs * (0.3 + Math.random() * 0.35);
        schedule(() => {
          if (exitingRef.current) return;
          poseTo('squint');
          schedule(() => {
            if (!exitingRef.current) poseTo('open');
          }, 1100 + Math.random() * 700);
        }, at);
      }
    }

    schedule(() => {
      exitingRef.current = true;
      poseTo('closed');
      schedule(() => setVisible(false), 300);
    }, closeAt);
    schedule(() => onDone?.(), goneAt);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [onDone, poseTo, reduced]);

  // ── Motor de sacadas (repouso): dardeja para um ponto, fixa, dardeja ──
  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    let timer = null;

    const tick = () => {
      if (cancelled) return;
      const now = Date.now();

      if (gazeModeRef.current === 'attend' && now < attendUntilRef.current) {
        // Cursor mandou recentemente — não briga com a atenção.
      } else {
        gazeModeRef.current = 'idle';
        const r = Math.random();
        if (r < 0.28) {
          setGaze({ dx: 0, dy: 0 }); // volta ao centro
        } else {
          setGaze({
            dx: (Math.random() * 2 - 1) * GAZE_MAX_X * (r < 0.85 ? 0.7 : 1),
            dy: (Math.random() * 2 - 1) * GAZE_MAX_Y * 0.8,
          });
        }
      }

      timer = window.setTimeout(tick, 850 + Math.random() * 1600);
    };

    timer = window.setTimeout(tick, 500 + Math.random() * 800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reduced]);

  // ── Perseguição do cursor: olha na direção do mouse, depois "perde o
  //    interesse" e volta às sacadas ──
  useEffect(() => {
    if (reduced) return;

    let rafPending = false;

    const lookToward = (targetX, targetY) => {
      const ex = (x / 100) * window.innerWidth;
      const ey = (y / 100) * window.innerHeight;
      const vx = targetX - ex;
      const vy = targetY - ey;
      const len = Math.hypot(vx, vy) || 1;
      setGaze({
        dx: (vx / len) * GAZE_MAX_X,
        dy: (vy / len) * GAZE_MAX_Y,
      });
    };

    const onMove = (e) => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        gazeModeRef.current = 'attend';
        attendUntilRef.current = Date.now() + 2500 + Math.random() * 1500;
        lookToward(e.clientX, e.clientY);
      });
    };

    // Evento do quiz: o usuário respondeu — todos os olhos visíveis dão uma
    // sacada ao centro da tela e contraem a pupila junto do flash oracular.
    const onAnswered = () => {
      gazeModeRef.current = 'attend';
      attendUntilRef.current = Date.now() + 1400;
      lookToward(window.innerWidth / 2, window.innerHeight / 2);
      setPupilScale(0.8);
      const t = window.setTimeout(() => setPupilScale(1), 650);
      timersRef.current.push(t);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('thyself:answered', onAnswered);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('thyself:answered', onAnswered);
    };
  }, [x, y, reduced]);

  const pose = LID_POSES[lidPose];
  const lidTransition =
    lidSpeed === 'fast'
      ? 'transform 110ms cubic-bezier(.55,0,.8,.4)'   // fechar: queda rápida
      : 'transform 240ms cubic-bezier(.2,.65,.3,1)';  // abrir: reabertura suave

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
        opacity: visible ? 0.22 : 0,
        transition: reduced
          ? 'opacity 900ms ease-in-out'
          : visible
            ? 'opacity 420ms ease-out'
            : 'opacity 600ms ease-in',
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
          {/* Íris + pupila: deslocam juntas nas sacadas (dardo de 90ms) */}
          <g
            style={{
              transform: `translate(${gaze.dx}px, ${gaze.dy}px)`,
              transition: 'transform 90ms cubic-bezier(.3,.1,.3,1)',
            }}
          >
            <circle cx="50" cy="21" r="14" fill="none" stroke="white" strokeWidth="0.9" />
            {/* Constrição no flash oracular (scale 0.8 por ~650ms) */}
            <g
              style={{
                transform: `scale(${pupilScale})`,
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 220ms ease-out',
              }}
            >
              {/* Respiração lenta da pupila (±12% em 8s) */}
              <circle className="pupil-breath" cx="50" cy="21" r="6.2" fill="white" />
            </g>
            <circle cx="52.5" cy="19" r="1.4" fill="white" opacity="0.85" />
          </g>

          {/* Pálpebra superior (faz a maior parte do percurso) */}
          <rect
            x="0" y="0" width="100" height="21"
            fill="black"
            style={{
              transform: `scaleY(${pose.upper})`,
              transformOrigin: '50% 0%',
              transition: lidTransition,
            }}
          />
          {/* Pálpebra inferior (sobe pouco — anatomia real) */}
          <rect
            x="0" y="21" width="100" height="21"
            fill="black"
            style={{
              transform: `scaleY(${pose.lower})`,
              transformOrigin: '50% 100%',
              transition: lidTransition,
            }}
          />
        </g>

        {/* Contorno amendoado */}
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
    // Refs capturados em variáveis locais: o cleanup precisa da MESMA
    // coleção que o efeito usou (ver react-hooks/exhaustive-deps).
    const timers = timersRef.current;
    const activeZones = activeZonesRef.current;

    // Agendador recursivo declarado dentro do efeito — evita a referência
    // circular de um useCallback que se chama a si mesmo.
    const schedule = (minMs, maxMs) => {
      const delay = minMs + Math.random() * (maxMs - minMs);
      const t = window.setTimeout(() => {
        timers.delete(t);
        spawnEye();
        // Re-enfileira para a cena continuar respirando mesmo quando esta
        // chamada decidiu não spawnar (alvo já atingido). Jitter evita
        // sensação de polling.
        schedule(900, 3200);
      }, delay);
      timers.add(t);
    };

    // First eye arrives quickly so the scene isn't empty at mount.
    const t0 = window.setTimeout(spawnEye, 600);
    timers.add(t0);

    // Independent poll that makes spawn decisions at irregular intervals.
    schedule(1800, 3600);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      activeZones.clear();
    };
  }, [spawnEye]);

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
export default function MysticBackground({ showEyes = true, readingFocus = false }) {
  const prefix = 'ambient-eye';

  return (
    <div
      className={`fixed inset-0 overflow-hidden${readingFocus ? ' mystic-bg-reading' : ''}`}
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

              <AmbientEyeNodes
                prefix={prefix}
                eyes={AMBIENT_EYES}
                readingFocus={readingFocus}
              />
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

      <div className="mystic-content-shield" aria-hidden="true" />

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

  /* Ambient blink — anatomia assimétrica: a pálpebra superior fecha RÁPIDO
     (86% → 87.2% do ciclo) e reabre mais devagar, com um "hang" de meia
     pálpebra antes de abrir de vez (o segundo olhar). A inferior acompanha
     com percurso menor (máx 0.45) — pálpebras reais não são simétricas. */
  @keyframes ambientBlinkTop {
    0%, 86%, 100%  { transform: scaleY(0); }
    87.2%, 90%     { transform: scaleY(1.7); }   /* fecha rápido (cruza a linha média), segura */
    92.5%          { transform: scaleY(0.9); }   /* reabre com peso */
    94%, 95.5%     { transform: scaleY(0.6); }   /* hang de meia pálpebra */
  }

  @keyframes ambientBlinkBottom {
    0%, 86%, 100%  { transform: scaleY(0); }
    87.2%, 90%     { transform: scaleY(0.5); }
    92.5%, 95.5%   { transform: scaleY(0.15); }
  }

  /* Drift de olhar dos olhos ambient — sacadas: dardo rápido (janela de ~2%
     do ciclo), fixação longa, retorno ao centro, dardo para o outro lado.
     Deslocamentos pequenos (unidades do viewBox 100×100) para a íris nunca
     escapar da amêndoa nem no menor olho. Respeita prefers-reduced-motion. */
  @keyframes ambientGaze {
    0%, 16%        { transform: translate(0px, 0px); }
    18%, 38%       { transform: translate(1.5px, 0.25px); }
    40%, 55%       { transform: translate(0px, 0px); }
    57%, 74%       { transform: translate(-1.2px, -0.2px); }
    76%, 100%      { transform: translate(0px, 0px); }
  }

  @media (prefers-reduced-motion: reduce) {
    g[style*="ambientGaze"] { animation: none !important; }
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
