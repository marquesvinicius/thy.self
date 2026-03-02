const EYES = [
  { cx:  8, cy: 12, rx:  7, ry: 3.0, delay: '0s',   dur: '6s',  op: 0.09 },
  { cx: 25, cy: 78, rx:  9, ry: 3.5, delay: '1.5s', dur: '7s',  op: 0.08 },
  { cx: 42, cy: 20, rx:  8, ry: 3.2, delay: '3s',   dur: '5.5s',op: 0.11 },
  { cx: 68, cy: 35, rx: 10, ry: 4.0, delay: '0.7s', dur: '8s',  op: 0.09 },
  { cx: 85, cy: 68, rx:  7, ry: 2.8, delay: '4.2s', dur: '6s',  op: 0.08 },
  { cx: 15, cy: 55, rx:  9, ry: 3.5, delay: '2.1s', dur: '9s',  op: 0.10 },
  { cx: 55, cy: 88, rx:  8, ry: 3.2, delay: '5.5s', dur: '7s',  op: 0.07 },
  { cx: 78, cy: 15, rx: 11, ry: 4.2, delay: '1.0s', dur: '5s',  op: 0.12 },
  { cx: 32, cy: 45, rx:  7, ry: 2.8, delay: '6.5s', dur: '8s',  op: 0.08 },
  { cx: 90, cy: 82, rx:  8, ry: 3.0, delay: '3.8s', dur: '6.5s',op: 0.09 },
  { cx:  5, cy: 35, rx:  6, ry: 2.5, delay: '7.0s', dur: '7s',  op: 0.07 },
  { cx: 60, cy: 60, rx:  9, ry: 3.5, delay: '4.8s', dur: '9s',  op: 0.10 },
];

const PARTICLES = [
  { left: '8%',  bottom: '15%', delay: '0s',   dur: '8s',  size: 1 },
  { left: '18%', bottom: '8%',  delay: '1.5s', dur: '11s', size: 1 },
  { left: '35%', bottom: '20%', delay: '3s',   dur: '9s',  size: 1 },
  { left: '52%', bottom: '5%',  delay: '0.8s', dur: '13s', size: 1 },
  { left: '65%', bottom: '12%', delay: '4s',   dur: '10s', size: 1 },
  { left: '78%', bottom: '18%', delay: '2.2s', dur: '8s',  size: 1 },
  { left: '88%', bottom: '7%',  delay: '5.5s', dur: '12s', size: 1 },
  { left: '45%', bottom: '25%', delay: '7s',   dur: '9s',  size: 1 },
  { left: '22%', bottom: '40%', delay: '9s',   dur: '14s', size: 1 },
  { left: '70%', bottom: '50%', delay: '6s',   dur: '11s', size: 1 },
];


function almondPath(cx, cy, rx, ry) {
  return `M ${cx - rx},${cy} Q ${cx},${cy - ry} ${cx + rx},${cy} Q ${cx},${cy + ry} ${cx - rx},${cy} Z`;
}

function CornerSigil({ x, y }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ animation: 'sigilPulse 6s ease-in-out infinite' }}>
      <circle cx="0" cy="0" r="2.6" fill="none" stroke="white" strokeWidth="0.25" />
      <line x1="-3.8" y1="0" x2="3.8" y2="0" stroke="white" strokeWidth="0.2" />
      <line x1="0" y1="-3.8" x2="0" y2="3.8" stroke="white" strokeWidth="0.2" />
      <circle cx="0" cy="0" r="0.65" fill="white" />
    </g>
  );
}

// Renderiza os olhos no SVG — reutilizado em ambos os modos
function EyeNodes({ prefix }) {
  return EYES.map((e, i) => {
    const path = almondPath(e.cx, e.cy, e.rx, e.ry);
    const irisR = e.ry * 0.72;
    const pupilR = e.ry * 0.38;

    return (
      <g key={i} opacity={e.op}>
        <g clipPath={`url(#${prefix}-${i})`}>
          <circle cx={e.cx} cy={e.cy} r={irisR} fill="none" stroke="white" strokeWidth="0.28" />
          <circle cx={e.cx} cy={e.cy} r={pupilR} fill="white" />
          {/* Pálpebra: transform: scaleY(0) inicial elimina o flicker de load */}
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
        </g>
        <path d={path} fill="none" stroke="white" strokeWidth="0.32" />
      </g>
    );
  });
}

// Olhos contidos num container relativo — usado no quiz dentro do grid de perguntas
export function MysticEyesOverlay() {
  const prefix = 'quiz-eye';
  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'none', zIndex: -1 }}
      aria-hidden="true"
    >
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
        <EyeNodes prefix={prefix} />
      </svg>
    </div>
  );
}

// Background fixo — home e result
export default function MysticBackground({ showEyes = true }) {
  const prefix = 'fixed-eye';
  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {/* Feixe de luz oracular */}
      <div className="mystic-ambient-glow" />

      {/* Scanlines — transmissão antiga */}
      <div className="mystic-scanlines" />

      {/* Vignette — foca no centro */}
      <div className="mystic-vignette" />

      {/* Grain cinematográfico */}
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

            <CornerSigil x={3.5}  y={3.5}  />
            <CornerSigil x={96.5} y={3.5}  />
            <CornerSigil x={3.5}  y={96.5} />
            <CornerSigil x={96.5} y={96.5} />

            <EyeNodes prefix={prefix} />
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
    </div>
  );
}
