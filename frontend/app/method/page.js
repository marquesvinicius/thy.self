'use client';

import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import Link from 'next/link';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

const OCEAN_DIMENSIONS = [
  {
    key: 'O',
    name: 'abertura',
    english: 'openness to experience',
    low: 'convencional / prático',
    high: 'inventivo / curioso',
    definition:
      'descreve a amplitude, profundidade, originalidade e complexidade da vida mental e experiencial do indivíduo. contrasta a preferência pelo familiar e concreto com a atração pelo novo, pelo abstrato e pelo esteticamente estimulante.',
    source: 'John & Srivastava (1999)',
    facets: ['sensibilidade estética', 'curiosidade intelectual', 'imaginação criativa'],
  },
  {
    key: 'C',
    name: 'conscienciosidade',
    english: 'conscientiousness',
    low: 'espontâneo / flexível',
    high: 'organizado / disciplinado',
    definition:
      'descreve o controle de impulsos socialmente prescrito que facilita o comportamento orientado a tarefas e metas — pensar antes de agir, adiar gratificação, seguir normas, planejar, organizar e priorizar.',
    source: 'John & Srivastava (1999)',
    facets: ['organização', 'produtividade', 'responsabilidade'],
  },
  {
    key: 'E',
    name: 'extroversão',
    english: 'extraversion',
    low: 'reservado / introspectivo',
    high: 'sociável / enérgico',
    definition:
      'implica uma abordagem enérgica dirigida ao mundo social e material, envolvendo traços como sociabilidade, atividade, assertividade e emocionalidade positiva.',
    source: 'John & Srivastava (1999)',
    facets: ['sociabilidade', 'assertividade', 'nível de energia'],
  },
  {
    key: 'A',
    name: 'amabilidade',
    english: 'agreeableness',
    low: 'crítico / direto',
    high: 'cooperativo / empático',
    definition:
      'contrapõe uma orientação pró-social e comunitária à hostilidade — inclui traços como altruísmo, compaixão, confiança interpessoal e modéstia.',
    source: 'John & Srivastava (1999)',
    facets: ['compaixão', 'respeito', 'confiança'],
  },
  {
    key: 'N',
    name: 'neuroticismo',
    english: 'neuroticism',
    low: 'estável / tranquilo',
    high: 'sensível / reativo',
    definition:
      'contrasta estabilidade emocional e equilíbrio com emocionalidade negativa — propensão a sentir ansiedade, tristeza, tensão e reatividade ao estresse. escores altos não indicam patologia, apenas maior sensibilidade emocional.',
    source: 'John & Srivastava (1999); Soto & John (2017)',
    facets: ['ansiedade', 'tristeza', 'volatilidade emocional'],
  },
];

const LEVELS = [
  { range: '0–19', label: 'muito baixo' },
  { range: '20–39', label: 'baixo' },
  { range: '40–59', label: 'moderado' },
  { range: '60–79', label: 'alto' },
  { range: '80–100', label: 'muito alto' },
];

const COMPARISON = [
  {
    column: 'camada objetiva',
    subtitle: 'BFI-2-S · 30 itens · domínio público',
    deterministic: true,
    rows: [
      'escala Likert de 5 pontos',
      'chaves direta e reversa da literatura',
      'única entrada do motor de cálculo',
      'resultado reproduzível bit a bit',
    ],
  },
  {
    column: 'camada interpretativa',
    subtitle: 'dilemas · paradoxos · interesses',
    deterministic: false,
    rows: [
      'perguntas autorais, sem pesos numéricos',
      'impacto zero nos escores OCEAN',
      'serve de contexto para a narrativa',
      'usada pelo LLM como colorido qualitativo',
    ],
  },
];

