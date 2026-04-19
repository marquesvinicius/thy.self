import QRCode from 'qrcode';

/**
 * Builds a pdfmake docDefinition for a single result and triggers download.
 *
 * Everything here runs client-side. pdfmake and its VFS font bundle are
 * dynamic-imported so they never land in the initial JS payload — the
 * export button only pays for them when the user actually clicks.
 *
 * Layout (A4 portrait, 40pt margins):
 *   1. Header — brand + generation date
 *   2. PERFIL BIG FIVE — table with 5 traits, scores and textual level
 *   3. INTERPRETAÇÃO — vibe line in quotes + full narrative
 *   4. TUA ESSÊNCIA — cultural references (name · category · reason) and
 *                     works (type · title · artist · reason)
 *   5. Footer on every page — share URL + QR code
 *
 * @param {Object} args
 * @param {Object} args.profile - Full profile payload (same shape as /result).
 * @param {Object|null} args.llmInterpretation
 * @param {string|null} args.shareUrl - Optional public URL to print on the footer.
 * @param {string} args.nickname - Optional label for the title page; falls back to "Perfil Big Five".
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

  // vfs_fonts has shipped three different shapes across releases / bundlers:
  //   1. module.exports = vfs              → vfsModule.default === vfs (flat map of *.ttf strings)
  //   2. module.exports = { pdfMake: { vfs } }  → older API
  //   3. module.exports = { vfs }          → intermediate
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

  const qrDataUrl = shareUrl
    ? await QRCode.toDataURL(shareUrl, { margin: 0, width: 120, color: { dark: '#111111', light: '#FFFFFF' } }).catch(() => null)
    : null;

  const generatedAt = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [48, 72, 48, 80],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35, color: '#1a1a1a' },
    info: {
      title: 'thy.self — perfil Big Five',
      author: 'thy.self',
      subject: 'Resultado Big Five (BFI-2-S)',
    },
    header: {
      margin: [48, 28, 48, 0],
      columns: [
        {
          text: 'thy.self',
          fontSize: 12,
          bold: true,
          characterSpacing: 2,
        },
        {
          text: `gerado em ${generatedAt}`,
          alignment: 'right',
          fontSize: 8,
          color: '#6b6b6b',
          characterSpacing: 1.2,
        },
      ],
    },
    footer(currentPage, pageCount) {
      const left = shareUrl
        ? {
          stack: [
            { text: 'link deste resultado', fontSize: 7, color: '#8a8a8a', characterSpacing: 1.5 },
            { text: shareUrl, fontSize: 8, color: '#1a1a1a', margin: [0, 2, 0, 0] },
          ],
        }
        : { text: '', width: '*' };

      const center = {
        text: `página ${currentPage} de ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#8a8a8a',
      };

      const right = qrDataUrl
        ? { image: qrDataUrl, width: 44, alignment: 'right' }
        : { text: '', width: 44 };

      return {
        margin: [48, 16, 48, 0],
        columns: [{ width: '*', ...left }, { width: 'auto', ...center, margin: [12, 14, 12, 0] }, { width: 44, ...right }],
      };
    },
    content: [
      buildTitleBlock(profile, nickname),
      { text: '', margin: [0, 8, 0, 0] },
      buildBigFiveBlock(profile),
      buildInterpretationBlock(llmInterpretation),
      buildEssenceBlock(llmInterpretation),
      buildDisclaimer(),
    ],
    styles: {
      sectionLabel: {
        fontSize: 9,
        characterSpacing: 3,
        color: '#6b6b6b',
        margin: [0, 24, 0, 4],
      },
      sectionTitle: {
        fontSize: 16,
        bold: true,
        margin: [0, 0, 0, 4],
      },
      sectionSub: {
        fontSize: 9,
        italics: true,
        color: '#7a7a7a',
        margin: [0, 0, 0, 14],
      },
      traitName: { fontSize: 10, bold: true },
      traitScore: { fontSize: 10, alignment: 'right' },
      quote: {
        fontSize: 14,
        italics: true,
        alignment: 'center',
        margin: [24, 10, 24, 14],
        color: '#1a1a1a',
      },
      narrativeBody: {
        fontSize: 10.5,
        alignment: 'justify',
        color: '#1a1a1a',
      },
      refName: { fontSize: 11, bold: true },
      refCategory: { fontSize: 8, characterSpacing: 1.5, color: '#7a7a7a' },
      refReason: { fontSize: 9.5, color: '#2a2a2a', margin: [0, 3, 0, 0] },
      disclaimer: {
        fontSize: 8,
        italics: true,
        alignment: 'center',
        color: '#8a8a8a',
        margin: [0, 32, 0, 0],
      },
    },
  };

  const filename = `thy-self-perfil-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdfMake.createPdf(docDefinition).download(filename);
}

function buildTitleBlock(profile, nickname) {
  const label = nickname?.trim() ? `perfil de ${nickname.trim()}` : 'perfil big five';
  const sub = `${profile.answer_count} respostas · BFI-2-S (Soto & John, 2017)`;

  return {
    stack: [
      { text: 'resultado', style: 'sectionLabel', margin: [0, 16, 0, 4] },
      { text: label, fontSize: 22, bold: true, margin: [0, 0, 0, 4] },
      { text: sub, fontSize: 9, color: '#7a7a7a', italics: true },
    ],
  };
}

function buildBigFiveBlock(profile) {
  const rows = (profile.dimensions || []).map(dim => [
    { text: dim.name, style: 'traitName' },
    { text: dim.level || '—', fontSize: 9, color: '#7a7a7a', alignment: 'center' },
    { text: formatScore(dim.score), style: 'traitScore' },
  ]);

  return {
    stack: [
      { text: '1 · perfil big five', style: 'sectionLabel' },
      { text: 'Leitura quantitativa', style: 'sectionTitle' },
      { text: 'Calculado a partir de 30 itens BFI-2-S (escala Likert 1–5).', style: 'sectionSub' },
      {
        table: {
          widths: ['*', 'auto', 60],
          body: [
            [
              { text: 'Traço', fontSize: 8, color: '#8a8a8a', characterSpacing: 1.5, border: [false, false, false, true] },
              { text: 'Nível', fontSize: 8, color: '#8a8a8a', characterSpacing: 1.5, alignment: 'center', border: [false, false, false, true] },
              { text: 'Escore', fontSize: 8, color: '#8a8a8a', characterSpacing: 1.5, alignment: 'right', border: [false, false, false, true] },
            ],
            ...rows.map(row => row.map(cell => ({ ...cell, border: [false, false, false, true], margin: [0, 8, 0, 8] }))),
          ],
        },
        layout: {
          hLineColor: () => '#e5e5e5',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
        },
      },
    ],
  };
}

function buildInterpretationBlock(llm) {
  if (!llm) return { text: '' };

  const children = [
    { text: '2 · interpretação', style: 'sectionLabel' },
    { text: 'Leitura cruzada', style: 'sectionTitle' },
    { text: 'Como seus escores dialogam com suas respostas narrativas.', style: 'sectionSub' },
  ];

  if (llm.vibe_resumo) {
    children.push({ text: `"${llm.vibe_resumo}"`, style: 'quote' });
  }
  if (llm.interpretacao) {
    children.push({ text: llm.interpretacao, style: 'narrativeBody' });
  }

  return { stack: children };
}

function buildEssenceBlock(llm) {
  if (!llm) return { text: '' };

  const refs = Array.isArray(llm.referencias) ? llm.referencias : [];
  const works = Array.isArray(llm.obras_culturais) ? llm.obras_culturais : [];

  const children = [
    { text: '3 · tua essência', style: 'sectionLabel' },
    { text: 'Ressonâncias culturais', style: 'sectionTitle' },
    { text: 'Referências e obras em diálogo com o seu perfil.', style: 'sectionSub' },
  ];

  if (refs.length > 0) {
    children.push({ text: 'REFERÊNCIAS', fontSize: 8, characterSpacing: 2, color: '#6b6b6b', margin: [0, 4, 0, 6] });
    refs.forEach(ref => {
      children.push({
        stack: [
          { text: (ref.categoria || '').toUpperCase(), style: 'refCategory' },
          { text: ref.nome || '', style: 'refName' },
          { text: ref.motivo || '', style: 'refReason' },
        ],
        margin: [0, 0, 0, 10],
      });
    });
  }

  if (works.length > 0) {
    children.push({ text: 'OBRAS', fontSize: 8, characterSpacing: 2, color: '#6b6b6b', margin: [0, 10, 0, 6] });
    works.forEach(work => {
      const meta = [work.tipo, work.autor_ou_artista].filter(Boolean).join(' · ').toUpperCase();
      children.push({
        stack: [
          { text: meta, style: 'refCategory' },
          { text: work.titulo || '', style: 'refName' },
          { text: work.motivo || '', style: 'refReason' },
        ],
        margin: [0, 0, 0, 10],
      });
    });
  }

  return { stack: children };
}

function buildDisclaimer() {
  return {
    text: 'Este resultado reflete tendências a partir das suas respostas. Não é um laudo clínico.',
    style: 'disclaimer',
  };
}

function formatScore(score) {
  if (score == null || Number.isNaN(Number(score))) return '—';
  const rounded = Math.round(Number(score) * 10) / 10;
  return `${rounded}%`;
}
