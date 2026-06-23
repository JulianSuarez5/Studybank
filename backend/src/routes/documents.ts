import { Router, Response } from 'express';
import multer from 'multer';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getDb } from '../database';
import { parseDocument } from '../services/documentParser';
import { detectDocumentType, processTheoryDocument } from '../services/aiDocumentProcessor';
import { buildAndStoreEmbeddings } from '../services/embeddings';
import path from 'path';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.doc', '.docx'].includes(ext)) cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF y Word'));
  },
});

router.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });

    const db = getDb();
    const user_id = req.userId!;
    const original_name = req.file.originalname;
    const filename = `${Date.now()}-${original_name}`;

    const docResult = await db.prepare(
      'INSERT INTO documents (user_id, filename, original_name, status) VALUES ($1, $2, $3, $4)'
    ).run(user_id, filename, original_name, 'processing');
    const documentId = docResult.lastInsertRowid;

    const parsed = await parseDocument(req.file.buffer, req.file.mimetype, original_name);
    const rawText = parsed.rawText;

    const docType = await detectDocumentType(rawText);

    await db.prepare('UPDATE documents SET doc_type = $1 WHERE id = $2').run(docType, documentId);

    const response: any = {
      documentId,
      filename: original_name,
      docType,
    };

    if (docType === 'questions' || docType === 'mixed') {
      for (const q of parsed.questions) {
        const qResult = await db.prepare(`
          INSERT INTO questions (document_id, user_id, statement, options, correct_answer, explanation, topic, subtopic, specialty, origin)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `).run(documentId, user_id, q.statement, JSON.stringify(q.options), q.correctAnswer, q.explanation, q.topic, q.subtopic, q.specialty, 'DOCUMENT');
        const qId = qResult.lastInsertRowid;

        if (q.explanation) {
          await db.prepare('INSERT INTO flashcards (question_id, user_id, front, back, topic) VALUES ($1, $2, $3, $4, $5)')
            .run(qId, user_id, q.statement, q.explanation, q.topic);
        }
      }

      response.questionsFound = parsed.questions.length;
    }

    for (const concept of parsed.concepts) {
      await db.prepare('INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)')
        .run(user_id, concept, '', '');
    }
    response.conceptsExtracted = (response.conceptsExtracted || 0) + parsed.concepts.length;

    for (const table of parsed.tables) {
      await db.prepare('INSERT INTO summaries (user_id, title, content, topic) VALUES ($1, $2, $3, $4)')
        .run(user_id, `Tabla extraída - ${original_name}`, table, '');
    }
    response.tablesExtracted = (response.tablesExtracted || 0) + parsed.tables.length;

    for (const summary of parsed.summaries) {
      await db.prepare('INSERT INTO summaries (user_id, title, content, topic) VALUES ($1, $2, $3, $4)')
        .run(user_id, `Resumen - ${original_name}`, summary, '');
    }
    response.summariesExtracted = (response.summariesExtracted || 0) + parsed.summaries.length;

    {
      const theoryResult = await processTheoryDocument(user_id, documentId, rawText, original_name);

      response.aiConceptsExtracted = theoryResult.conceptsExtracted;
      response.aiFlashcardsGenerated = theoryResult.flashcardsGenerated;
      response.aiSummariesGenerated = theoryResult.summariesGenerated;
      response.aiProcessed = true;

      if (docType === 'theory' || (docType === 'mixed' && parsed.questions.length === 0)) {
        response.aiQuestionsGenerated = theoryResult.questionsGenerated;
      }
    }

    const summary = JSON.stringify({
      questionsFound: parsed.questions.length,
      docType,
      ...(response.aiQuestionsGenerated ? { aiQuestions: response.aiQuestionsGenerated } : {}),
    });

    await db.prepare('UPDATE documents SET status = $1, content = $2 WHERE id = $3')
      .run('completed', summary, documentId);

    await buildAndStoreEmbeddings(user_id);

    res.json(response);
  } catch (err: any) {
    console.error('Error processing document:', err);
    res.status(500).json({ error: 'Error al procesar el documento: ' + err.message });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const docs = await db.prepare(
      'SELECT id, original_name, status, created_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC'
    ).all(req.userId!);
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const doc = await db.prepare('SELECT id FROM documents WHERE id = $1 AND user_id = $2').get(req.params.id, req.userId!);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    await db.prepare('DELETE FROM flashcards WHERE document_id = $1').run(req.params.id);
    await db.prepare('DELETE FROM questions WHERE document_id = $1').run(req.params.id);
    await db.prepare('DELETE FROM documents WHERE id = $1').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
