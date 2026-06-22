import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';

const router = Router();

router.get('/overview', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;

    const totalQuestions = (await db.prepare('SELECT COUNT(*)::int as count FROM questions WHERE user_id = $1').get(uid)).count;
    const totalExams = (await db.prepare('SELECT COUNT(*)::int as count FROM exam_attempts WHERE user_id = $1').get(uid)).count;
    const completedExams = (await db.prepare('SELECT COUNT(*)::int as count FROM exam_attempts WHERE user_id = $1 AND completed_at IS NOT NULL').get(uid)).count;
    const totalAnswered = (await db.prepare('SELECT COUNT(*)::int as count FROM exam_answers ea JOIN exam_attempts e ON e.id = ea.exam_attempt_id WHERE e.user_id = $1 AND ea.is_correct IS NOT NULL').get(uid)).count;
    const totalCorrect = (await db.prepare('SELECT COUNT(*)::int as count FROM exam_answers ea JOIN exam_attempts e ON e.id = ea.exam_attempt_id WHERE e.user_id = $1 AND ea.is_correct = 1').get(uid)).count;
    const totalConcepts = (await db.prepare('SELECT COUNT(*)::int as count FROM key_concepts WHERE user_id = $1').get(uid)).count;
    const totalFlashcards = (await db.prepare('SELECT COUNT(*)::int as count FROM flashcards WHERE user_id = $1').get(uid)).count;

    res.json({
      totalQuestions, totalExams, completedExams, totalAnswered, totalCorrect,
      accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      totalConcepts, totalFlashcards,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-topic', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;
    const data = await db.prepare(`
      SELECT q.topic, COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::int as correct,
        COALESCE(SUM(CASE WHEN ea.is_correct = 0 THEN 1 ELSE 0 END),0)::int as incorrect
      FROM questions q
      LEFT JOIN exam_answers ea ON ea.question_id = q.id
      LEFT JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
      WHERE q.user_id = $2 AND q.topic != ''
      GROUP BY q.topic
      ORDER BY (COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) ASC
    `).all(uid, uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-specialty', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;
    const data = await db.prepare(`
      SELECT q.specialty, COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::int as correct,
        COALESCE(SUM(CASE WHEN ea.is_correct = 0 THEN 1 ELSE 0 END),0)::int as incorrect
      FROM questions q
      LEFT JOIN exam_answers ea ON ea.question_id = q.id
      LEFT JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
      WHERE q.user_id = $2 AND q.specialty != ''
      GROUP BY q.specialty
      ORDER BY (COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) ASC
    `).all(uid, uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evolution', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;
    const data = await db.prepare(`
      SELECT e.id, e.title, e.started_at, e.completed_at, e.total_questions, e.correct_answers,
        CASE WHEN e.total_questions > 0 THEN ROUND((e.correct_answers::float / e.total_questions) * 100) ELSE 0 END as percentage
      FROM exam_attempts e
      WHERE e.user_id = $1 AND e.completed_at IS NOT NULL
      ORDER BY e.completed_at ASC
    `).all(uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/weak-areas', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const uid = req.userId!;

    const weakTopics = await db.prepare(`
      SELECT q.topic, q.specialty, COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::int as correct,
        ROUND((COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) * 100)::int as accuracy
      FROM questions q
      JOIN exam_answers ea ON ea.question_id = q.id
      JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
      WHERE q.user_id = $2 AND q.topic != ''
      GROUP BY q.topic, q.specialty
      HAVING (COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) < 0.6
         OR (COUNT(*) >= 3 AND (COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) < 0.7)
      ORDER BY accuracy ASC
    `).all(uid, uid);

    const weakSpecialties = await db.prepare(`
      SELECT q.specialty, COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::int as correct,
        ROUND((COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) * 100)::int as accuracy
      FROM questions q
      JOIN exam_answers ea ON ea.question_id = q.id
      JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
      WHERE q.user_id = $2 AND q.specialty != ''
      GROUP BY q.specialty
      HAVING (COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::float / NULLIF(COUNT(*),0)) < 0.6
      ORDER BY accuracy ASC
    `).all(uid, uid);

    res.json({ weakTopics, weakSpecialties });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
