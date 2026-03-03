'use client';
import { useEffect, useRef, useState } from 'react';

const EYES = [
  { cx: 8, cy: 12, rx: 7, ry: 3.0, delay: '0s', dur: '6s', op: 0.09 },
  { cx: 25, cy: 78, rx: 9, ry: 3.5, delay: '1.5s', dur: '7s', op: 0.08 },
  { cx: 42, cy: 20, rx: 8, ry: 3.2, delay: '3s', dur: '5.5s', op: 0.11 },
  { cx: 68, cy: 35, rx: 10, ry: 4.0, delay: '0.7s', dur: '8s', op: 0.09 },
  { cx: 85, cy: 68, rx: 7, ry: 2.8, delay: '4.2s', dur: '6s', op: 0.08 },
  { cx: 15, cy: 55, rx: 9, ry: 3.5, delay: '2.1s', dur: '9s', op: 0.10 },
  { cx: 55, cy: 88, rx: 8, ry: 3.2, delay: '5.5s', dur: '7s', op: 0.07 },
  { cx: 78, cy: 15, rx: 11, ry: 4.2, delay: '1.0s', dur: '5s', op: 0.12 },
  { cx: 32, cy: 45, rx: 7, ry: 2.8, delay: '6.5s', dur: '8s', op: 0.08 },
  { cx: 90, cy: 82, rx: 8, ry: 3.0, delay: '3.8s', dur: '6.5s', op: 0.09 },
  { cx: 5, cy: 35, rx: 6, ry: 2.5, delay: '7.0s', dur: '7s', op: 0.07 },
  { cx: 60, cy: 60, rx: 9, ry: 3.5, delay: '4.8s', dur: '9s', op: 0.10 },
];

const PARTICLES = [
  { left: '8%', bottom: '15%', delay: '0s', dur: '8s', size: 1 },
  { left: '18%', bottom: '8%', delay: '1.5s', dur: '11s', size: 1 },
  { left: '35%', bottom: '20%', delay: '3s', dur: '9s', size: 1 },
  { left: '52%', bottom: '5%', delay: '0.8s', dur: '13s', size: 1 },
  { left: '65%', bottom: '12%', delay: '4s', dur: '10s', size: 1 },
  { left: '78%', bottom: '18%', delay: '2.2s', dur: '8s', size: 1 },
  { left: '88%', bottom: '7%', delay: '5.5s', dur: '12s', size: 1 },
  { left: '45%', bottom: '25%', delay: '7s', dur: '9s', size: 1 },
  { left: '22%', bottom: '40%', delay: '9s', dur: '14s', size: 1 },
  { left: '70%', bottom: '50%', delay: '6s', dur: '11s', size: 1 },
];

const QUIZ_EYE_POOL = [
  { cx: 24, cy: 30, rx: 9.0, ry: 3.2, op: 0.058 },
  { cx: 74, cy: 28, rx: 10.4, ry: 3.8, op: 0.062 },
  { cx: 30, cy: 68, rx: 9.2, ry: 3.3, op: 0.055 },
  { cx: 70, cy: 70, rx: 9.8, ry: 3.6, op: 0.06 },
  { cx: 42, cy: 26, rx: 8.4, ry: 3.0, op: 0.053 },
  { cx: 58, cy: 74, rx: 9.0, ry: 3.2, op: 0.055 },
  { cx: 80, cy: 50, rx: 8.6, ry: 3.0, op: 0.052 },
  { cx: 20, cy: 52, rx: 8.3, ry: 2.9, op: 0.052 },
];

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

