# thy.self

Plataforma web de autoconhecimento baseada no modelo Big Five (OCEAN), com
interpretação narrativa gerada por Inteligência Artificial.

Trabalho Final de Curso — Engenharia de Software, Universidade de Rio Verde (UniRV).
Autor: Marques Vinícius Melo Martins · Orientador: Prof. Gustavo Martins Lima ·
Coorientador: Prof. João Dionísio Paraíba.

---

## O problema que este projeto resolve

Testes de personalidade online alcançam dezenas de milhões de pessoas, mas
entregam resultados padronizados: um mesmo conjunto de escores produz sempre o
mesmo texto. Por outro lado, pedir a um modelo de linguagem que "avalie sua
personalidade" produz um texto envolvente e **sem nenhuma garantia numérica** —
não há como saber de onde veio cada afirmação.

O thy.self não escolhe entre os dois. Ele separa as duas coisas.

## Arquitetura dual-core

O nome descreve a decisão central: **os escores e a narrativa nunca são
produzidos pela mesma via.**

```
                    ┌─────────────────────────────────────────┐
   30 itens         │  NÚCLEO OBJETIVO  (determinístico)      │
   BFI-2-S     ───► │  BigFiveEngine — JS puro, sem I/O       │ ───► escores
   (Likert -2..+2)  │  soma por traço → min-max → 0–100       │      OCEAN
                    └─────────────────────────────────────────┘        │
                                                                       │ (só leitura)
                    ┌─────────────────────────────────────────┐        ▼
   perguntas        │  CAMADA INTERPRETATIVA (não-determin.)  │
   autorais    ───► │  Gemini — recebe os escores JÁ PRONTOS  │ ───► narrativa +
   (dilemas,        │  + contexto qualitativo + arquétipo     │      referências
   paradoxos)       └─────────────────────────────────────────┘
```

Três invariantes que o código protege, e que devem ser preservadas em qualquer
alteração:

1. **Só itens `kind = 'objective'` entram na conta.** O motor ignora
   explicitamente qualquer outra resposta (`BigFiveEngine.js`), e o banco
   impede o estado inconsistente por *check constraint*
   (`questions_kind_trait_consistency`).
2. **Nada que sai do LLM volta para o cálculo.** A interpretação é gravada em
   uma coluna separada (`results.llm_interpretation`); os escores são
   persistidos uma vez e são imutáveis.
3. **Mesmas respostas ⇒ mesmos escores.** O motor é uma função pura. Se a IA
   estiver fora do ar, o perfil numérico continua sendo entregue.

## O que o produto entrega

- Avaliação anônima: sem cadastro, sem login, sem nenhum campo de identificação
  pessoal no modelo de dados (o único identificador é um UUID de sessão).
- Perfil OCEAN em escala 0–100 com classificação em cinco níveis.
- Interpretação narrativa com paralelos culturais — referências e obras
  (série/filme/anime) escolhidas a partir das respostas, não do rótulo do traço.
- **Auditabilidade item a item:** uma tela mostra, para cada resposta, qual
  traço ela alimentou e em que sentido (chave direta ou reversa).
- Exportação do resultado em PDF gerada inteiramente no navegador.

## Estrutura do repositório

```
backend/          API Express 5 (Node 22+, ESM)
  src/engine/       motor de cálculo — JS puro, sem I/O, 100% de cobertura
  src/services/     orquestração, LLM, arquétipos, verificação na Wikipedia
  src/routes|controllers|database/queries/
  sql/              migrations numeradas + schema.sql (snapshot canônico)
  seed/             30 itens BFI-2-S + itens interpretativos + arquétipos
  eval/             harness de avaliação do prompt (métricas objetivas)
  test/             suíte do runner nativo do Node
frontend/         Next.js 16 (App Router, React 19, Tailwind v4)
  e2e/              testes ponta-a-ponta (Playwright)
```

## Como rodar

Pré-requisitos: **Node 22+** e um projeto Supabase (PostgreSQL gerenciado).

**1. Banco.** No SQL Editor do Supabase, execute `backend/sql/schema.sql`
(setup limpo). Em um banco já existente, aplique as migrations numeradas em
ordem, de `migration_001` a `migration_011`.

**2. Backend.**

```bash
cd backend
cp .env.example .env      # preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm install
npm run seed              # carga idempotente: perguntas, alternativas, arquétipos
npm run dev               # http://localhost:3000
```

**3. Frontend.**

```bash
cd frontend
npm install
npm run dev               # http://localhost:3001
```

### Variáveis de ambiente (`backend/.env`)

| Variável | Obrigatória | Padrão | Para quê |
|---|---|---|---|
| `SUPABASE_URL` | sim | — | projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | — | acesso ao banco |
| `PORT` | não | `3000` | porta da API |
| `NODE_ENV` | não | `development` | em `production`, exige `ALLOWED_ORIGINS` |
| `ALLOWED_ORIGINS` | em produção | — | origens liberadas no CORS (lista separada por vírgula) |
| `GEMINI_API_KEY` | não | — | sem ela, a interpretação é desligada e o perfil numérico continua |
| `LLM_DAILY_LIMIT` | não | `50` | teto diário de chamadas ao LLM |
| `LLM_LOG_PROMPT` | não | ligado fora de produção | imprime o prompt enviado (auditoria — RNF018) |

O mínimo de 30 itens para liberar o cálculo **não** é configurável por
ambiente: vem do instrumento (RN002), não da operação.

## Testes

```bash
cd backend
npm test                  # suíte nativa do Node
npm run test:coverage     # idem, com relatório de cobertura
npm run lint

cd ../frontend
npm run lint
npm run test:e2e          # Playwright — requer backend em pé e banco populado
```

Há quatro faixas de verificação, com propósitos distintos:

| Faixa | Onde | O que garante |
|---|---|---|
| Unitária | `backend/test/` | o motor de cálculo e o parsing da resposta da IA |
| Integração com dependências simuladas | `backend/test/analyze.service.test.js` | a orquestração do `/analyze` sem tocar no banco |
| Ponta-a-ponta | `frontend/e2e/` | a jornada real do usuário no navegador |
| Avaliação de prompt | `backend/eval/` | aderência da saída do LLM a contratos objetivos |

A última merece explicação: ajustar prompt por impressão é palpite. O harness
roda o mesmo perfil fixo várias vezes e mede critérios verificáveis (uso de
segunda pessoa, citação de resposta real, ancoragem em escore, sobreposição
léxica entre justificativas, repetição entre execuções). Foi assim que uma
hipótese de melhoria foi **rejeitada com dados** — está registrado em
`backend/eval/README.md`.

## Integração contínua

`.github/workflows/ci.yml` roda a cada push e pull request: lint, testes e
cobertura no backend; lint e build de produção no frontend.

## Licença

Código sob **MIT** (ver `LICENSE`).

**Atenção:** os 30 itens do BFI-2-S **não são de domínio público**. São
reutilizados sob os termos de uso livre para pesquisa não-comercial definidos
por Soto e John (2017). Uso comercial exige substituí-los ou licenciá-los em
separado. Os detalhes, incluindo a procedência dos arquétipos culturais, estão
no arquivo `LICENSE`.

## Aviso

O thy.self é uma ferramenta de reflexão, sem finalidade clínica, diagnóstica ou
prescritiva. O resultado não é laudo e não substitui acompanhamento profissional.
