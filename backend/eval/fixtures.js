/**
 * Perfis fixos para avaliação do prompt.
 *
 * São sintéticos e propositalmente contrastantes: um perfil tensionado, um
 * coerente e um com estilo de resposta marcante. Manter fixos é o ponto —
 * variar o prompt com o input constante é o que permite atribuir a diferença
 * ao prompt, e não ao acaso do perfil.
 *
 * Todos incluem ao menos uma REFLEXÃO livre, porque a citação de reflexão é
 * um dos contratos medidos.
 */

function dims(scores, levels) {
  return Object.keys(scores).map(key => ({
    key,
    score: scores[key],
    level: levels[key],
  }));
}

export const PROFILES = [
  {
    id: 'tensionado',
    description: 'Abertura alta, conscienciosidade baixa, neuroticismo alto; tensão em N e C.',
    profile: (() => {
      const scores = { O: 75, C: 29.2, E: 45.8, A: 58.3, N: 70.8 };
      return {
        scores,
        dimensions: dims(scores, {
          O: 'alto', C: 'baixo', E: 'moderado', A: 'moderado', N: 'alto',
        }),
      };
    })(),
    consistency: {
      O: { stddev: 0.98, tension: false },
      C: { stddev: 1.51, tension: true },
      E: { stddev: 1.12, tension: false },
      A: { stddev: 1.04, tension: false },
      N: { stddev: 1.63, tension: true },
    },
    responseStyle: {
      answer_count: 30, extreme_count: 17, extreme_rate: 0.57,
      neutral_count: 2, neutral_rate: 0.07,
      agree_direct_rate: 0.55, agree_reverse_rate: 0.3,
      acquiescence: false, hesitation: null,
    },
    archetype: { name: 'Jesse Pinkman', universe: 'Breaking Bad', distance: 14.2 },
    antiArchetype: { name: 'Mr. Spock', universe: 'Star Trek', distance: 76.5 },
    interpretativeSignals: [
      {
        category_slug: 'moral_dilemma',
        question_text: 'Você é gerente e precisa demitir um funcionário. Ele é competente, mas a empresa precisa cortar custos. O que você faz?',
        question_context: 'Você sabe que ele tem uma família para sustentar.',
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Adio a decisão o máximo possível — não consigo lidar com isso.',
        user_observation: null,
      },
      {
        category_slug: 'paradoxical',
        question_text: 'Você prefere uma vida longa e mediana ou uma vida curta e extraordinária?',
        question_context: null,
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Curta e extraordinária — intensidade importa mais que duração.',
        user_observation: null,
      },
      {
        category_slug: 'interest',
        question_text: 'O que te faz perder a noção do tempo?',
        question_context: null,
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Criar algo — desenhar, programar, escrever, construir.',
        user_observation: null,
      },
      {
        category_slug: 'moral_dilemma',
        question_text: 'Conte uma vez em que você escolheu o caminho mais fácil sabendo que não era o certo — o que isso revelou sobre você?',
        question_context: 'Pense no momento exato, na racionalização interna.',
        question_type: 'reflection',
        is_reflection: true,
        alternative_text: null,
        user_observation: 'deixei um amigo levar a culpa por um atraso que foi meu. fiquei quieto na reunião inteira e depois inventei que não tinha percebido.',
      },
    ],
  },

  {
    id: 'coerente',
    description: 'Conscienciosidade alta, neuroticismo baixo, sem tensões.',
    profile: (() => {
      const scores = { O: 54.2, C: 83.3, E: 37.5, A: 70.8, N: 20.8 };
      return {
        scores,
        dimensions: dims(scores, {
          O: 'moderado', C: 'muito_alto', E: 'baixo', A: 'alto', N: 'baixo',
        }),
      };
    })(),
    consistency: {
      O: { stddev: 0.82, tension: false },
      C: { stddev: 0.61, tension: false },
      E: { stddev: 0.9, tension: false },
      A: { stddev: 0.75, tension: false },
      N: { stddev: 0.68, tension: false },
    },
    responseStyle: {
      answer_count: 30, extreme_count: 4, extreme_rate: 0.13,
      neutral_count: 11, neutral_rate: 0.37,
      agree_direct_rate: 0.6, agree_reverse_rate: 0.25,
      acquiescence: false, hesitation: null,
    },
    archetype: { name: 'Hermione Granger', universe: 'Harry Potter', distance: 11.8 },
    antiArchetype: { name: 'Tyler Durden', universe: 'Clube da Luta', distance: 81.3 },
    interpretativeSignals: [
      {
        category_slug: 'moral_dilemma',
        question_text: 'Você encontra uma carteira com uma grande quantia de dinheiro e o documento do dono. O que você faz?',
        question_context: 'Você está passando por dificuldades financeiras.',
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Procuro o dono e devolvo tudo, sem pensar duas vezes.',
        user_observation: null,
      },
      {
        category_slug: 'paradoxical',
        question_text: 'É melhor ser amado ou respeitado?',
        question_context: 'Considere que você não pode ter os dois na mesma intensidade.',
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Respeitado — respeito é duradouro, amor é volátil.',
        user_observation: null,
      },
      {
        category_slug: 'interest',
        question_text: 'Qual cenário de fim de semana te parece mais atraente?',
        question_context: null,
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Uma tarde lendo ou meditando em um lugar tranquilo.',
        user_observation: null,
      },
      {
        category_slug: 'interest',
        question_text: 'Qual fracasso na sua vida mais te ensinou sobre quem você realmente é?',
        question_context: 'Aquele momento onde o ego se quebrou para revelar a estrutura por baixo.',
        question_type: 'reflection',
        is_reflection: true,
        alternative_text: null,
        user_observation: 'estudei um ano inteiro para uma prova e passei raspando. entendi que eu confundia esforço com resultado, e que planejar demais era minha forma de evitar o risco.',
      },
    ],
  },

  {
    id: 'extremista',
    description: 'Escores medianos, mas estilo de resposta marcante (extremos + aquiescência + hesitação).',
    profile: (() => {
      const scores = { O: 62.5, C: 50, E: 66.7, A: 41.7, N: 54.2 };
      return {
        scores,
        dimensions: dims(scores, {
          O: 'alto', C: 'moderado', E: 'alto', A: 'moderado', N: 'moderado',
        }),
      };
    })(),
    consistency: {
      O: { stddev: 1.44, tension: true },
      C: { stddev: 1.1, tension: false },
      E: { stddev: 1.38, tension: true },
      A: { stddev: 1.19, tension: false },
      N: { stddev: 1.05, tension: false },
    },
    responseStyle: {
      answer_count: 30, extreme_count: 23, extreme_rate: 0.77,
      neutral_count: 0, neutral_rate: 0,
      agree_direct_rate: 0.78, agree_reverse_rate: 0.72,
      acquiescence: true,
      hesitation: {
        question_text: 'Eu sou alguém que… confia nas outras pessoas.',
        seconds: 47.5,
        median_seconds: 6.2,
      },
    },
    archetype: { name: 'Tony Stark', universe: 'Marvel', distance: 16.9 },
    antiArchetype: { name: 'Fred Rogers', universe: 'Mister Rogers', distance: 72.1 },
    interpretativeSignals: [
      {
        category_slug: 'moral_dilemma',
        question_text: 'A humanidade é fundamentalmente egoísta ou boa?',
        question_context: 'Considere atitudes perante tragédias versus atitudes no trânsito diário.',
        question_type: 'binary',
        is_reflection: false,
        alternative_text: 'Egoísta',
        user_observation: null,
      },
      {
        category_slug: 'paradoxical',
        question_text: 'Se todos pensassem exatamente como você, o mundo seria melhor ou pior?',
        question_context: null,
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Melhor — minhas ideias e valores melhorariam tudo.',
        user_observation: null,
      },
      {
        category_slug: 'interest',
        question_text: 'Se você pudesse dominar uma habilidade instantaneamente, qual seria?',
        question_context: null,
        question_type: 'multiple_choice',
        is_reflection: false,
        alternative_text: 'Oratória e persuasão — influenciar pessoas com palavras.',
        user_observation: null,
      },
      {
        category_slug: 'paradoxical',
        question_text: 'Se você pudesse saber a data e hora em que vai morrer, você iria querer saber? Por quê?',
        question_context: 'Considere o peso psicológico da contagem regressiva.',
        question_type: 'reflection',
        is_reflection: true,
        alternative_text: null,
        user_observation: 'queria sim. odeio não controlar as coisas, e pelo menos eu poderia organizar tudo antes em vez de deixar bagunça pros outros.',
      },
    ],
  },
];
