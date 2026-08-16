# Harness de avaliação do prompt interpretativo

Mede **aderência a contratos objetivos** do prompt em execuções repetidas contra perfis fixos.
Não mede qualidade literária — mede o que dá para verificar por código.

Existe porque a partir da terceira rodada de ajuste de prompt o retorno começou a cair e o risco
de regressão a subir: uma alteração de tom passou despercebida até um teste manual detectá-la.
Sem medição, cada mudança de prompt é palpite.

## Uso

```bash
node eval/run.mjs                       # 2 execuções por perfil
node eval/run.mjs --runs 4              # 4 execuções por perfil (12 chamadas)
node eval/run.mjs --profile tensionado  # um perfil só
node eval/run.mjs --runs 4 --ab         # compara duas variantes de prompt
node eval/run.mjs --out eval/x.json     # salva o bruto
```

Cada execução é **uma chamada ao Gemini** (mais uma eventual repetição quando a reflexão não é
citada). `--ab` dobra o total. O limitador diário (`LLM_DAILY_LIMIT`, padrão 50) vale aqui também.

## Arquivos

| Arquivo | Papel |
|---|---|
| `fixtures.js` | 3 perfis fixos e contrastantes (tensionado, coerente, extremista), cada um com reflexão livre |
| `metrics.js` | Métricas puras — testadas em `test/eval-metrics.test.js` |
| `run.mjs` | Runner, agregação e impressão do relatório |

Os perfis são **fixos de propósito**: variar o prompt com o input constante é o que permite
atribuir a diferença ao prompt, e não ao acaso do perfil.

## Como rodar um novo A/B

1. Marque a variante no `llm.service.js` com um gatilho de env (ex.: `process.env.PROMPT_X === '1'`).
2. Ajuste `variants` no `run.mjs` para setar essa env por variante (o import já tem cache-buster).
3. Rode com `--runs 4 --ab` e compare.
4. **Registre o resultado aqui** e remova o gatilho do código — não deixe branch experimental morto.

## Métricas

| Métrica | Direção | O que captura |
|---|---|---|
| `second_person` | ↑ | Usa "você" e não usa jargão de laudo ("o usuário", "o perfil exibe") |
| `cites_reflection` | ↑ | Cita a reflexão livre (contrato com retry no serviço) |
| `score_evidence` | ↑ | Ancora em escore numérico (`72%`) |
| `has_quote` | ↑ | Tem citação literal entre aspas |
| `banned_construction` | ↓ | Padrão de aforismo "não é X, é Y" — causou a regressão de tom da v2.0.x |
| `vibe_copies_example` | ↓ | O `vibe_resumo` copia o few-shot em vez de derivar do perfil |
| `motivo_overlap_mean` | ↓ | Sobreposição léxica (Jaccard) entre os 3 "motivos" |
| `repetition_index` | ↓ | Repetição de referências entre execuções do mesmo perfil |
| `cliche_refs` | ↓ | Nomes da lista de clichês (apenas contados — não há banimento no parser) |
| `fallback_refs` | ↓ | Motivos gerados por template determinístico, não pela IA |
| `ends_on_evidence` | ↑ | Heurística fraca (última frase tem número/citação/nome próprio) — **a menos confiável da lista** |

## Resultados registrados

### 2026-07-27 — exemplos concretos de léxico: **REJEITADO**

Hipótese: reintroduzir `(ex.: "intensidade", "visão", "ambição")` na regra de léxico distinto
melhoraria a diversidade dos "motivos", como no prompt pré-2.0.0.

n = 12 gerações por variante (3 perfis × 4 execuções).

| Métrica | sem exemplos | com exemplos |
|---|---|---|
| sobreposição léxica média | **0.070** | 0.146 |
| sobreposição — pior par | **0.210** | 0.433 |
| vibe copia o exemplo | **8%** | **42%** |
| repetição entre execuções | **0.222** | 0.333 |
| refs por fallback | **8** | 13 |

