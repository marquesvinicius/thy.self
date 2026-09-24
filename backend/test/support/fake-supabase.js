/**
 * Cliente Supabase falso para testar a camada de queries sem banco.
 *
 * Cada `from(tabela)` devolve um builder encadeável que registra as chamadas
 * (select/eq/order/…) e, ao ser aguardado, resolve com a próxima resposta
 * roteirizada ({ data, error, count }). `rpc()` idem. O teste verifica o que
 * a query FAZ com a resposta (tradução de erro, mapeamento) e os filtros que
 * carregam regra de negócio — não a sintaxe do cliente.
 */
export function createFakeSupabase() {
  const queue = [];
  const log = [];

  const next = () => queue.shift() ?? { data: null, error: null };

  function builder(table) {
    const entry = { table, calls: [] };
    log.push(entry);
    const chain = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = next();
          return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        }
        return (...args) => {
          entry.calls.push([prop, ...args]);
          return chain;
        };
      },
    });
    return chain;
  }

  return {
    client: {
      from: table => builder(table),
      rpc: async (fn, args) => {
        log.push({ rpc: fn, args });
        return next();
      },
    },
    /** Enfileira respostas na ordem em que as queries serão aguardadas. */
    respond(...responses) { queue.push(...responses); },
    log,
    /** Chamadas de um builder, ex.: calls(0) → [['select', '*'], ['eq', 'id', 1]] */
    calls: index => log[index].calls,
    reset() { queue.length = 0; log.length = 0; },
  };
}

export const NO_ROWS = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