function pickRandomEyes(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function EyeNodes({ prefix, eyes, cycleId = 0, quizMode = false }) {
  return eyes.map((e, i) => {
    const path = almondPath(e.cx, e.cy, e.rx, e.ry);
    const irisR = e.ry * 0.72;
    const pupilR = e.ry * 0.38;
    const gazeDelay = `${0.24 + i * 0.1}s`;
    const blinkBegin = `${2.8 + i * 0.1}s`;
    const retreatBegin = `${3.7 + i * 0.08}s`;

    return (
      <g
        key={`${cycleId}-${i}`}
        opacity={e.op}
        style={
          quizMode
            ? { animation: `eyeShyRetreat 0.8s ${retreatBegin} ease-in 1 both` }
            : undefined
        }
      >
        <g clipPath={`url(#${prefix}-${i})`}>
          <circle cx={e.cx} cy={e.cy} r={irisR} fill="none" stroke="white" strokeWidth="0.28" />
          {quizMode ? (
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                begin={gazeDelay}
                dur="1.85s"
                values="0 0; -1.8 0; 1.95 0; -1.2 0; 1.5 0; -0.8 0; 0 0"
                keyTimes="0;0.18;0.32;0.47;0.64;0.79;1"
                calcMode="spline"
                keySplines="0.28 0.1 0.2 1;0.28 0.1 0.2 1;0.28 0.1 0.2 1;0.28 0.1 0.2 1;0.28 0.1 0.2 1;0.28 0.1 0.2 1"
                repeatCount="1"
                fill="freeze"
              />
              <circle cx={e.cx} cy={e.cy} r={pupilR} fill="white" />
            </g>
          ) : (
            <circle cx={e.cx} cy={e.cy} r={pupilR} fill="white" />
          )}

          {quizMode ? (
            <>
              <rect
                x={e.cx - e.rx}
                y={e.cy - e.ry}
                width={e.rx * 2}
                height={e.ry}
                fill="black"
                style={{
                  transform: 'scaleY(0)',
                  transformOrigin: '50% 100%',
                  animation: `eyeLidBlinkOnce 1.05s ${blinkBegin} ease-in-out 1 both`,
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
                  transformOrigin: '50% 0%',
                  animation: `eyeLidBlinkOnce 1.05s ${blinkBegin} ease-in-out 1 both`,
                }}
              />
            </>
          ) : (
            <rect
              x={e.cx - e.rx}
              y={e.cy - e.ry}
              width={e.rx * 2}
              height={e.ry * 2}
              fill="black"
              style={{
                transform: 'scaleY(0)',
                transformOrigin: '50% 0%',
                animation: `eyeLidBlink ${e.dur} ${e.delay} ease-in-out infinite`,
              }}
            />
          )}
        </g>
        <path d={path} fill="none" stroke="white" strokeWidth="0.32" />
      </g>
    );
  });
}

export function MysticEyesOverlay() {
  const prefix = 'quiz-eye';
  const [visible, setVisible] = useState(false);
  const [cycleId, setCycleId] = useState(0);
  const [activeEyes, setActiveEyes] = useState(() => pickRandomEyes(QUIZ_EYE_POOL, 3));
  const timersRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const queueTimeout = (callback, ms) => {
      const id = window.setTimeout(() => {
        if (!cancelled) callback();
      }, ms);
      timersRef.current.push(id);
    };

    const runCycle = () => {
      queueTimeout(() => {
        setActiveEyes(pickRandomEyes(QUIZ_EYE_POOL, 3));
        setCycleId((prev) => prev + 1);
        setVisible(true);

        queueTimeout(() => {
          setVisible(false);
          runCycle();
        }, randomBetween(4800, 6200));
      }, randomBetween(2200, 3400));
    };

    runCycle();

    return () => {
      cancelled = true;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: -1 }} aria-hidden="true">
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ opacity: visible ? 0.85 : 0, transition: 'opacity 650ms ease' }}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {activeEyes.map((e, i) => (
            <clipPath key={i} id={`${prefix}-${i}`}>
              <path d={almondPath(e.cx, e.cy, e.rx, e.ry)} />
            </clipPath>
          ))}
        </defs>
        <EyeNodes prefix={prefix} eyes={activeEyes} cycleId={cycleId} quizMode />
      </svg>
      <style jsx>{sharedStyles}</style>
    </div>
  );
}

export default function MysticBackground({ showEyes = true }) {
  const prefix = 'fixed-eye';

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 0, pointerEvents: 'none' }} aria-hidden="true">
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
              {EYES.map((e, i) => (
                <clipPath key={i} id={`${prefix}-${i}`}>
                  <path d={almondPath(e.cx, e.cy, e.rx, e.ry)} />
                </clipPath>
              ))}
            </defs>

            <CornerSigil x={3.5} y={3.5} />
            <CornerSigil x={96.5} y={3.5} />
            <CornerSigil x={3.5} y={96.5} />
            <CornerSigil x={96.5} y={96.5} />

            <EyeNodes prefix={prefix} eyes={EYES} />
          </svg>

          <div className="absolute inset-0">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: p.left,
                  bottom: p.bottom,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
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

const sharedStyles = `
  .mystic-scanlines {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0.03) 1px,
      transparent 1px,
      transparent 4px
    );
    opacity: 0.25;
  }

  .mystic-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 28%, rgba(0, 0, 0, 0.65) 100%);
  }

  .mystic-grain {
    position: absolute;
    inset: 0;
    opacity: 0.08;
    background-image: radial-gradient(rgba(255, 255, 255, 0.22) 0.55px, transparent 0.55px);
    background-size: 3px 3px;
    animation: grainMove 12s linear infinite;
  }

  @keyframes eyeLidBlink {
    0%, 88%, 100% { transform: scaleY(0); }
    90%, 92% { transform: scaleY(1); }
    94%, 96% { transform: scaleY(0.65); }
  }

  @keyframes eyeLidBlinkOnce {
    0%, 32% { transform: scaleY(0); }
    52% { transform: scaleY(1); }
    70% { transform: scaleY(0.5); }
    100% { transform: scaleY(0); }
  }

  @keyframes eyeShyRetreat {
    0% { opacity: 1; transform: translateX(0) scale(1); }
    55% { opacity: 0.92; transform: translateX(-0.2px) scale(0.995); }
    100% { opacity: 0; transform: translateX(-0.6px) scale(0.985); }
  }

  @keyframes floatParticle {
    0% { transform: translateY(0px); opacity: 0; }
    15% { opacity: 0.35; }
    55% { opacity: 0.15; }
    100% { transform: translateY(-18px); opacity: 0; }
  }

  @keyframes grainMove {
    0% { transform: translate(0, 0); }
    25% { transform: translate(-0.4%, 0.5%); }
    50% { transform: translate(0.6%, -0.5%); }
    75% { transform: translate(-0.3%, -0.2%); }
    100% { transform: translate(0, 0); }
  }
`;
