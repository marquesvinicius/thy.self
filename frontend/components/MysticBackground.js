'use client';
import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';

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

const MAX_VISIBLE_EYES = 2;

/* Amêndoa com curvas cúbicas, no desenho do ícone do site. A meia-altura
   visível é 0,75·ry.

   `closure` (0 = aberto, 1 = fechado) é a pálpebra: é o PRÓPRIO contorno que
   se fecha, como num olho real. A borda de cima desce quase tudo, a de baixo
   sobe pouco, e as duas se encontram numa linha levemente curvada para
   baixo. A íris some porque o recorte (clipPath) usa esta mesma forma. */
function almondPath(cx, cy, rx, ry, closure = 0) {
  const kx = rx * 0.42;
  const meet = cy + ry * 0.35;                     // linha da pálpebra fechada
  const up = (cy - ry) + (meet - (cy - ry)) * closure;
  const lo = (cy + ry) + (meet - (cy + ry)) * closure;
  const f = n => Math.round(n * 1000) / 1000;
  return `M ${f(cx - rx)},${f(cy)} C ${f(cx - kx)},${f(up)} ${f(cx + kx)},${f(up)} ${f(cx + rx)},${f(cy)} `
    + `C ${f(cx + kx)},${f(lo)} ${f(cx - kx)},${f(lo)} ${f(cx - rx)},${f(cy)} Z`;
}

// Tempos de uma piscada humana: fecha em ~100 ms acelerando, fica fechado
// um instante e reabre em ~200 ms desacelerando — um movimento contínuo,
// sem paradas no meio (as paradas apareciam como "degraus").
const BLINK_CLOSE_MS = 100;
const BLINK_CLOSED_MS = 40;
const BLINK_OPEN_MS = 200;

// Piscada dos olhos de fundo. Começa em 86% do MESMO ciclo do olhar
// (AMBIENT_GAZE), dentro da janela 76–100% em que o olhar está parado no
// centro — nunca pisca enquanto a íris se desloca. As durações são fixas em
// ms, então a piscada tem a mesma velocidade em olhos de ciclo curto ou longo.
function ambientBlinkProps(e, durS, begin) {
  const total = durS * 1000;
  const t1 = 0.86;
  const t2 = t1 + BLINK_CLOSE_MS / total;
  const t3 = t2 + BLINK_CLOSED_MS / total;
  const t4 = t3 + BLINK_OPEN_MS / total;
  const steps = [[0, 0], [t1, 0], [t2, 1], [t3, 1], [t4, 0], [1, 0]];
  return {
    attributeName: 'd',
    values: steps.map(([, c]) => almondPath(e.cx, e.cy, e.rx, e.ry, c)).join(';'),
    keyTimes: steps.map(([t]) => t.toFixed(5)).join(';'),
    calcMode: 'spline',
    // parado · fecha acelerando · fechado · abre desacelerando · parado
    keySplines: '0 0 1 1; 0.5 0 0.9 0.6; 0 0 1 1; 0.1 0.4 0.3 1; 0 0 1 1',
    dur: `${durS}s`,
    begin,
    repeatCount: 'indefinite',
  };
}
// Olhar dos olhos de fundo: dardo rápido (~2% do ciclo), fixação longa.
const AMBIENT_GAZE = [
  [0, '0 0'], [0.16, '0 0'], [0.18, '1.5 0.25'], [0.38, '1.5 0.25'], [0.40, '0 0'],
  [0.55, '0 0'], [0.57, '-1.2 -0.2'], [0.74, '-1.2 -0.2'], [0.76, '0 0'], [1, '0 0'],
];

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

   Cada olho tem um ciclo próprio (duração e atraso diferentes, para nunca
   olharem juntos) com animação nativa do SVG: a íris dardeja para um lado,
   fixa, volta ao centro, dardeja para o outro (AMBIENT_GAZE), e a piscada
   fecha o próprio contorno (ambientBlinkProps) só na fase em que o olhar está
   parado. A pupila respira (classe global .pupil-breath). Zero JavaScript
   por olho.
   -------------------------------------------------------------------------- */
