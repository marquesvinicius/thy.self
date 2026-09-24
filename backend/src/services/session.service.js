import {
  createSession as createSessionQuery,
} from '../database/queries/session.queries.js';
import { getAllActiveQuestions } from '../database/queries/question.queries.js';
import { buildQuestionOrder } from '../utils/questionOrder.js';

/**
 * Cria uma sessão anônima com a ordem de perguntas já materializada.
 *
 * Não recebe e não devolve nenhum dado do usuário: o único identificador é
 * o UUID gerado pelo banco (RNF008/RNF012).
 */
export async function createSession() {
  const questions = await getAllActiveQuestions();
  const questionOrder = buildQuestionOrder(questions);
  const session = await createSessionQuery(questionOrder);
  return {
    session_id: session.id,
    status: session.status,
    created_at: session.created_at,
  };
}
