import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';

const router = Router();

router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const {
      title = 'Simulacro', specialties = [], topics = [],
      numQuestions = 10, wrongQuestions = false, weakTopics = false,
    } = req.body;

    let sql = 'SELECT * FROM questions WHERE user_id = $1';
    const params: any[] = [req.userId!];

    if (specialties.length > 0) {
      sql += ` AND specialty = ANY($${params.length + 1}::text[])`;
      params.push(specialties);
    }

    if (topics.length > 0) {
      sql += ` AND topic = ANY($${params.length + 1}::text[])`;
      params.push(topics);
    }

    if (wrongQuestions) {
      const wrongRows = await db.prepare(`
        SELECT DISTINCT q.id FROM questions q
        JOIN exam_answers ea ON ea.question_id = q.id
        JOIN exam_attempts e ON e.id = ea.exam_attempt_id
        WHERE e.user_id = $1 AND ea.is_correct = 0
      `).all(req.userId!);
      const wrongIds = wrongRows.map((r: any) => r.id);
      if (wrongIds.length > 0) {
        sql += ` AND id = ANY($${params.length + 1}::int[])`;
        params.push(wrongIds);
      }
    }

    if (weakTopics) {
      const weak = await db.prepare(`
        SELECT q.topic, COUNT(*) as total, SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM questions q
        LEFT JOIN exam_answers ea ON ea.question_id = q.id
        LEFT JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
        WHERE q.user_id = $2 AND q.topic != ''
        GROUP BY q.topic
      `).all(req.userId!, req.userId!);
      const weakTopicsList = weak
        .filter((w: any) => Number(w.total) > 2 && (Number(w.correct) / Number(w.total)) < 0.5)
        .map((w: any) => w.topic);
      if (weakTopicsList.length > 0) {
        sql += ` AND topic = ANY($${params.length + 1}::text[])`;
        params.push(weakTopicsList);
      }
    }

    sql += ' ORDER BY RANDOM() LIMIT $' + (params.length + 1);
    params.push(numQuestions);

    const questions = await db.prepare(sql).all(...params);
    const parsed = questions.map((q: any) => ({ ...q, options: JSON.parse(q.options) }));

    const result = await db.prepare(
      'INSERT INTO exam_attempts (user_id, title, config, total_questions) VALUES ($1, $2, $3, $4)'
    ).run(req.userId!, title, JSON.stringify({ specialties, topics, numQuestions, wrongQuestions, weakTopics }), parsed.length);

    res.json({
      attemptId: result.lastInsertRowid,
      title,
      questions: parsed,
      totalQuestions: parsed.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/answer', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { questionId, selectedAnswer } = req.body;

    const question = await db.prepare('SELECT * FROM questions WHERE id = $1 AND user_id = $2').get(questionId, req.userId!);
    if (!question) return res.status(404).json({ error: 'Pregunta no encontrada' });

    const isCorrect = selectedAnswer === question.correct_answer ? 1 : 0;

    const existing = await db.prepare(
      'SELECT id FROM exam_answers WHERE exam_attempt_id = $1 AND question_id = $2'
    ).get(req.params.id, questionId);

    if (existing) {
      await db.prepare('UPDATE exam_answers SET selected_answer = $1, is_correct = $2 WHERE id = $3')
        .run(selectedAnswer, isCorrect, existing.id);
    } else {
      await db.prepare(
        'INSERT INTO exam_answers (exam_attempt_id, question_id, selected_answer, is_correct) VALUES ($1, $2, $3, $4)'
      ).run(req.params.id, questionId, selectedAnswer, isCorrect);
    }

    res.json({
      isCorrect: isCorrect === 1,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const attempt = await db.prepare('SELECT id FROM exam_attempts WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId!);
    if (!attempt) return res.status(404).json({ error: 'Simulacro no encontrado' });

    const stats = await db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(is_correct),0) as correct FROM exam_answers WHERE exam_attempt_id = $1'
    ).get(req.params.id);

    await db.prepare(
      "UPDATE exam_attempts SET correct_answers = $1, completed_at = NOW() WHERE id = $2"
    ).run(Number(stats.correct) || 0, req.params.id);

    res.json({
      total: Number(stats.total),
      correct: Number(stats.correct) || 0,
      percentage: stats.total > 0 ? Math.round((Number(stats.correct) / Number(stats.total)) * 100) : 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const attempts = await db.prepare(
      'SELECT * FROM exam_attempts WHERE user_id = $1 ORDER BY started_at DESC'
    ).all(req.userId!);
    res.json(attempts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const attempt = await db.prepare(
      'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2'
    ).get(req.params.id, req.userId!);
    if (!attempt) return res.status(404).json({ error: 'Simulacro no encontrado' });

    const answers = await db.prepare(`
      SELECT ea.*, q.statement, q.options, q.correct_answer, q.explanation, q.topic, q.subtopic, q.specialty
      FROM exam_answers ea
      JOIN questions q ON q.id = ea.question_id
      WHERE ea.exam_attempt_id = $1
    `).all(req.params.id);

    const parsed = answers.map((a: any) => ({ ...a, options: JSON.parse(a.options) }));
    res.json({ ...attempt, answers: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