function AmbientEyeNodes({ prefix, eyes, readingFocus = false, reduced = false }) {
  return eyes.map((e, i) => {
    const path = almondPath(e.cx, e.cy, e.rx, e.ry);
    const irisR = e.ry * 0.84;
    const pupilR = e.ry * 0.43;
    const stroke = e.ry * 0.065;
    // Timing dessincronizado por olho: 13–24s por ciclo de olhar, com o
    // delay da piscada reaproveitado como offset para quebrar qualquer
    // sincronia perceptível.
    const gazeDur = readingFocus
      ? 42 + ((i * 7.5) % 24)
      : 13 + ((i * 3.7) % 11);
    const gazeDelay = readingFocus
      ? `${(i * 5.5) % 22}s`
      : `${(i * 1.9) % 8}s`;

    // Olhar e piscada no mesmo relógio (SMIL), com a piscada só quando o
    // olhar está parado. Lendo (readingFocus): olhar lento e sem piscar.
    const blink = !reduced && !readingFocus ? (
      <animate {...ambientBlinkProps(e, gazeDur, gazeDelay)} />
    ) : null;

    return (
      <g key={`${prefix}-${i}`} opacity={e.op}>
        <g clipPath={`url(#${prefix}-${i})`}>
          <g>
            {!reduced && (
              <animateTransform attributeName="transform" type="translate"
                values={AMBIENT_GAZE.map(([, v]) => v).join(';')}
                keyTimes={AMBIENT_GAZE.map(([t]) => t).join(';')}
                dur={`${gazeDur}s`} begin={gazeDelay} repeatCount="indefinite" />
            )}
            <circle cx={e.cx} cy={e.cy} r={irisR} fill="none" stroke="white" strokeWidth={stroke} />
            <circle className="pupil-breath" cx={e.cx} cy={e.cy} r={pupilR} fill="white" />
          </g>

        </g>
        <path d={path} fill="none" stroke="white" strokeWidth={stroke}>{blink}</path>
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

   Piscar e mover não se misturam: piscar durante a perseguição de um alvo
   atrapalha o próprio movimento do olho (Rambold et al., Exp. Brain Res.,
   2004/2005), e na tela isso parece falso. Por isso a piscada espera o olhar
   ficar quieto (sem movimento em curso e sem cursor se mexendo), e o olhar
   não se move enquanto as pálpebras estão em movimento. Na saída, o olho
   para, pisca até fechar e só então se esconde.

   `prefers-reduced-motion`: pupila estática, sem sacadas/gaze/squint; a
   entrada/saída vira fade simples e as piscadas continuam discretas.
   -------------------------------------------------------------------------- */

// Poses das pálpebras em scaleY. Cada rect cobre METADE do olho, então a
// pálpebra superior usa scaleY > 1 para cruzar a linha média (o clip-path
// amendoado corta o excesso) — é ela quem faz ~80% do percurso, como na
// anatomia real; a inferior sobe pouco.
const LID_POSES = {
  closed: 1,
  open: 0,
  blink: 1,
  squint: 0.45,
};

// Limites de deslocamento da íris dentro da amêndoa (unidades do viewBox).
const GAZE_MAX_X = 12;
const GAZE_MAX_Y = 3.8;

// Ritmo contemplativo: o olho observa, não vigia. Tudo aqui é lento de
// propósito — olhar que desliza, piscada preguiçosa, saída como quem adormece.
const EYE_FADE_IN_MS = 1600;
const EYE_FADE_OUT_MS = 1400;
const EYE_VISIBLE_MIN_MS = 7000;
const EYE_VISIBLE_JITTER_MS = 4000;
const GAZE_IDLE_MS = 1400;
const GAZE_ATTEND_MS = 800;
const GAZE_IDLE_TRANSITION = `transform ${GAZE_IDLE_MS}ms cubic-bezier(.45,.05,.25,1)`;
const GAZE_ATTEND_TRANSITION = `transform ${GAZE_ATTEND_MS}ms cubic-bezier(.4,.1,.3,1)`;
// Margem depois do fim do movimento antes de o olhar contar como "quieto".
const GAZE_SETTLE_MS = 350;
// Cursor parado há pelo menos isto para o olho poder piscar.
const POINTER_QUIET_MS = 900;
// Quanto o olho fica fechado na saída antes de se esconder.
const EXIT_CLOSED_HOLD_MS = 350;
// Duração e curva de cada tipo de movimento de pálpebra.
const LID_MOTION = {
  fast: { ms: BLINK_CLOSE_MS, ease: t => t * t },                   // piscada: fecha
  slow: { ms: BLINK_OPEN_MS, ease: t => 1 - (1 - t) ** 3 },         // piscada: reabre
  drowsy: { ms: 1100, ease: t => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2) },
};

// Preferência de reduzir movimento, segura para SSR: o servidor assume
// "sem redução" e o navegador lê a mídia real (e acompanha mudanças).
function subscribeReducedMotion(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

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
  const [gazeAttending, setGazeAttending] = useState(false);
  const [pupilScale, setPupilScale] = useState(1);
  const [exiting, setExiting] = useState(false);

  const timersRef = useRef([]);
  const exitingRef = useRef(false);
  // 'idle' (sacadas aleatórias) | 'attend' (seguindo cursor / evento)
  const gazeModeRef = useRef('idle');
  const attendUntilRef = useRef(0);
  // Quando o movimento de olhar atual termina (mais a margem de assentar).
  const gazeSettledAtRef = useRef(0);
  // Último movimento do cursor (olho acompanhando = não pisca).
  const lastPointerRef = useRef(0);
  // Pálpebras em movimento: o olhar fica parado até terminar.
  const lidsBusyRef = useRef(false);

  // Fechamento atual das pálpebras (0 aberto, 1 fechado), animado até a
  // pose pedida. É ele que desenha o contorno e o recorte da íris.
  const [closure, setClosure] = useState(reduced ? 0 : 1);
  const closureRef = useRef(reduced ? 0 : 1);
  useEffect(() => {
    const target = LID_POSES[lidPose];
    const motion = LID_MOTION[lidSpeed] || LID_MOTION.slow;
    const from = closureRef.current;
    if (from === target) return undefined;
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / motion.ms);
      const value = from + (target - from) * motion.ease(t);
      closureRef.current = value;
      setClosure(value);
      if (t < 1) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [lidPose, lidSpeed]);

  // Move o olhar, a menos que as pálpebras estejam em movimento.
  const moveGaze = useCallback((next, attending) => {
    if (lidsBusyRef.current) return false;
    setGazeAttending(attending);
    setGaze(next);
    gazeSettledAtRef.current = Date.now()
      + (attending ? GAZE_ATTEND_MS : GAZE_IDLE_MS) + GAZE_SETTLE_MS;
    return true;
  }, []);

  // Muda a pose escolhendo a velocidade certa pela direção do movimento
  // (fechar = rápido, abrir = lento), a menos que uma velocidade seja pedida.
  const poseTo = useCallback((next, speed) => {
    setLidPose((prev) => {
      const closing = LID_POSES[next] > LID_POSES[prev];
      setLidSpeed(speed || (closing ? 'fast' : 'slow'));
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

    const openAt = 500;                                // surge de olhos fechados e abre devagar
    const settledAt = openAt + 1100;                   // pálpebras terminaram de abrir
    const visibleMs = EYE_VISIBLE_MIN_MS + Math.random() * EYE_VISIBLE_JITTER_MS;
    const closeAt = settledAt + visibleMs;             // início da despedida

    // Roda `fn` quando o olhar estiver quieto. `ignorePointer` vale para a
    // saída: o cursor pode não parar nunca, mas o movimento em curso termina.
    const whenGazeQuiet = (fn, { ignorePointer = false, tries = 0 } = {}) => {
      const now = Date.now();
      const moving = now < gazeSettledAtRef.current;
      const tracking = !ignorePointer && now - lastPointerRef.current < POINTER_QUIET_MS;
      if ((moving || tracking) && tries < 20) {
        schedule(() => whenGazeQuiet(fn, { ignorePointer, tries: tries + 1 }), 300);
        return;
      }
      fn();
    };

    // Piscada: fecha rápido, reabre devagar; o olhar fica parado o tempo todo.
    const blink = () => {
      if (exitingRef.current || lidsBusyRef.current) return;
      lidsBusyRef.current = true;
      poseTo('blink');
      const reopenAt = BLINK_CLOSE_MS + BLINK_CLOSED_MS + Math.random() * 30;
      schedule(() => { if (!exitingRef.current) poseTo('open'); }, reopenAt);
      schedule(() => { if (!exitingRef.current) lidsBusyRef.current = false; }, reopenAt + BLINK_OPEN_MS + 20);
    };

    schedule(() => setVisible(true), 30);
    schedule(() => poseTo('open', 'drowsy'), openAt);

    if (!reduced) {
      // 1 piscada (60%) ou 2 (40%), sempre espaçadas — nada de piscar nervoso.
      const blinkCount = Math.random() < 0.6 ? 1 : 2;
      const step = visibleMs / (blinkCount + 1);

      for (let i = 0; i < blinkCount; i++) {
        const jitter = (Math.random() - 0.5) * step * 0.3;
        schedule(() => whenGazeQuiet(blink), settledAt + step * (i + 1) + jitter);
      }

      // Olhar semicerrado ocasional (20%), lento e demorado (1.6–2.4s).
      if (Math.random() < 0.2) {
        const at = settledAt + visibleMs * (0.35 + Math.random() * 0.3);
        schedule(() => whenGazeQuiet(() => {
          if (exitingRef.current || lidsBusyRef.current) return;
          poseTo('squint', 'drowsy');
          schedule(() => {
            if (!exitingRef.current) poseTo('open', 'drowsy');
          }, 1600 + Math.random() * 800);
        }), at);
      }
    }

    // Saída: o olhar congela onde está, termina o movimento em curso, o olho
    // pisca até fechar e, já fechado, se esconde (some e recua um pouco).
    schedule(() => {
      exitingRef.current = true;
      whenGazeQuiet(() => {
        lidsBusyRef.current = true;
        poseTo('closed', 'fast');
        schedule(() => { setExiting(true); setVisible(false); }, BLINK_CLOSE_MS + EXIT_CLOSED_HOLD_MS);
        schedule(() => onDone?.(), BLINK_CLOSE_MS + EXIT_CLOSED_HOLD_MS + EYE_FADE_OUT_MS + 100);
      }, { ignorePointer: true });
    }, closeAt);

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
      } else if (!exitingRef.current) {
        gazeModeRef.current = 'idle';
        const r = Math.random();
        if (r < 0.35) {
          moveGaze({ dx: 0, dy: 0 }, false); // volta ao centro
        } else {
          moveGaze({
            dx: (Math.random() * 2 - 1) * GAZE_MAX_X * 0.6,
            dy: (Math.random() * 2 - 1) * GAZE_MAX_Y * 0.6,
          }, false);
        }
      }

      // O olhar desliza e fica: um novo ponto a cada 3 – 6.5 s.
      timer = window.setTimeout(tick, 3000 + Math.random() * 3500);
    };

    timer = window.setTimeout(tick, 2200 + Math.random() * 1500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reduced, moveGaze]);

  // ── Perseguição do cursor: olha na direção do mouse, depois "perde o
  //    interesse" e volta às sacadas ──
  useEffect(() => {
    if (reduced) return;

    let rafPending = false;

    const lookToward = (targetX, targetY) => {
      if (exitingRef.current) return;
      const ex = (x / 100) * window.innerWidth;
      const ey = (y / 100) * window.innerHeight;
      const vx = targetX - ex;
      const vy = targetY - ey;
      const len = Math.hypot(vx, vy) || 1;
      moveGaze({
        dx: (vx / len) * GAZE_MAX_X * 0.85,
        dy: (vy / len) * GAZE_MAX_Y * 0.85,
      }, true);
    };

    // Segue o cursor com calma: no máximo uma atualização a cada 250 ms,
    // e a íris leva 800 ms para chegar — acompanha, não persegue.
    let lastMove = 0;
    const onMove = (e) => {
      const now = Date.now();
      lastPointerRef.current = now;
      if (rafPending || now - lastMove < 250) return;
      lastMove = now;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        gazeModeRef.current = 'attend';
        attendUntilRef.current = Date.now() + 4000 + Math.random() * 2000;
        lookToward(e.clientX, e.clientY);
      });
    };

    // Evento do quiz: o usuário respondeu — os olhos visíveis se voltam
    // devagar para o centro e a pupila se contrai de leve.
    const onAnswered = () => {
      gazeModeRef.current = 'attend';
      attendUntilRef.current = Date.now() + 2500;
      lookToward(window.innerWidth / 2, window.innerHeight / 2);
      setPupilScale(0.88);
      const t = window.setTimeout(() => setPupilScale(1), 1100);
      timersRef.current.push(t);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('thyself:answered', onAnswered);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('thyself:answered', onAnswered);
    };
  }, [x, y, reduced, moveGaze]);

  const eyeD = almondPath(50, 21, 48, 21, closure);

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
        // Ao sair, recua um pouco (scale 0.94) enquanto se dissolve.
        transform: `translate(-50%, -50%) scale(${exiting ? 0.94 : 1})`,
        opacity: visible ? 0.22 : 0,
        transition: reduced
          ? 'opacity 900ms ease-in-out'
          : visible
            ? `opacity ${EYE_FADE_IN_MS}ms ease-out`
            : `opacity ${EYE_FADE_OUT_MS}ms ease-in-out, transform ${EYE_FADE_OUT_MS}ms ease-in-out`,
        pointerEvents: 'none',
        filter: 'blur(0.35px)',
        willChange: 'opacity, transform',
      }}
    >
      <svg
        data-closure={closure.toFixed(3)}
        viewBox="0 0 100 42"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={eyeD} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Íris + pupila: deslocam juntas nas sacadas (dardo de 90ms) */}
          <g
            style={{
              transform: `translate(${gaze.dx}px, ${gaze.dy}px)`,
              transition: gazeAttending ? GAZE_ATTEND_TRANSITION : GAZE_IDLE_TRANSITION,
            }}
          >
            <circle cx="50" cy="21" r="17.6" fill="none" stroke="white" strokeWidth="1.3" />
            {/* Constrição no flash oracular (scale 0.8 por ~650ms) */}
            <g
              style={{
                transform: `scale(${pupilScale})`,
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 600ms ease-in-out',
              }}
            >
              {/* Respiração lenta da pupila (±12% em 8s) */}
              <circle className="pupil-breath" cx="50" cy="21" r="9" fill="white" />
            </g>
          </g>

        </g>

        {/* Contorno: é ele que se fecha (pálpebra) */}
        <path
          d={eyeD}
          fill="none"
          stroke="white"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------------------
   MysticEyesOverlay: quiz-screen peripheral-eye manager.

   The number of eyes on screen is NOT fixed — at each spawn decision we
   pick a "desired" target weighted as: 1 eye (80%), 2 eyes (20%). A spawn
   only happens if the current count is below the desired target, and
   decisions come every 5–10 s, so the scene breathes slowly: mostly one
   calm observer, sometimes two, often a few seconds with none.
   -------------------------------------------------------------------------- */
