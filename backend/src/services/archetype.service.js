import { supabase } from '../config/supabase.js';

async function callArchetypeRpc(fnName, profileScores) {
    try {
        // Chama a função matemática que vive dentro do banco de dados PostgreSQL
        const { data, error } = await supabase.rpc(fnName, {
            user_o: profileScores.O,
            user_c: profileScores.C,
            user_e: profileScores.E,
            user_a: profileScores.A,
            user_n: profileScores.N
        });

        if (error) throw error;

        return data && data.length > 0 ? data[0] : null;

    } catch (error) {
        console.error(`[DEV] Erro ao buscar arquétipo no Supabase (${fnName}):`, error);
        return null;
    }
}

/** O personagem mais PRÓXIMO do perfil (RF005). */
export const findClosestArchetype = (profileScores) =>
    callArchetypeRpc('find_closest_archetype', profileScores);

/**
 * O personagem mais DISTANTE do perfil — o "anti-arquétipo".
 * Requer migration_008; sem ela, retorna null (degradação graciosa).
 */
export const findFarthestArchetype = (profileScores) =>
    callArchetypeRpc('find_farthest_archetype', profileScores);
