/**
 * PRNG determinístico (mulberry32) para substituir Math.random nos testes
 * que envolvem sorteio: o teste fica reprodutível sem perder a propriedade
 * estatística que está sendo verificada.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
