import QRCode from 'qrcode';

/**
 * Builds a pdfmake docDefinition for a single result and triggers download.
 *
 * The whole document follows the dark aesthetic of the website:
 *   - pure-black page background
 *   - white (#F5F5F5) primary text
 *   - muted gray (#8A8A8A / #6B6B6B) for secondary / section labels
 *   - thin hair-line separators in #2A2A2A
 *
 * Everything here runs client-side. pdfmake and its VFS font bundle are
 * dynamic-imported so they never land in the initial JS payload — the
 * export button only pays for them when the user actually clicks.
 *
 * Layout (A4 portrait, generous side margins):
 *   1. Header      — brand + generation date (muted)
 *   2. Title       — "perfil big five" + soft subtitle
 *   3. INTERPRETAÇÃO — vibe line (quote) + full narrative (if available)
 *   4. TUA ESSÊNCIA  — cultural refs + works (if available)
 *   5. PERFIL BIG FIVE — traits + levels + scores (always last, matches site)
 *   6. Footer on every page — share URL + QR (if any) + page counter
 *
 * @param {Object} args
 * @param {Object} args.profile - Full profile payload (same shape as /result).
 * @param {Object|null} args.llmInterpretation
 * @param {string|null} args.shareUrl - Optional public URL to print on the footer.
 * @param {string} args.nickname - Optional label for the title page.
 */
