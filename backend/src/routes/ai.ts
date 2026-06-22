import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { processTutorQuery, streamTutorResponse, generateAIExam, generateAIReport, generateStudyPlan, buildUserProfile } from '../services/aiTutor';
import { buildAndStoreEmbeddings } from '../services/embeddings';
import { getCardsDueForReview, getCardStats, updateSpacedRepetition } from '../services/sm2';
import { getConversationHistory, clearConversation } from '../services/conversationMemory';
import { getDb } from '../database';

const router = Router();

router.post('/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Consulta requerida' });
    const result = await processTutorQuery(req.userId!, query);
    res.json(result);
  } catch (err: any) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat/stream', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Consulta requerida' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    await streamTutorResponse(req.userId!, query, (chunk: string) => {
      if (aborted) return;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    });
    if (!aborted) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err: any) {
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

router.post('/rebuild-embeddings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await buildAndStoreEmbeddings(req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await buildUserProfile(req.userId!);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/conversation', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const history = await getConversationHistory(req.userId!);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/conversation', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await clearConversation(req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/exam/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const exam = await generateAIExam(req.userId!, req.body);
    res.json(exam);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/exam/:id/report', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const report = await generateAIReport(req.userId!, Number(req.params.id));
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/study-plan', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const plan = await generateStudyPlan(req.userId!);
    res.json({ plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/spaced-repetition/due', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cards = await getCardsDueForReview(req.userId!);
    res.json(cards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/spaced-repetition/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getCardStats(req.userId!);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/spaced-repetition/review', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { flashcardId, quality } = req.body;
    const result = await updateSpacedRepetition(req.userId!, flashcardId, quality);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-content', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { type, topic, count } = req.body;
    const db = getDb();
    const questions = await db.prepare(
      'SELECT * FROM questions WHERE user_id = $1 AND topic = $2 ORDER BY RANDOM() LIMIT $3'
    ).all(req.userId!, topic || '', count || 5);

    if (questions.length === 0) {
      return res.status(400).json({ error: 'No hay preguntas suficientes' });
    }

    const prompt = `Basado en las siguientes preguntas de estudio, genera ${type === 'flashcards' ? '5 flashcards' : type === 'mnemotecnias' ? '3 mnemotecnias' : type === 'clinicalCases' ? '3 casos clínicos' : type === 'comparisonTables' ? 'una tabla comparativa' : type === 'examPearls' ? '5 perlas de examen' : 'conceptos clave'}.

Preguntas de referencia:
${(questions as any[]).map((q: any) => `- ${q.statement} [Respuesta: ${q.correct_answer}]${q.explanation ? ` Explicación: ${q.explanation}` : ''}`).join('\n')}

Genera el contenido solicitado de forma clara y estructurada.`;

    const result = await processTutorQuery(req.userId!, prompt);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
