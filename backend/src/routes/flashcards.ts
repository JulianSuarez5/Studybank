import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { topic, specialty, documentId, search, due } = req.query;

    let sql = 'SELECT f.*, d.original_name as document_name FROM flashcards f LEFT JOIN documents d ON d.id = f.document_id WHERE f.user_id = $1';
    const params: any[] = [req.userId!];
    let idx = 2;

    if (topic) { sql += ` AND f.topic = $${idx++}`; params.push(topic); }
    if (specialty) { sql += ` AND f.specialty = $${idx++}`; params.push(specialty); }
    if (documentId) { sql += ` AND f.document_id = $${idx++}`; params.push(Number(documentId)); }
    if (search) { sql += ` AND (f.front ILIKE $${idx++} OR f.back ILIKE $${idx++})`; params.push(`%${search}%`, `%${search}%`); }
    if (due === 'true') { sql += ` AND (f.next_review <= NOW() OR f.next_review IS NULL)`; }

    sql += ' ORDER BY f.next_review ASC NULLS FIRST, f.created_at DESC';

    const cards = await db.prepare(sql).all(...params) as any[];
    res.json(cards);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/specialties', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = await db.prepare(
      "SELECT DISTINCT specialty FROM flashcards WHERE user_id = $1 AND specialty != '' ORDER BY specialty"
    ).all(req.userId!) as any[];
    res.json(rows.map(r => r.specialty));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/topics', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { specialty } = req.query;
    let sql = "SELECT DISTINCT topic FROM flashcards WHERE user_id = $1 AND topic != ''";
    const params: any[] = [req.userId!];
    if (specialty) { sql += ' AND specialty = $2'; params.push(specialty); }
    sql += ' ORDER BY topic';
    const rows = await db.prepare(sql).all(...params) as any[];
    res.json(rows.map(r => r.topic));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;
    const total = (await db.prepare('SELECT COUNT(*)::int as c FROM flashcards WHERE user_id = $1').get(uid)).c;
    const due = (await db.prepare("SELECT COUNT(*)::int as c FROM flashcards WHERE user_id = $1 AND (next_review <= NOW() OR next_review IS NULL)").get(uid)).c;
    const studied = (await db.prepare('SELECT COUNT(*)::int as c FROM flashcards WHERE user_id = $1 AND last_studied IS NOT NULL').get(uid)).c;
    const notStudied = total - studied;
    res.json({ total, due, studied, notStudied });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/study', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { quality } = req.body;
    const q = Math.max(0, Math.min(5, Number(quality)));

    const card = await db.prepare(
      'SELECT * FROM flashcards WHERE id = $1 AND user_id = $2'
    ).get(req.params.id, req.userId!) as any;
    if (!card) return res.status(404).json({ error: 'Flashcard no encontrada' });

    let ef = Number(card.ease_factor) || 2.5;
    let interval = Number(card.interval_days) || 0;
    let reps = Number(card.repetitions_count) || 0;
    let accuracy = Number(card.accuracy_rate) || 0;
    const totalResponses = reps + 1;

    if (q < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.round(interval * ef);
      reps += 1;
    }

    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;

    const isCorrect = q >= 3 ? 1 : 0;
    accuracy = ((accuracy * (totalResponses - 1)) + isCorrect) / totalResponses;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    await db.prepare(`
      UPDATE flashcards SET ease_factor = $1, interval_days = $2, repetitions_count = $3,
        accuracy_rate = $4, last_studied = NOW(), next_review = $5 WHERE id = $6
    `).run(ef, interval, reps, accuracy, nextReview.toISOString(), card.id);

    res.json({
      id: card.id,
      ease_factor: ef,
      interval_days: interval,
      repetitions_count: reps,
      accuracy_rate: accuracy,
      next_review: nextReview.toISOString(),
      quality: q,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const card = await db.prepare('SELECT id FROM flashcards WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId!);
    if (!card) return res.status(404).json({ error: 'Flashcard no encontrada' });

    const { front, back, topic, subtopic, specialty, difficulty, tags } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (front !== undefined) { updates.push(`front = $${idx++}`); params.push(front); }
    if (back !== undefined) { updates.push(`back = $${idx++}`); params.push(back); }
    if (topic !== undefined) { updates.push(`topic = $${idx++}`); params.push(topic); }
    if (subtopic !== undefined) { updates.push(`subtopic = $${idx++}`); params.push(subtopic); }
    if (specialty !== undefined) { updates.push(`specialty = $${idx++}`); params.push(specialty); }
    if (difficulty !== undefined) { updates.push(`difficulty = $${idx++}`); params.push(difficulty); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); params.push(tags); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await db.prepare(`UPDATE flashcards SET ${updates.join(', ')} WHERE id = $${idx}`).run(...params);
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM spaced_repetition WHERE flashcard_id = $1').run(req.params.id);
    await db.prepare('DELETE FROM flashcards WHERE id = $1 AND user_id = $2').run(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
