'use client';

import { useEffect, useRef, useState } from 'react';

// Distância (em fração da altura da viewport) a partir do centro da tela
// dentro da qual a seção fica 100% opaca — a "zona de leitura".
const SAFE_ZONE_RATIO = 0.30;
// Distância extra, além da zona de leitura, ao longo da qual a opacidade
// esvanece até o mínimo. Fora disso a seção fica no piso de opacidade.
const FADE_RANGE_RATIO = 0.55;
const MIN_OPACITY = 0.08;
const TRANSLATE_PX = 26;
const MAX_BLUR_PX = 2.5;
const MAX_SCALE_DROP = 0.035;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * ScrollFadeSection — a seção materializa/esvanece conforme entra e sai da
 * zona de leitura central da tela. Efeito CONTÍNUO (acompanha o scroll 1:1),
 * agrupado por seção — cada bloco do resultado (interpretação, arquétipo,
 * essência, perfil técnico) tem sua própria transição, independente das
 * demais.
 *
 * Implementação: um listener de scroll com throttle via requestAnimationFrame,
 * escrevendo o estilo direto no nó DOM (sem setState) para não gerar
 * re-render do React a cada frame — funciona igual em mobile e desktop, já
 * que ambos disparam o mesmo evento `scroll`. Respeita
 * `prefers-reduced-motion` (fica estático em opacidade 1, sem listener).
 */
export default function ScrollFadeSection({ as: Tag = 'section', className = '', children }) {
  const ref = useRef(null);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    let ticking = false;

    function update() {
      ticking = false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;

      const elCenter = rect.top + rect.height / 2;
      const viewportCenter = vh / 2;
      // Distância do centro da tela até a borda mais próxima da seção (zero
      // enquanto o centro da tela está dentro dela). Medir a partir do centro
      // da seção deixava seções altas esmaecidas justamente enquanto eram
      // lidas — o título ficava abaixo do contraste mínimo (WCAG 1.4.3).
      const dist = Math.max(0, rect.top - viewportCenter, viewportCenter - rect.bottom);

      const safeZone = vh * SAFE_ZONE_RATIO;
      const fadeRange = (vh * FADE_RANGE_RATIO) || 1;

      const progress = dist <= safeZone
        ? 1
        : clamp(1 - (dist - safeZone) / fadeRange, 0, 1);

      const opacity = MIN_OPACITY + progress * (1 - MIN_OPACITY);
      // Seção acima do centro (já lida, subindo) desliza para cima ao
      // esvanecer; abaixo do centro (ainda por vir) desliza para baixo.
      const direction = elCenter < viewportCenter ? -1 : 1;
      const translateY = (1 - progress) * TRANSLATE_PX * direction;
      const scale = 1 - (1 - progress) * MAX_SCALE_DROP;
      const blur = (1 - progress) * MAX_BLUR_PX;

      el.style.opacity = String(opacity);
      el.style.transform = `translateY(${translateY.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
    }

    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update(); // estado inicial, sem esperar o primeiro scroll
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [reduced]);

  return (
    <Tag
      ref={ref}
      className={className}
      style={
        reduced
          ? undefined
          : {
              willChange: 'opacity, transform, filter',
              // Transição curta só para absorver os "degraus" do evento de
              // scroll (especialmente roda de mouse no desktop) — curta o
              // bastante para não atrasar visivelmente o gesto do usuário.
              transition: 'opacity 160ms ease-out, transform 160ms ease-out, filter 160ms ease-out',
            }
      }
    >
      {children}
    </Tag>
  );
}