**Conclusão: não aplicar.** Isolando as gerações sem fallback (onde o léxico é 100% da IA), a
sobreposição foi **0.017 sem exemplos vs 0.014 com exemplos** — estatisticamente idêntico. Ou seja,
os exemplos **não melhoram** aquilo que deveriam melhorar: a diversidade léxica dos motivos gerados
pela IA já era praticamente zero, não havia problema a corrigir.

Em compensação, o efeito de ancoragem é grande e inequívoco: a cópia literal do few-shot no
`vibe_resumo` saltou de 8% para 42%. Acrescentar material de exemplo ao prompt parece empurrar o
modelo para o modo "imitar o texto dado" de forma geral, não só no ponto onde o exemplo foi inserido.

### 2026-07-27 — dois bugs de produção encontrados pelo harness

O A/B acima expôs que **22% das referências exibidas ao usuário eram fallback determinístico**
(nomes enlatados do código), não curadoria da IA. Duas causas, ambas corrigidas:

1. **`responseSchema` sem `minItems`.** O modelo às vezes devolvia 2 referências; o schema aceitava,
   e `normalizeReferences` preenchia a terceira em silêncio. Corrigido com `minItems: 3, maxItems: 3`
   em `referencias` e `obras_culturais`.
2. **`motivo: ""` descartava a referência inteira.** O filtro `ref.nome && ref.motivo` jogava fora o
   **nome** curado pela IA por causa de um texto vazio. Agora o nome é preservado e só o motivo é
   preenchido por template.

Efeito combinado (n=12): referências por fallback **8 → 3** de 36, e as 3 restantes mantêm o nome
escolhido pela IA. Sobreposição léxica média **0.070 → 0.014**.

### 2026-07-28 — raciocínio antes do nome (âncora → critério → nome): **mantido, com ressalva**

Mudança: o schema passou a exigir `ancora` (resposta real do usuário) e `criterio` (comportamento)
**antes** de `nome` — como o modelo gera na ordem declarada, ele precisa partir do usuário para
chegar ao nome. Junto: removida a lista de nomes sugeridos do prompt, `minItems` 3→2 (pode devolver
2 se a terceira não tiver linha honesta) e fallback só abaixo de 2 referências reais.

| Métrica | controle | âncora |
|---|---|---|
| âncora aponta p/ resposta real | — | **92%** |
| nomes da lista sugerida | 28% | **18%** |
| escolha livre da IA | 67% | **73%** |
| repetição entre execuções | 0.278 | **0.210** |
| sobreposição léxica (isolando fallback) | 0.014 | **0.015** (igual) |
| refs clichê | 0 | **2** ✗ |
| gerações degradadas p/ fallback | 1/12 | **3/12** ✗ |
| vibe copia o exemplo | 0% | **17%** ✗ |

**A inversão funciona.** As referências deixaram de orbitar a lista antiga (Feynman/Arendt/Turing)
e passaram a ser específicas: Thomas Shelby, Marina Abramović, Isadora Duncan, Alexander Supertramp
— cada uma ancorada num trecho literal da resposta do usuário.

**Causa-raiz da regressão (diagnosticada com instrumentação):** o modelo devolve **3 referências
completas em 100% das gerações** — com `nome`, `motivo` e `ancora` preenchidos. A perda acontece
*depois*, na validação da Wikipedia, e ela está **funcionando corretamente**: nomes mais específicos
trazem mais alucinação. Exemplo real capturado: `George A. Stillson` (o personagem de *The Dead Zone*
é **Greg** Stillson) — rejeitado com razão.

Hipóteses testadas e **descartadas**:
- *"a busca por título exato é frágil"* — falso: a API REST da Wikipedia segue redirecionamentos.
  `Alexander Supertramp`, `Geralt de Rivia`, `Frank Abagnale Jr.` resolvem normalmente.
- *"referências sem imagem estão sendo descartadas"* — falso: o critério é a **existência do
  verbete**, não da imagem. `Alexander Supertramp` e `Shikamaru Nara` resolvem sem imagem e são
  mantidos (o card usa a inicial como placeholder).