// Quase sempre um único observador; às vezes dois. Três deixava a cena agitada.
function pickDesiredCount() {
  return Math.random() < 0.8 ? 1 : 2;
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
        // chamada decidiu não spawnar (alvo já atingido). Intervalos longos:
        // entre um olho e outro, a tela fica vazia por alguns segundos.
        schedule(5000, 10000);
      }, delay);
      timers.add(t);
    };

    // O primeiro olho chega sem pressa, depois que a pergunta assentou.
    const t0 = window.setTimeout(spawnEye, 2000);
    timers.add(t0);

    // Decisões de surgimento em intervalos longos e irregulares.
    schedule(6000, 10000);

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
  const reducedMotion = usePrefersReducedMotion();

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
              {AMBIENT_EYES.map((e, i) => {
                const gazeDur = readingFocus ? 42 + ((i * 7.5) % 24) : 13 + ((i * 3.7) % 11);
                const gazeDelay = readingFocus ? `${(i * 5.5) % 22}s` : `${(i * 1.9) % 8}s`;
                return (
                  <clipPath key={i} id={`${prefix}-${i}`}>
                    <path d={almondPath(e.cx, e.cy, e.rx, e.ry)}>
                      {!reducedMotion && !readingFocus && (
                        <animate {...ambientBlinkProps(e, gazeDur, gazeDelay)} />
                      )}
                    </path>
                  </clipPath>
                );
              })}
            </defs>

            <CornerSigil x={3.5} y={3.5} />
            <CornerSigil x={96.5} y={3.5} />
            <CornerSigil x={3.5} y={96.5} />
            <CornerSigil x={96.5} y={96.5} />

              <AmbientEyeNodes
                prefix={prefix}
                eyes={AMBIENT_EYES}
                readingFocus={readingFocus}
                reduced={reducedMotion}
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
