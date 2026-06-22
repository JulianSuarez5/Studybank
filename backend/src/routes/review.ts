import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';

const router = Router();

router.get('/flashcards', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic } = req.query;
    let sql = 'SELECT * FROM flashcards WHERE user_id = $1';
    const params: any[] = [req.userId!];
    if (topic) { sql += ' AND topic = $2'; params.push(topic); }
    sql += ' ORDER BY RANDOM()';
    const cards = await db.prepare(sql).all(...params);
    res.json(cards);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/flashcards', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { question_id, front, back, topic } = req.body;
    const result = await db.prepare(
      'INSERT INTO flashcards (question_id, user_id, front, back, topic) VALUES ($1, $2, $3, $4, $5)'
    ).run(question_id || null, req.userId!, front, back, topic || '');
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/flashcards/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM flashcards WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/concepts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic } = req.query;
    let sql = 'SELECT * FROM key_concepts WHERE user_id = $1';
    const params: any[] = [req.userId!];
    if (topic) { sql += ' AND topic = $2'; params.push(topic); }
    sql += ' ORDER BY created_at DESC';
    const concepts = await db.prepare(sql).all(...params);
    res.json(concepts);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/concepts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { concept, definition, topic } = req.body;
    const result = await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(req.userId!, concept, definition || '', topic || '');
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/concepts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM key_concepts WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/summaries', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic } = req.query;
    let sql = 'SELECT * FROM summaries WHERE user_id = $1';
    const params: any[] = [req.userId!];
    if (topic) { sql += ' AND topic = $2'; params.push(topic); }
    sql += ' ORDER BY created_at DESC';
    const summaries = await db.prepare(sql).all(...params);
    res.json(summaries);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/summaries', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { title, content, topic } = req.body;
    const result = await db.prepare(
      'INSERT INTO summaries (user_id, title, content, topic) VALUES ($1, $2, $3, $4)'
    ).run(req.userId!, title, content, topic || '');
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/summaries/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM summaries WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/materials', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic } = req.query;

    const cards = (await db.prepare(
      "SELECT id, front as title, back as content, topic, 'flashcard' as type, created_at FROM flashcards WHERE user_id = $1"
    ).all(req.userId!)) as any[];
    const concepts = (await db.prepare(
      "SELECT id, concept as title, definition as content, topic, 'concept' as type, created_at FROM key_concepts WHERE user_id = $1"
    ).all(req.userId!)) as any[];
    const summaries = (await db.prepare(
      "SELECT id, title, content, topic, 'summary' as type, created_at FROM summaries WHERE user_id = $1"
    ).all(req.userId!)) as any[];

    let all = [...cards, ...concepts, ...summaries];
    if (topic) all = all.filter(item => item.topic === topic);
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(all);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
