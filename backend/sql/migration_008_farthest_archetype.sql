-- Migration 008 — Anti-arquétipo (o personagem mais DISTANTE do perfil)
--
-- Espelho da find_closest_archetype com ORDER BY distance DESC: retorna o
-- personagem do catálogo OSPP mais distante do perfil no espaço OCEAN.
-- Usado como conteúdo de contraste ("no extremo oposto: …") no resultado
-- e como sinal extra no prompt da LLM.
--
-- Execute no Supabase SQL Editor. Enquanto esta função não existir, o
-- backend degrada graciosamente (anti_archetype = null; nada quebra).

CREATE OR REPLACE FUNCTION find_farthest_archetype(user_o float, user_c float, user_e float, user_a float, user_n float)
RETURNS TABLE (id varchar, name varchar, universe varchar, distance float)
LANGUAGE sql
AS $$
  SELECT
    id,
    name,
    universe,
    SQRT(POWER(o_score - user_o, 2) + POWER(c_score - user_c, 2) + POWER(e_score - user_e, 2) + POWER(a_score - user_a, 2) + POWER(n_score - user_n, 2)) as distance
  FROM archetypes
  ORDER BY distance DESC, id ASC
  LIMIT 1;
$$;
