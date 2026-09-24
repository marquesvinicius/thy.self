/**
 * Validação de formato de identificador de sessão.
 *
 * `sessions.id` é UUID v4 gerado pelo Postgres (RNF008). Quando um valor que
 * não é UUID chega até a consulta, o Postgres devolve o erro `22P02`
 * (invalid input syntax for type uuid) — que não é o `PGRST116` tratado como
 * "não encontrado" e, por isso, subia até o handler global e virava
 * **500 Internal Server Error**. Um identificador malformado é erro do
 * cliente, não do servidor: barrando aqui, a resposta correta (400) é
 * devolvida antes de qualquer ida ao banco.
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value.trim());
}
