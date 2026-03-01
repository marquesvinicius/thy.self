import { createSession as createSessionQuery } from '../database/queries/session.queries.js';

export async function createSession(nickname) {
  const session = await createSessionQuery(nickname);
  return {
    session_id: session.id,
    nickname: session.nickname,
    status: session.status,
    created_at: session.created_at,
  };
}
