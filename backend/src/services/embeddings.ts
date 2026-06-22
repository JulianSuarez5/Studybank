import { getDb } from '../database';

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
    .filter(t => !['que', 'con', 'por', 'para', 'los', 'las', 'del', 'una', 'como', 'más', 'pero', 'sus'].includes(t));
}

function buildVector(tokens: string[], vocabulary: Map<string, number>): number[] {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Array(vocabulary.size).fill(0);
  for (const [token, count] of tf) {
    const idx = vocabulary.get(token);
    if (idx !== undefined) vec[idx] = 1 + Math.log10(count);
  }
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function buildAndStoreEmbeddings(userId: number): Promise<void> {
  const db = getDb();

  await db.prepare('DELETE FROM embeddings WHERE user_id = $1').run(userId);

  const questions = await db.prepare('SELECT id, statement, explanation, topic FROM questions WHERE user_id = $1').all(userId);
  const concepts = await db.prepare('SELECT id, concept, definition, topic FROM key_concepts WHERE user_id = $1').all(userId);
  const summaries = await db.prepare('SELECT id, title, content, topic FROM summaries WHERE user_id = $1').all(userId);
  const flashcards = await db.prepare('SELECT id, front, back, topic FROM flashcards WHERE user_id = $1').all(userId);

  const allTexts: string[] = [];
  const allMeta: { sourceType: string; sourceId: number; content: string }[] = [];

  for (const q of questions as any[]) {
    const text = `${q.statement} ${q.explanation || ''} ${q.topic || ''}`;
    allTexts.push(text);
    allMeta.push({ sourceType: 'question', sourceId: q.id, content: text });
    if (q.explanation) {
      allTexts.push(q.explanation);
      allMeta.push({ sourceType: 'explanation', sourceId: q.id, content: q.explanation });
    }
  }
  for (const c of concepts as any[]) {
    const text = `${c.concept} ${c.definition || ''} ${c.topic || ''}`;
    allTexts.push(text);
    allMeta.push({ sourceType: 'concept', sourceId: c.id, content: text });
  }
  for (const s of summaries as any[]) {
    const text = `${s.title} ${s.content} ${s.topic || ''}`;
    const chunks = chunkText(text, 500);
    for (const chunk of chunks) {
      allTexts.push(chunk);
      allMeta.push({ sourceType: 'summary', sourceId: s.id, content: chunk });
    }
  }
  for (const f of flashcards as any[]) {
    const text = `${f.front} ${f.back} ${f.topic || ''}`;
    allTexts.push(text);
    allMeta.push({ sourceType: 'flashcard', sourceId: f.id, content: text });
  }

  if (allTexts.length === 0) return;

  const vocabulary = new Map<string, number>();
  const df = new Map<string, number>();
  for (const text of allTexts) {
    const uniqueTokens = new Set(tokenize(text));
    for (const t of uniqueTokens) df.set(t, (df.get(t) || 0) + 1);
  }
  let idx = 0;
  for (const [token, freq] of df) {
    if (freq > 1 && freq < allTexts.length * 0.9) vocabulary.set(token, idx++);
  }

  for (let i = 0; i < allTexts.length; i++) {
    const tokens = tokenize(allTexts[i]);
    const vec = buildVector(tokens, vocabulary);
    await db.prepare(
      'INSERT INTO embeddings (user_id, source_type, source_id, content, vector) VALUES ($1, $2, $3, $4, $5)'
    ).run(userId, allMeta[i].sourceType, allMeta[i].sourceId, allMeta[i].content, JSON.stringify(vec));
  }
}

export async function searchSimilar(userId: number, query: string, topK: number = 5): Promise<{ sourceType: string; sourceId: number; content: string; score: number }[]> {
  const db = getDb();
  const allRows = await db.prepare('SELECT * FROM embeddings WHERE user_id = $1').all(userId) as any[];
  if (allRows.length === 0) return [];

  const queryTokens = tokenize(query);
  let sampleVec: number[];
  try { sampleVec = JSON.parse(allRows[0].vector); } catch { return []; }
  const vocabulary = new Map<string, number>();
  for (let i = 0; i < sampleVec.length; i++) vocabulary.set(String(i), i);

  const queryVec = buildVector(queryTokens, vocabulary);
  if (queryVec.every(v => v === 0)) return [];

  const scored: { sourceType: string; sourceId: number; content: string; score: number }[] = [];
  for (const row of allRows) {
    let vec: number[];
    try { vec = JSON.parse(row.vector); } catch { continue; }
    scored.push({
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content,
      score: cosineSimilarity(queryVec, vec),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK).filter(r => r.score > 0.05);
}

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
