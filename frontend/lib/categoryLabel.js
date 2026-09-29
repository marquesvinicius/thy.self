// Nome de exibição das categorias da camada interpretativa (o banco guarda o slug).
const LABELS = {
  moral_dilemma: 'dilema moral',
  paradoxical: 'paradoxo',
  interest: 'preferência',
};

export function categoryLabel(slug) {
  return LABELS[slug] || 'reflexão';
}
