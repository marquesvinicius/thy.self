-- Desativa paradoxos duplicados substituídos por INT_PX_11/12/13.
-- Seguro para sessões antigas: não apaga linhas nem altera texto sob o mesmo id.
-- Espelho do seed (interpretative.json is_active: false).

UPDATE questions
SET is_active = false
WHERE kind = 'interpretative'
  AND external_id IN ('INT_PX_01', 'INT_PX_08', 'INT_PX_09');
