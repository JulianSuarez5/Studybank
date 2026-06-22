import { getDb } from '../database';

export async function addMessage(userId: number, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
  const db = getDb();
  await db.prepare('INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)').run(userId, role, content);
}

export async function getConversationHistory(userId: number, limit: number = 20): Promise<{ role: string; content: string }[]> {
  const db = getDb();
  const messages = await db.prepare(`
    SELECT role, content FROM conversations 
    WHERE user_id = $1 
    ORDER BY id DESC LIMIT $2
  `).all(userId, limit);

  return (messages as any[]).reverse();
}

export async function getRecentContext(userId: number, maxMessages: number = 10): Promise<string> {
  const messages = await getConversationHistory(userId, maxMessages);
  if (messages.length === 0) return '';

  return messages.map(m => {
    const prefix = m.role === 'user' ? 'Usuario' : m.role === 'assistant' ? 'Tutor' : 'Sistema';
    return `${prefix}: ${m.content}`;
  }).join('\n\n');
}

export async function clearConversation(userId: number): Promise<void> {
  const db = getDb();
  await db.prepare('DELETE FROM conversations WHERE user_id = $1').run(userId);
}

export async function getLastUserQuestions(userId: number, limit: number = 5): Promise<string[]> {
  const db = getDb();
  const questions = await db.prepare(`
    SELECT content FROM conversations 
    WHERE user_id = $1 AND role = 'user'
    ORDER BY id DESC LIMIT $2
  `).all(userId, limit);

  return (questions as any[]).map(q => q.content).reverse();
}
