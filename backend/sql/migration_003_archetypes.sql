-- Migration 003: Create Archetypes Table

CREATE TABLE IF NOT EXISTS archetypes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    universe VARCHAR(255) NOT NULL,
    o_score DECIMAL(4,1) NOT NULL,
    c_score DECIMAL(4,1) NOT NULL,
    e_score DECIMAL(4,1) NOT NULL,
    a_score DECIMAL(4,1) NOT NULL,
    n_score DECIMAL(4,1) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stored Procedure to calculate Euclidean Distance
CREATE OR REPLACE FUNCTION find_closest_archetype(user_o float, user_c float, user_e float, user_a float, user_n float)
RETURNS TABLE (id varchar, name varchar, universe varchar, distance float)
LANGUAGE sql
AS $$
  SELECT 
    id, 
    name, 
    universe,
    -- Calculation of Euclidean Distance natively in Postgres
    SQRT(POWER(o_score - user_o, 2) + POWER(c_score - user_c, 2) + POWER(e_score - user_e, 2) + POWER(a_score - user_a, 2) + POWER(n_score - user_n, 2)) as distance
  FROM archetypes
  ORDER BY distance ASC
  LIMIT 1;
$$;
