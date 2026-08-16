import {
  createSession as createSessionQuery,
} from '../database/queries/session.queries.js';
import { getAllActiveQuestions } from '../database/queries/question.queries.js';
import { buildQuestionOrder } from '../utils/questionOrder.js';

export async function createSession(nickname) {
  const questions = await getAllActiveQuestions();
  const questionOrder = buildQuestionOrder(questions);
  const session = await createSessionQuery(nickname, questionOrder);
  return {
    session_id: session.id,
    nickname: session.nickname,
    status: session.status,
    created_at: session.created_at,
  };
}
