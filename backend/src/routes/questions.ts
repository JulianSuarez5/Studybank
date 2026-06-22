import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { specialty, topic, search } = req.query;
    let sql = 'SELECT * FROM questions WHERE user_id = $1';
    const params: any[] = [req.userId!];
    let paramIdx = 2;

    if (specialty) { sql += ` AND specialty = $${paramIdx++}`; params.push(specialty); }
    if (topic) { sql += ` AND topic = $${paramIdx++}`; params.push(topic); }
    if (search) { sql += ` AND (statement ILIKE $${paramIdx++} OR explanation ILIKE $${paramIdx++})`; params.push(`%${search}%`, `%${search}%`); }

    sql += ' ORDER BY created_at DESC';

    const questions = await db.prepare(sql).all(...params);
    const parsed = questions.map((q: any) => ({ ...q, options: JSON.parse(q.options) }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic, subtopic, specialty, statement, options, correct_answer, explanation } = req.body;

    const existing = await db.prepare('SELECT id FROM questions WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId!);
    if (!existing) return res.status(404).json({ error: 'Pregunta no encontrada' });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (topic !== undefined) { updates.push(`topic = $${idx++}`); params.push(topic); }
    if (subtopic !== undefined) { updates.push(`subtopic = $${idx++}`); params.push(subtopic); }
    if (specialty !== undefined) { updates.push(`specialty = $${idx++}`); params.push(specialty); }
    if (statement !== undefined) { updates.push(`statement = $${idx++}`); params.push(statement); }
    if (options !== undefined) { updates.push(`options = $${idx++}`); params.push(JSON.stringify(options)); }
    if (correct_answer !== undefined) { updates.push(`correct_answer = $${idx++}`); params.push(correct_answer); }
    if (explanation !== undefined) { updates.push(`explanation = $${idx++}`); params.push(explanation); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = $${idx}`).run(...params);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const existing = await db.prepare('SELECT id FROM questions WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId!);
    if (!existing) return res.status(404).json({ error: 'Pregunta no encontrada' });

    await db.prepare('DELETE FROM exam_answers WHERE question_id = $1').run(req.params.id);
    await db.prepare('DELETE FROM flashcards WHERE question_id = $1').run(req.params.id);
    await db.prepare('DELETE FROM questions WHERE id = $1').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/specialties', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = await db.prepare(
      'SELECT DISTINCT specialty FROM questions WHERE user_id = $1 AND specialty != \'\' ORDER BY specialty'
    ).all(req.userId!);
    res.json(rows.map((r: any) => r.specialty));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/topics', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { specialty } = req.query;
    let sql = 'SELECT DISTINCT topic FROM questions WHERE user_id = $1 AND topic != \'\'';
    const params: any[] = [req.userId!];
    if (specialty) { sql += ' AND specialty = $2'; params.push(specialty); }
    sql += ' ORDER BY topic';

    const rows = await db.prepare(sql).all(...params);
    res.json(rows.map((r: any) => r.topic));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
