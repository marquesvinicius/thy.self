'use client';

import Header from '@/components/Header';
import MysticBackground from '@/components/MysticBackground';
import Link from 'next/link';

const PRINCIPLES = [
  {
    title: 'rigor auditável',
    desc: 'o cálculo é público, a fórmula está na página do método, o instrumento é de domínio público. qualquer pessoa pode reproduzir o resultado no papel.',
  },
  {
    title: 'separação cálculo–interpretação',
    desc: 'o que é matemática fica na matemática. o que é narrativa admite-se como narrativa. nunca há contaminação entre as duas camadas.',
  },
  {
    title: 'anonimato por construção',
    desc: 'a privacidade não é pedida por consentimento — é garantida pela ausência de qualquer campo de identificação na origem do sistema.',
  },
  {
    title: 'jornada linear, deliberada',
    desc: 'sem menus ramificados, sem gamificação, sem urgência artificial. uma única direção: começar, responder, ler.',
  },
  {
    title: 'não-clínico, por princípio',
    desc: 'o thy.self é uma porta de entrada reflexiva, não um laudo. o espaço da clínica pertence aos profissionais da clínica.',
  },
];

const GAPS = [
  {
    label: 'contexto clínico e acadêmico',
    pros: ['instrumento validado', 'interpretação profissional'],
    cons: ['acesso restrito', 'sem experiência digital', 'aplicação presencial'],
  },
  {
    label: 'quizzes populares',
    pros: ['UX envolvente', 'acesso imediato'],
    cons: ['metodologia não divulgada', 'sem auditabilidade pública'],
  },
  {
    label: 'thy.self',
    pros: ['BFI-2-S íntegro', 'cálculo público', 'UX contemplativa', 'IA como narrativa, não como juiz'],
    cons: ['não substitui avaliação clínica'],
    highlight: true,
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

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MysticBackground />
      <Header />

      <main className="flex-1 pt-24 pb-24 px-6 relative z-[1]">
        <article className="max-w-4xl mx-auto space-y-20">

          {/* Hero */}
          <section className="pt-8 space-y-6 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">sobre</p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
              γνῶθι σεαυτόν<br />
              <span className="text-muted">—</span>
            </h1>
            <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
              <em>gnōthi seautón</em>, <strong className="text-foreground">“conhece-te a ti mesmo”</strong> —
              a inscrição que, segundo a tradição, estava gravada no pronaos
              do templo de Apolo em Delfos. por cerca de vinte e oito séculos
              essa frase tem sido dita e redita sem jamais ser concluída.
              o thy.self é mais uma tentativa honesta — digital, dimensional
              e auditável — de caminhar um passo em sua direção.
            </p>
          </section>

          {/* Origin / narrative */}
          <section>
            <SectionTitle eyebrow="origem" title="de Delfos à aritmética" />
            <div className="space-y-4 text-sm md:text-base text-muted leading-relaxed">
              <p>
                o oráculo de Delfos não dizia ao consulente <em>o que ele era</em>.
                devolvia um texto ambíguo, forçava o retorno ao eu e recusava o
                atalho da resposta pronta. durante milênios, reimaginamos essa
                devolução: confessionários, divãs, cartas de tarô, testes de
                revista, quizzes de rede social. o pedido não muda — mudam os
                oráculos.
              </p>
              <p>
                no século XX, a psicologia científica reduziu a descrição
                da personalidade a cinco dimensões contínuas com validação
                transcultural — o modelo <strong className="text-foreground">Big Five</strong>.
                pela primeira vez, foi possível posicionar uma pessoa num espaço
                numérico reproduzível, sem rótulos discretos nem tipologias
                categóricas.
              </p>
              <p>
                e então veio o modelo de linguagem. pela primeira vez, uma
                narrativa coerente pôde ser <em>gerada</em> a partir de dados
                estruturados, em tempo real, em português. o que o oráculo
                devolvia como texto enigmático, hoje pode ser devolvido como
                uma leitura lúcida, comparativa, situada — sem jamais mentir
                sobre de onde veio cada número.
              </p>
              <p>
                o thy.self existe nessa junção: um motor de cálculo transparente
                e uma voz narrativa assumida.
              </p>
            </div>
          </section>

          {/* The gap */}
          <section>
            <SectionTitle eyebrow="o vão" title="entre o rigor acadêmico e o entretenimento digital" />
            <p className="text-sm text-muted leading-relaxed mb-6">
              avaliações de personalidade hoje existem em dois contextos
              bem distintos. de um lado, o rigor científico preservado em
              instrumentos acadêmicos. do outro, a experiência envolvente
              dos quizzes digitais. o thy.self ocupa o espaço intermediário
              — tentando herdar o melhor de cada lado sem adotar as
              limitações de nenhum.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {GAPS.map((g) => (
                <div
                  key={g.label}
                  className={`border p-5 space-y-4 ${
                    g.highlight ? 'border-foreground bg-surface/40' : 'border-border'
                  }`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em]">
                    {g.label}
                  </h3>
                  <div className="space-y-2">
                    {g.pros.map((p, i) => (
                      <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
                        <span className="text-foreground/70">+</span>
                        <span className={g.highlight ? 'text-foreground' : 'text-muted'}>{p}</span>
                      </div>
                    ))}
                    {g.cons.map((c, i) => (
                      <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
                        <span className="text-muted/50">−</span>
                        <span className="text-muted/70">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Principles */}
          <section>
            <SectionTitle eyebrow="princípios" title="os compromissos do projeto" />
            <div className="space-y-3">
              {PRINCIPLES.map((p, i) => (
                <div key={p.title} className="border border-border p-5 flex gap-5">
                  <div className="text-xs font-bold tabular-nums text-muted pt-0.5 w-8 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className="text-sm font-bold uppercase tracking-[0.15em]">
                      {p.title}
                    </h3>
                    <p className="text-xs text-muted leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Author */}
          <section>
            <SectionTitle eyebrow="autor" title="contexto acadêmico" />
            <div className="border border-border p-6 md:p-8 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                trabalho de finalização de curso
              </p>
              <div className="space-y-1">
                <p className="text-base md:text-lg font-bold tracking-tight">
                  Marques Vinícius Melo Martins
                </p>
                <p className="text-xs text-muted">
                  engenharia de software · universidade de Rio Verde (UniRV)
                </p>
                <p className="text-xs text-muted">
                  orientador: prof. Gustavo Martins Lima, esp.
                </p>
              </div>
              <p className="text-xs text-muted leading-relaxed pt-4 border-t border-border/60">
                este projeto é apresentado como exigência parcial para a obtenção
                do título de bacharel em engenharia de software. sua contribuição
                original reside na arquitetura de integração entre instrumento
                psicométrico validado, motor determinístico auditável e síntese
                narrativa orientada por metadados — não em nova contribuição
                psicométrica.
              </p>
            </div>
          </section>

          {/* Disclaimer — destaque forte */}
          <section>
            <div className="relative border-2 border-foreground p-6 md:p-10 bg-surface/70">
              <div className="absolute -top-3 left-6 px-3 bg-background">
                <p className="text-[10px] uppercase tracking-[0.4em] text-foreground font-bold">
                  aviso importante
                </p>
              </div>

              <div className="space-y-5 pt-2">
                <h3 className="text-lg md:text-2xl font-bold tracking-tight leading-snug">
                  este não é um diagnóstico.<br />
                  <span className="text-muted">e nunca pretendeu ser.</span>
                </h3>

                <div className="space-y-3 text-sm md:text-base text-foreground/90 leading-relaxed">
                  <p>
                    o thy.self é uma <strong>ferramenta introdutória de reflexão</strong>.
                    seus resultados <strong>não constituem diagnóstico clínico</strong>,
                    parecer psicológico ou recomendação terapêutica — e não devem
                    ser interpretados como tal em nenhum contexto.
                  </p>
                  <p>
                    se algo aqui mobilizar você a ponto de querer entender melhor —{' '}
                    <strong className="underline decoration-foreground/40 underline-offset-4">
                      procure um profissional de saúde mental qualificado
                    </strong>
                    . nenhum algoritmo, por mais refinado, substitui uma escuta
                    humana treinada.
                  </p>
                </div>

                <div className="pt-4 border-t border-foreground/20 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted">
                  <span>— não é diagnóstico</span>
                  <span>— não é prescrição</span>
                  <span>— não coleta dados pessoais</span>
                  <span>— resultado não persiste identidade</span>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4 border-t border-border pt-12">
            <Link
              href="/"
              className="border border-foreground px-8 py-3 text-[11px] uppercase tracking-[0.3em] hover:bg-foreground hover:text-background transition-all"
            >
              começar
            </Link>
            <Link
              href="/method"
              className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors"
            >
              → ver o método de cálculo
            </Link>
          </section>

        </article>
      </main>
    </div>
  );
}