function SectionTitle({ eyebrow, title }) {
  return (
    <div className="space-y-2 mb-8">
      {eyebrow && (
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{eyebrow}</p>
      )}
      <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function Formula({ tex }) {
  return (
    <div className="border border-border/80 bg-surface/60 p-5 md:p-8 my-4 overflow-x-auto flex items-center justify-center">
      <div className="text-foreground/95">
        <BlockMath math={tex} />
      </div>
    </div>
  );
}

function InlineEq({ tex }) {
  return (
    <span className="text-foreground/90">
      <InlineMath math={tex} />
    </span>
  );
}

export default function MethodPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground showEyes={false} />
      <Header />

      <main className="flex-1 pt-24 pb-24 px-6 relative z-[1]">
        <article className="max-w-4xl mx-auto space-y-20">

          {/* Hero */}
          <section className="pt-8 space-y-6 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">método</p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
              como o thy.self<br />calcula quem você é
            </h1>
            <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
              nada aqui é inventado no escuro. a medida vem de um instrumento
              psicométrico publicado em periódico revisado por pares, o cálculo
              é uma aritmética transparente, e a narrativa é explicitamente
              rotulada como interpretação. esta página expõe cada etapa.
            </p>
          </section>

          {/* Dual-core architecture */}
          <section>
            <SectionTitle eyebrow="1. arquitetura" title="dual-core: duas camadas, papéis distintos" />
            <p className="text-sm text-muted leading-relaxed mb-6">
              o banco de perguntas é dividido em duas camadas mutuamente
              exclusivas. a primeira <em>mede</em>. a segunda <em>colore</em>. a
              separação é estrutural — imposta pelo schema do banco e pelo
              filtro do motor de cálculo.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COMPARISON.map((col) => (
                <div
                  key={col.column}
                  className={`border p-5 space-y-3 ${
                    col.deterministic ? 'border-foreground/60' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.2em]">
                        {col.column}
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted mt-1">
                        {col.subtitle}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] uppercase tracking-[0.2em] border px-2 py-1 whitespace-nowrap ${
                        col.deterministic
                          ? 'border-foreground text-foreground'
                          : 'border-border text-muted'
                      }`}
                    >
                      {col.deterministic ? 'calculado' : 'interpretativo'}
                    </span>
                  </div>
                  <ul className="space-y-2 pt-2">
                    {col.rows.map((row, i) => (
                      <li key={i} className="text-xs text-muted leading-relaxed flex gap-2">
                        <span className="text-foreground/40">—</span>
                        <span>{row}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* BFI-2-S */}
          <section>
            <SectionTitle eyebrow="2. camada objetiva" title="BFI-2-S: instrumento, não adaptação" />
            <div className="space-y-4 text-sm text-muted leading-relaxed">
              <p>
                a camada objetiva reutiliza <strong className="text-foreground">integralmente</strong> os
                30 itens do <em>Big Five Inventory 2 – Short Form</em>, publicado
                por Soto e John (2017) no <em>Journal of Personality and Social Psychology</em>.
                o instrumento é de domínio público, valida as cinco dimensões com
                seis itens cada e usa uma escala Likert de cinco pontos.
              </p>
              <p>
                o thy.self <strong className="text-foreground">não traduz, não reescreve, não recalibra</strong> os
                itens. as chaves de pontuação (direta e reversa) são preservadas
                exatamente como publicadas — se um item é reverso, concordar com
                ele <em>diminui</em> o traço medido.
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2 mt-6">
              {[-2, -1, 0, 1, 2].map((v) => (
                <div key={v} className="border border-border p-3 text-center">
                  <div className="text-lg font-bold tabular-nums">
                    {v > 0 ? `+${v}` : v}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-muted mt-1">
                    {v === -2 && 'discordo muito'}
                    {v === -1 && 'discordo'}
                    {v === 0 && 'neutro'}
                    {v === 1 && 'concordo'}
                    {v === 2 && 'concordo muito'}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70 mt-3 text-center">
              escala Likert de 5 pontos · mapeada ao intervalo [−2, +2]
            </p>
          </section>

          {/* The calculation */}
          <section>
            <SectionTitle eyebrow="3. o cálculo" title="normalização min-max, por dimensão, nada mais" />
            <p className="text-sm text-muted leading-relaxed mb-4">
              cada dimensão do OCEAN tem exatamente seis itens no BFI-2-S. o
              motor acumula os valores Likert (com inversão de sinal para itens
              de chave reversa), aplica a normalização min-max clássica
              (Han, Kamber & Pei, 2011) e devolve um escore entre 0 e 100.
            </p>

            <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-8 mb-2">
              etapa 1 · acumulação do escore bruto
            </p>
            <Formula tex={String.raw`\text{bruto}(d) = \sum_{i=1}^{6} \text{sign}_{i} \cdot \text{likert}_{i}`} />
            <div className="text-[11px] md:text-xs text-muted leading-relaxed space-y-1 pl-2 border-l border-border/60 ml-2">
              <p>
                onde <InlineEq tex={String.raw`d \in \{O, C, E, A, N\}`} />,{' '}
                <InlineEq tex={String.raw`\text{likert}_{i} \in \{-2, -1, 0, +1, +2\}`} />
              </p>
              <p>
                <InlineEq tex={String.raw`\text{sign}_{i} = +1`} /> se item direto,{' '}
                <InlineEq tex={String.raw`-1`} /> se reverso
              </p>
              <p>
                limite teórico: <InlineEq tex={String.raw`\text{bruto}(d) \in [-12,\; +12]`} />
              </p>
            </div>

            <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-8 mb-2">
              etapa 2 · normalização para a escala 0–100
            </p>
            <Formula
              tex={String.raw`\text{escore}(d) \;=\; \frac{\text{bruto}(d) - (-12)}{(+12) - (-12)} \times 100 \;=\; \frac{\text{bruto}(d) + 12}{24} \times 100`}
            />

            <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-8 mb-2">
              etapa 3 · classificação em cinco níveis
            </p>
            <div className="border border-border divide-y divide-border">
              {LEVELS.map((lvl) => (
                <div key={lvl.range} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs font-bold tabular-nums">{lvl.range}</span>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
                    {lvl.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-l-2 border-foreground/40 pl-4 mt-8 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/70">
                propriedades garantidas
              </p>
              <ul className="text-xs text-muted space-y-1.5 leading-relaxed">
                <li>— respondente perfeitamente neutro pontua <span className="tabular-nums text-foreground">50</span> em todas as dimensões</li>
                <li>— o cálculo é <strong className="text-foreground">idempotente</strong>: mesmas respostas, mesmos escores, para sempre</li>
                <li>— o motor é um módulo isolado, sem chamadas de rede, sem efeitos colaterais</li>
                <li>— o resultado é arredondado para uma casa decimal e saturado em [0, 100]</li>
              </ul>
            </div>
          </section>

          {/* Dimensions */}
          <section>
            <SectionTitle eyebrow="4. as cinco dimensões" title="OCEAN: definições acadêmicas, facetas e polos" />
            <p className="text-sm text-muted leading-relaxed mb-6">
              as definições a seguir são paráfrases dos textos canônicos do
              Big Five. as três facetas listadas por dimensão correspondem à
              estrutura hierárquica do BFI-2 proposta por Soto & John (2017),
              na qual cada uma das cinco dimensões é composta por três
              subtraços específicos — cada faceta é medida por dois itens
              no BFI-2-S.
            </p>
            <div className="space-y-4">
              {OCEAN_DIMENSIONS.map((dim) => (
                <div key={dim.key} className="border border-border p-5 md:p-6 space-y-5">
                  {/* Header: letter + name */}
                  <div className="flex items-baseline gap-4">
                    <span className="text-4xl md:text-5xl font-bold tracking-tighter">
                      {dim.key}
                    </span>
                    <div>
                      <div className="text-sm uppercase tracking-[0.2em]">{dim.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted/70 mt-0.5">
                        {dim.english}
                      </div>
                    </div>
                  </div>

                  {/* Academic definition */}
                  <figure className="pl-4 border-l-2 border-foreground/30 space-y-2">
                    <blockquote className="text-xs md:text-sm text-foreground/85 leading-relaxed italic">
                      “{dim.definition}”
                    </blockquote>
                    <figcaption className="text-[10px] uppercase tracking-[0.25em] text-muted not-italic">
                      — {dim.source}
                    </figcaption>
                  </figure>

                  {/* BFI-2 facets */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
                      facetas medidas no BFI-2-S
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dim.facets.map((facet) => (
                        <span
                          key={facet}
                          className="text-[11px] uppercase tracking-[0.15em] border border-border px-3 py-1.5 bg-surface/40"
                        >
                          {facet}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Poles */}
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted pt-4 border-t border-border/50">
                    <span>← {dim.low}</span>
                    <span className="flex-1 border-t border-dashed border-border" />
                    <span>{dim.high} →</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-l-2 border-foreground/40 pl-4 mt-6 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/70">
                nota importante sobre os nomes
              </p>
              <p className="text-xs text-muted leading-relaxed">
                os rótulos do modelo vêm do inglês técnico. <em>neuroticismo</em>{' '}
                não é sinônimo de neurose clínica — é a descrição dimensional
                da sensibilidade ao afeto negativo. <em>abertura</em> não
                mede inteligência, mede disposição para o novo. nenhum polo é
                melhor que o outro: ambos descrevem configurações adaptativas
                em contextos diferentes (McCrae & Costa, 1997).
              </p>
            </div>
          </section>

          {/* Interpretive layer */}
          <section>
            <SectionTitle eyebrow="5. camada interpretativa" title="o que não entra na conta" />
            <div className="space-y-4 text-sm text-muted leading-relaxed">
              <p>
                dilemas morais, paradoxos e perguntas de preferência existem
                para humanizar o perfil, não para pontuá-lo. elas formam o
                material textual que o modelo de linguagem usa para escolher
                referências culturais, tom narrativo e analogias.
              </p>
              <p>
                no schema do banco, cada pergunta carrega um campo{' '}
                <code className="text-foreground bg-surface/80 px-1.5 py-0.5 text-[11px] border border-border/60">
                  questions.kind
                </code>{' '}
                que identifica sua camada. o motor de cálculo filtra por esse
                campo antes de acumular qualquer coisa. uma resposta interpretativa
                passa direto pelo cálculo como se não existisse.
              </p>
            </div>
          </section>

          {/* Archetype match */}
          <section>
            <SectionTitle eyebrow="6. arquétipo cultural" title="distância euclidiana no espaço OCEAN" />
            <p className="text-sm text-muted leading-relaxed mb-4">
              depois que o perfil é calculado, o sistema compara os cinco
              escores do usuário com uma base de personalidades catalogadas
              (figuras históricas e ficcionais, todas na mesma escala 0–100).
              a referência mais próxima é escolhida pela menor distância
              euclidiana no espaço pentadimensional.
            </p>
            <Formula
              tex={String.raw`d(u,\, a) \;=\; \sqrt{\sum_{d \in \{O, C, E, A, N\}} \left(\text{escore}^{u}_{d} - \text{escore}^{a}_{d}\right)^{2}}`}
            />
            <p className="text-xs text-muted leading-relaxed mt-4">
              empates são desfeitos deterministicamente pelo identificador do
              registro. a escolha do arquétipo é <strong className="text-foreground">puramente matemática</strong> —
              o LLM recebe o nome já decidido, sem poder de voto.
            </p>
          </section>

          {/* LLM role */}
          <section>
            <SectionTitle eyebrow="7. o modelo de linguagem" title="orquestrador narrativo, não juiz" />
            <p className="text-sm text-muted leading-relaxed mb-4">
              quando o usuário solicita a leitura narrativa, o sistema monta
              um prompt estruturado em três blocos claramente rotulados e
              envia a um modelo de linguagem de larga escala. o retorno é
              texto em português, devolvido como JSON validado.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
              <div className="border border-border p-4 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">bloco [1]</div>
                <div className="text-xs font-bold uppercase tracking-[0.15em]">quantitativo</div>
                <p className="text-[11px] text-muted leading-relaxed">
                  os cinco escores já calculados, com suas classificações
                  textuais e eventuais tensões internas.
                </p>
              </div>
              <div className="border border-border p-4 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">bloco [2]</div>
                <div className="text-xs font-bold uppercase tracking-[0.15em]">qualitativo</div>
                <p className="text-[11px] text-muted leading-relaxed">
                  respostas interpretativas agrupadas por categoria. texto
                  livre do usuário preservado quando há.
                </p>
              </div>
              <div className="border border-border p-4 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">bloco [3]</div>
                <div className="text-xs font-bold uppercase tracking-[0.15em]">arquetípico</div>
                <p className="text-[11px] text-muted leading-relaxed">
                  nome e universo do arquétipo mais próximo, usado apenas
                  como calibrador de tom.
                </p>
              </div>
            </div>

            <div className="border-l-2 border-foreground/40 pl-4 mt-8 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/70">
                isolamento cálculo–interpretação
              </p>
              <ul className="text-xs text-muted space-y-1.5 leading-relaxed">
                <li>— nenhuma saída do LLM retroalimenta o motor de cálculo</li>
                <li>— se a IA falhar, o perfil numérico permanece acessível</li>
                <li>— a narrativa é efêmera: não é persistida no banco</li>
                <li>— o mesmo perfil pode gerar textos diferentes — a narrativa é <strong className="text-foreground">não-determinística por natureza</strong></li>
              </ul>
            </div>
          </section>

          {/* Per-answer transparency */}
          <section>
            <SectionTitle eyebrow="8. auditabilidade resposta a resposta" title="ver qual pergunta empurrou qual traço" />
            <p className="text-sm text-muted leading-relaxed mb-6">
              o perfil é uma soma de trinta pequenas decisões. em uma tela
              dedicada de revisão, você pode percorrer as suas respostas do
              BFI-2-S uma a uma e ver, para cada item, o traço que ela alimenta
              e o sentido da contribuição (positiva ou negativa, conforme a
              chave direta ou reversa definida pelo instrumento).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-foreground/60 p-5 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">o que a tela mostra</div>
                <h3 className="text-sm font-bold uppercase tracking-[0.15em]">influência por resposta</h3>
                <p className="text-xs text-muted leading-relaxed">
                  o enunciado da pergunta, a sua escolha na escala Likert, o
                  traço ligado àquele item e um marcador qualitativo do sentido
                  da contribuição ao escore final.
                </p>
              </div>
              <div className="border border-border p-5 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">o que a tela não faz</div>
                <h3 className="text-sm font-bold uppercase tracking-[0.15em]">perfil imutável</h3>
                <p className="text-xs text-muted leading-relaxed">
                  revisar não recalcula nada. o perfil objetivo é calculado uma
                  única vez a partir de todas as respostas, persistido e nunca
                  reescrito — a tela de revisão é só uma lente de auditoria.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted/70 leading-relaxed mt-6 italic">
              a intenção aqui é transparência, não editabilidade: você pode
              concordar ou discordar da leitura, mas o retrato do instante em
              que você respondeu permanece intacto.
            </p>
          </section>

          {/* Sharing & export */}
          <section>
            <SectionTitle eyebrow="9. compartilhamento" title="publicação opt-in e exportação em PDF" />
            <div className="space-y-4 text-sm text-muted leading-relaxed">
              <p>
                ao ver o resultado, o usuário pode — se quiser — publicá-lo em
                uma URL pública no formato{' '}
                <code className="text-foreground bg-surface/80 px-1.5 py-0.5 text-[11px] border border-border/60">
                  /r/&lt;token&gt;
                </code>. o token é um{' '}
                <strong className="text-foreground">UUID distinto do identificador da sessão</strong> —
                publicar nunca expõe o id interno de quem respondeu, e a página
                pública é estritamente read-only (sem botões de regerar, nova
                sessão ou exportar).
              </p>
              <p>
                o estado default é <em>privado</em>. nada vaza sem uma ação
                explícita. a qualquer momento o usuário pode tornar o link
                privado novamente, invalidando a visualização pública.
              </p>
              <p>
                a exportação em PDF acontece inteiramente{' '}
                <strong className="text-foreground">no navegador</strong>, via{' '}
                <em>pdfmake</em>. nenhum dado sai da máquina do usuário para
                nenhum serviço de impressão: o documento é montado em memória e
                baixado diretamente. quando há um link público ativo, um QR code
                é embutido no rodapé do PDF para ponte entre papel e tela.
              </p>
            </div>
          </section>

          {/* Boundaries */}
          <section>
            <SectionTitle eyebrow="10. limites" title="o que o thy.self não é" />
            <div className="space-y-3">
              {[
                { label: 'não é diagnóstico clínico', text: 'nenhum escore deste sistema sugere, aproxima-se ou substitui uma avaliação psicológica ou psiquiátrica profissional.' },
                { label: 'não é um instrumento novo', text: 'o thy.self reutiliza o BFI-2-S; não propõe nem valida novos itens psicométricos.' },
                { label: 'não é uma verdade sobre você', text: 'é um retrato comportamental de um instante — baseado em 30 afirmações que você respondeu em minutos.' },
                { label: 'não coleta dados pessoais', text: 'a sessão é anônima por design. não há cadastro, e-mail, cookie de rastreamento ou identidade persistente. publicar o resultado é opt-in e usa um token distinto da sessão.' },
              ].map((item) => (
                <div key={item.label} className="border border-border p-4 md:p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2">{item.label}</p>
                  <p className="text-xs text-muted leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* References */}
          <section>
            <SectionTitle eyebrow="11. referências" title="de onde vem cada decisão" />
            <div className="space-y-2 text-[11px] md:text-xs text-muted leading-relaxed">
              <p>
                <strong className="text-foreground">SOTO, C. J.; JOHN, O. P.</strong> The next Big Five Inventory (BFI-2):
                developing and assessing a hierarchical model with 15 facets to enhance bandwidth, fidelity, and predictive power.
                <em> Journal of Personality and Social Psychology</em>, v. 113, n. 1, p. 117–143, 2017.
              </p>
              <p>
                <strong className="text-foreground">JOHN, O. P.; SRIVASTAVA, S.</strong> The Big Five trait taxonomy:
                history, measurement, and theoretical perspectives. In: PERVIN, L. A.; JOHN, O. P. (ed.).
                <em> Handbook of Personality: theory and research</em>. 2. ed. New York: Guilford Press, 1999. p. 102–138.
              </p>
              <p>
                <strong className="text-foreground">McCRAE, R. R.; COSTA, P. T.</strong> Conceptions and correlates of
                openness to experience. In: HOGAN, R.; JOHNSON, J.; BRIGGS, S. (ed.).
                <em> Handbook of Personality Psychology</em>. San Diego: Academic Press, 1997. p. 825–847.
              </p>
              <p>
                <strong className="text-foreground">McCRAE, R. R.; JOHN, O. P.</strong> An introduction to the five-factor
                model and its applications. <em>Journal of Personality</em>, v. 60, n. 2, p. 175–215, 1992.
              </p>
              <p>
                <strong className="text-foreground">HAN, J.; KAMBER, M.; PEI, J.</strong>{' '}
                <em>Data Mining: Concepts and Techniques</em>. 3. ed. Morgan Kaufmann, 2011.
              </p>
              <p>
                <strong className="text-foreground">GOLDBERG, L. R.</strong> The structure of phenotypic personality
                traits. <em>American Psychologist</em>, v. 48, n. 1, p. 26–34, 1993.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4 border-t border-border pt-12">
            <Link
              href="/"
              className="border border-foreground px-8 py-3 text-[11px] uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
            >
              começar a avaliação
            </Link>
            <Link
              href="/about"
              className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors"
            >
              sobre o projeto →
            </Link>
          </section>

        </article>
      </main>
    </div>
  );
}
