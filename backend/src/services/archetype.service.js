import { supabase } from '../config/supabase.js';

export const findClosestArchetype = async (profileScores) => {
    try {
        // Chama a função matemática que vive dentro do banco de dados PostgreSQL
        const { data, error } = await supabase.rpc('find_closest_archetype', {
            user_o: profileScores.O,
            user_c: profileScores.C,
            user_e: profileScores.E,
            user_a: profileScores.A,
            user_n: profileScores.N
        });

        if (error) throw error;

        // Retorna apenas o campeão (o mais próximo)
        return data && data.length > 0 ? data[0] : null;

    } catch (error) {
        console.error("[DEV] Erro ao buscar arquétipo no Supabase:", error);
        return null;
    }
};