export async function exportResultPdf({ profile, llmInterpretation, shareUrl = null, nickname = '' } = {}) {
  if (!profile) return;

  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfMake = pdfMakeModule.default || pdfMakeModule;

  // Exposing pdfMake globally BEFORE importing vfs_fonts lets the vfs bundle
  // auto-register via its built-in IIFE (`_global.pdfMake.addVirtualFileSystem(vfs)`).
  // Works around Turbopack/Next-16 not evaluating the auto-register path reliably.
  if (typeof window !== 'undefined' && !window.pdfMake) {
    window.pdfMake = pdfMake;
  }

  const vfsModule = await import('pdfmake/build/vfs_fonts');

  let vfs = vfsModule.default ?? vfsModule;
  if (vfs && !vfs['Roboto-Regular.ttf']) {
    if (vfs.pdfMake?.vfs) vfs = vfs.pdfMake.vfs;
    else if (vfs.vfs) vfs = vfs.vfs;
  }

  if (typeof pdfMake.addVirtualFileSystem === 'function') {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    pdfMake.vfs = vfs;
  }

  // Dark palette (mirrors the Tailwind theme used on the website).
  const palette = {
    bg: '#0A0A0A',
    textPrimary: '#F5F5F5',
    textSecondary: '#C4C4C4',
    textMuted: '#8A8A8A',
    textFaint: '#6B6B6B',
    line: '#2A2A2A',
  };

  // Force the QR code to render light-on-dark so it blends with the page.
  const qrDataUrl = shareUrl
    ? await QRCode.toDataURL(shareUrl, {
      margin: 0,
      width: 140,
      color: { dark: '#F5F5F5', light: '#0A0A0A' },
    }).catch(() => null)
    : null;

  const generatedAt = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const pageWidth = 595.28;  // A4 in points
  const pageHeight = 841.89;

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [56, 80, 56, 96],
    info: {
      title: 'thy.self — perfil Big Five',
      author: 'thy.self',
      subject: 'Resultado Big Five (BFI-2-S)',
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.45,
      color: palette.textPrimary,
    },

    // Full-bleed black background on every page.
    background: () => ({
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageWidth,
          h: pageHeight,
          color: palette.bg,
        },
      ],
    }),

    header: {
      margin: [56, 32, 56, 0],
      columns: [
        {
          text: 'thy.self',
          fontSize: 11,
          bold: true,
          characterSpacing: 3,
          color: palette.textPrimary,
        },
        {
          text: `gerado em ${generatedAt}`,
          alignment: 'right',
          fontSize: 8,
          color: palette.textMuted,
          characterSpacing: 1.5,
        },
      ],
    },

    footer(currentPage, pageCount) {
      const left = shareUrl
        ? {
          stack: [
            { text: 'LINK DESTE RESULTADO', fontSize: 7, color: palette.textFaint, characterSpacing: 2 },
            { text: shareUrl, fontSize: 8, color: palette.textSecondary, margin: [0, 3, 0, 0] },
          ],
        }
        : { text: '', width: '*' };

      const center = {
        text: `pagina ${currentPage} de ${pageCount}`,
        alignment: 'center',
        fontSize: 7.5,
        color: palette.textFaint,
        characterSpacing: 2,
        margin: [12, 16, 12, 0],
      };

      const right = qrDataUrl
        ? { image: qrDataUrl, width: 50, alignment: 'right' }
        : { text: '', width: 50 };

      return {
        margin: [56, 24, 56, 0],
        columns: [
          { width: '*', ...left },
          { width: 'auto', ...center },
          { width: 50, ...right },
        ],
      };
    },

    content: [
      buildTitleBlock(profile, nickname, palette),
      buildInterpretationBlock(llmInterpretation, palette),
      buildEssenceBlock(llmInterpretation, palette),
      buildBigFiveBlock(profile, palette),
      buildDisclaimer(palette),
    ],

    styles: {
      sectionLabel: {
        fontSize: 8,
        characterSpacing: 3,
        color: palette.textFaint,
        margin: [0, 28, 0, 6],
      },
      sectionTitle: {
        fontSize: 18,
        bold: true,
        color: palette.textPrimary,
        margin: [0, 0, 0, 4],
      },
      sectionSub: {
        fontSize: 9,
        italics: true,
        color: palette.textMuted,
        margin: [0, 0, 0, 16],
      },
      traitName: { fontSize: 10.5, bold: true, color: palette.textPrimary },
      traitLevel: { fontSize: 9, color: palette.textMuted, alignment: 'center' },
      traitScore: { fontSize: 10.5, alignment: 'right', color: palette.textPrimary, bold: true },
      quote: {
        fontSize: 15,
        italics: true,
        alignment: 'center',
        margin: [24, 10, 24, 18],
        color: palette.textPrimary,
      },
      narrativeBody: {
        fontSize: 10.5,
        alignment: 'justify',
        color: palette.textSecondary,
      },
      refName: { fontSize: 11.5, bold: true, color: palette.textPrimary },
      refCategory: { fontSize: 7.5, characterSpacing: 2, color: palette.textFaint },
      refReason: { fontSize: 9.5, color: palette.textSecondary, margin: [0, 4, 0, 0] },
      disclaimer: {
        fontSize: 8,
        italics: true,
        alignment: 'center',
        color: palette.textFaint,
        margin: [0, 36, 0, 0],
      },
    },
  };

  const filename = `thy-self-perfil-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdfMake.createPdf(docDefinition).download(filename);
}

function buildTitleBlock(profile, nickname, palette) {
  const label = nickname?.trim() ? `perfil de ${nickname.trim()}` : 'perfil big five';
  const sub = `${profile.answer_count} respostas · BFI-2-S (Soto & John, 2017)`;

  return {
    stack: [
      { text: 'RESULTADO', fontSize: 8, characterSpacing: 3, color: palette.textFaint, margin: [0, 20, 0, 6] },
      {
        text: label,
        fontSize: 26,
        bold: true,
        color: palette.textPrimary,
        margin: [0, 0, 0, 6],
      },
      {
        text: sub,
        fontSize: 9,
        color: palette.textMuted,
        italics: true,
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 18, x2: 80, y2: 18, lineWidth: 0.8, lineColor: palette.textPrimary },
        ],
        margin: [0, 0, 0, 0],
      },
    ],
  };
}

function buildInterpretationBlock(llm, palette) {
  if (!llm) return { text: '' };

  const children = [
    { text: '1 · INTERPRETAÇÃO', style: 'sectionLabel' },
    { text: 'a sua síntese', style: 'sectionTitle' },
    { text: 'Leitura narrativa cruzando seus escores e respostas.', style: 'sectionSub' },
  ];

  if (llm.vibe_resumo) {
    children.push({ text: `"${llm.vibe_resumo}"`, style: 'quote' });
  }
  if (llm.interpretacao) {
    children.push({ text: llm.interpretacao, style: 'narrativeBody' });
  }

  return { stack: children };
}

function buildEssenceBlock(llm, palette) {
  if (!llm) return { text: '' };

  const refs = Array.isArray(llm.referencias) ? llm.referencias : [];
  const works = Array.isArray(llm.obras_culturais) ? llm.obras_culturais : [];

  if (refs.length === 0 && works.length === 0) return { text: '' };

  const children = [
    { text: '2 · TUA ESSÊNCIA', style: 'sectionLabel' },
    { text: 'ressonâncias culturais', style: 'sectionTitle' },
    { text: 'Figuras e obras em diálogo com o seu perfil.', style: 'sectionSub' },
  ];

  if (refs.length > 0) {
    children.push({ text: 'REFERÊNCIAS', fontSize: 8, characterSpacing: 2.5, color: palette.textFaint, margin: [0, 4, 0, 10] });
    refs.forEach((ref, idx) => {
      children.push({
        stack: [
          { text: (ref.categoria || '').toUpperCase(), style: 'refCategory' },
          { text: ref.nome || '', style: 'refName', margin: [0, 2, 0, 0] },
          { text: ref.motivo || '', style: 'refReason' },
        ],
        margin: [0, 0, 0, idx === refs.length - 1 ? 4 : 14],
      });
    });
  }

  if (works.length > 0) {
    children.push({ text: 'OBRAS', fontSize: 8, characterSpacing: 2.5, color: palette.textFaint, margin: [0, 14, 0, 10] });
    works.forEach((work, idx) => {
      const meta = [work.tipo, work.autor_ou_artista].filter(Boolean).join(' · ').toUpperCase();
      children.push({
        stack: [
          { text: meta, style: 'refCategory' },
          { text: work.titulo || '', style: 'refName', margin: [0, 2, 0, 0] },
          { text: work.motivo || '', style: 'refReason' },
        ],
        margin: [0, 0, 0, idx === works.length - 1 ? 4 : 14],
      });
    });
  }

  return { stack: children };
}

function buildBigFiveBlock(profile, palette) {
  const rows = (profile.dimensions || []).map(dim => [
    { text: dim.name, style: 'traitName' },
    { text: dim.level || '—', style: 'traitLevel' },
    { text: formatScore(dim.score), style: 'traitScore' },
  ]);

  return {
    stack: [
      { text: '3 · PERFIL BIG FIVE', style: 'sectionLabel' },
      { text: 'leitura quantitativa', style: 'sectionTitle' },
      { text: 'Escores calculados a partir de 30 itens BFI-2-S (escala Likert 1–5).', style: 'sectionSub' },
      {
        table: {
          widths: ['*', 'auto', 60],
          body: [
            [
              { text: 'TRAÇO', fontSize: 7.5, color: palette.textFaint, characterSpacing: 2.5, border: [false, false, false, true] },
              { text: 'NÍVEL', fontSize: 7.5, color: palette.textFaint, characterSpacing: 2.5, alignment: 'center', border: [false, false, false, true] },
              { text: 'ESCORE', fontSize: 7.5, color: palette.textFaint, characterSpacing: 2.5, alignment: 'right', border: [false, false, false, true] },
            ],
            ...rows.map(row => row.map(cell => ({
              ...cell,
              border: [false, false, false, true],
              margin: [0, 10, 0, 10],
            }))),
          ],
        },
        layout: {
          hLineColor: () => palette.line,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
    ],
  };
}

function buildDisclaimer(palette) {
  return {
    text: 'Este resultado reflete tendências a partir das suas respostas. Não é um laudo clínico.',
    style: 'disclaimer',
  };
}

function formatScore(score) {
  if (score == null || Number.isNaN(Number(score))) return '—';
  const rounded = Math.round(Number(score) * 10) / 10;
  return `${rounded}`;
}