Taxa medida: ~6% das referências são rejeitadas, o que degrada ~25% das gerações (com 3 pedidas,
basta uma falhar). **A decisão em aberto não é como validar, é o que fazer quando a rejeição é
legítima** — ver seção seguinte.

Ressalva de qualidade: o modelo ainda força a terceira referência quando a linha é fraca
(ex.: Babe Ruth ancorado em "criar algo — desenhar, programar"). A opção de devolver 2 foi usada
em 3 de 12 gerações.

### 2026-07-28 — o detector de alucinação tinha falso positivo (bug sério)

Ao instrumentar a opção B, o log mostrou rejeições absurdas: **Atticus Finch, Charles Chaplin,
Howard Hughes, Severus Snape** — todos com verbete. Testados isoladamente, respondem **200 em
150–290 ms**. Três defeitos somados:

1. **Sem `User-Agent`.** A política da Wikimedia exige um descritivo; sem ele o limite de taxa é
   agressivo. Sob a rajada do harness, requisições legítimas eram recusadas.
2. **Timeout de 3 s e sem retry.** Qualquer lentidão virava "não existe".
3. **O pior: timeout e 404 eram tratados como a mesma coisa.** `catch → wiki_found: false`.
   Incerteza de rede era punida como se fosse alucinação, e a referência boa ia para o lixo —
   sendo trocada por nome enlatado.

Correção: `User-Agent` descritivo, timeout 7 s, 1 retry, e principalmente a distinção
`found` / `missing` (404 confirmado nas DUAS línguas) / `unknown` (rede). **Só `missing` rejeita.**

Somado a isso: o modelo erra o TÍTULO do verbete com frequência mesmo acertando a pessoa
(`Eeyore` → chutou `Abelardo (Ursinho Pooh)`). Agora tentamos `wiki_query` **e** o `nome` cru.

Verificação do discriminante:

| Caso | Antes | Agora |
|---|---|---|
| `Atticus Finch` (título certo, sob carga) | rejeitado ✗ | **found** |
| `Eeyore` com `wiki_query` errado | rejeitado ✗ | **found** |
| `George A. Stillson` (alucinação real — é *Greg* Stillson) | rejeitado ✓ | **missing** ✓ |

### Resultado consolidado (n=12)

| Métrica | lista de nomes | âncora + validação corrigida |
|---|---|---|
| refs por fallback enlatado | 3 | **0** |
| referências por geração | 2.75 | **3.00** |
| âncora aponta p/ resposta real | — | **94%** |
| nomes distintos (de 36) | 24 | **29** |
| sobreposição léxica | 0.014 | **0.003** |
| repetição entre execuções | 0.278 | **0.194** |
| 2ª pessoa · cita reflexão · obras 1/1/1 | 100% | **100%** |

Clichês subiram de 0 para 8/36 — **esperado e aceito**: a lista de proibição saiu. A decisão de
produto é que nome famoso não é o problema; caricatura é. Evidência de que a distinção se sustenta:
`Marie Curie` apareceu ancorada em *"estudei um ano inteiro para uma prova e passei raspando…
planejar demais era minha forma de evitar o risco"* — persistência obsessiva ligada a uma confissão
específica, não "inteligente → Curie".

**Próxima métrica a construir:** separar âncora vinda de *resposta* (comportamental) de âncora vinda
de *escore* (risco de caricatura). Hoje `grounded_ancora_rate` agrega as duas.

## Observação em aberto

Nas 12 gerações finais, **12 de 12** `vibe_resumo` usaram a estrutura de contraste ("X, **mas** Y" ou
"X; Y"). Os dois exemplos "bons" do few-shot têm exatamente essa forma. A cópia *literal* está em 0%,
mas a cópia *sintática* é universal — próximo candidato a experimento: variar a forma dos exemplos
(um sem contraste, um com dois verbos) e medir a diversidade sintática.
