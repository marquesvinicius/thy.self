ALTER TABLE questions ADD COLUMN type VARCHAR(30) DEFAULT 'multiple_choice';

ALTER TABLE answers ADD COLUMN answer_type VARCHAR(30) DEFAULT 'alternative_id';
ALTER TABLE answers ADD COLUMN rank_position INTEGER;
ALTER TABLE answers ADD COLUMN slider_value NUMERIC(5,2);
ALTER TABLE answers ADD COLUMN user_observation TEXT;

ALTER TABLE answers ALTER COLUMN alternative_id DROP NOT NULL;
