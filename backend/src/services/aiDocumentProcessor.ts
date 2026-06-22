import { getDb } from '../database';
import { classifyContent } from './classifier';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroqOnce(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) return '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) return '';
    if (!response.ok) return '';
    const data = await response.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

function parseJsonResponse(raw: string): any | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try { return JSON.parse(jsonMatch[0]); } catch { return null; }
  }
}

function normalizeText(t: string): string {
  return t.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function areSimilar(a: string, b: string, threshold: number = 0.3): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  return levenshteinDistance(na, nb) / maxLen < threshold;
}

export function detectDocumentType(text: string): 'questions' | 'theory' | 'mixed' {
  const questionPatterns = [
    /^\d+[.)]\s+.+\n(?:(?:[A-Da-d][.)]\s+.+\n?)+)/m,
    /pregunta|question\s*\d+/i,
    /opción\s*(multiple|múltiple)|seleccione|señale|escoja|elija|indique|cuál\s+es/i,
    /respuesta\s*(correcta|incorrecta)|marque|verdadero|falso/i,
  ];

  let questionScore = 0;
  for (const pattern of questionPatterns) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) questionScore += matches.length;
  }

  const qNumMatch = text.match(/^\d+[.)]\s+.+$/gm);
  const optMatch = text.match(/^[A-Da-d][.)]\s+.+$/gm);

  if (qNumMatch && optMatch && (optMatch.length / qNumMatch.length) >= 2) {
    questionScore += 10;
  }

  if (questionScore >= 5) {
    const theoryIndicators = [
      /introducción|introduction|concepto|definición|marco\s*teórico|fundamento/i,
      /capítulo|tema\s*\d+|unidad\s*\d+|lección|lesson|chapter/i,
      /resumen|summary|conclusión|conclusion/i,
    ];
    let theoryScore = 0;
    for (const p of theoryIndicators) {
      if (p.test(text)) theoryScore++;
    }

    const textLen = text.length;
    const qLen = (qNumMatch || []).reduce((sum, q) => sum + q.length, 0);
    const theoryRatio = (textLen - qLen) / textLen;

    if (theoryRatio > 0.6 && theoryScore >= 2) return 'mixed';
    return 'questions';
  }

  return 'theory';
}

function splitIntoFragments(text: string): string[] {
  const lines = text.split('\n');
  const fragments: string[] = [];
  let current = '';
  let pageCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\d+\s*$/.test(trimmed) && trimmed.length < 5) {
      pageCount++;
      if (pageCount > 1 && current.length > 500) {
        if (current.trim()) fragments.push(current.trim());
        current = '';
      }
      continue;
    }

    if (/^(#+\s+|capítulo\s+\d+|tema\s+\d+|unidad\s+\d+|lección\s+|chapter\s+\d+|unit\s+\d+)/i.test(trimmed)) {
      if (current.trim().length > 300) {
        fragments.push(current.trim());
        current = '';
      }
    }

    current += (current ? '\n' : '') + line;

    if (current.length > 3000) {
      const breakIdx = current.lastIndexOf('\n\n', 2000);
      if (breakIdx > 300) {
        fragments.push(current.substring(0, breakIdx).trim());
        current = current.substring(breakIdx + 2);
      }
    }
  }

  if (current.trim()) fragments.push(current.trim());
  return fragments.filter(f => f.length > 50);
}

async function tryAiFlashcardGeneration(
  concept: string,
  definition: string,
  topic: string,
  specialty: string
): Promise<{ front: string; back: string } | null> {
  const prompt = `Convierte este concepto en una flashcard (pregunta→respuesta). Una sola idea. Pregunta ≤20 palabras, respuesta ≤15 palabras.

Concepto: ${concept}
Definición: ${definition.substring(0, 200)}

Responde SOLO JSON: {"front":"¿pregunta?","back":"respuesta"}`;

  const result = await callGroqOnce('Eres un asistente que crea flashcards educativas. Responde solo JSON.', prompt);
  if (!result) return null;

  const parsed = parseJsonResponse(result);
  if (!parsed || !parsed.front || !parsed.back) return null;

  const front = String(parsed.front).trim();
  const back = String(parsed.back).trim();
  if (front.length < 5 || back.length < 2) return null;
  if (front.length > 150 || back.length > 100) return null;

  return { front, back };
}

interface FragmentResult {
  concepts: number;
  flashcards: number;
}

async function processFragment(
  userId: number,
  documentId: number,
  fragment: string,
  filename: string
): Promise<FragmentResult> {
  const db = getDb();

  let conceptCount = 0;
  let flashcardCount = 0;

  const cls = classifyContent(fragment.substring(0, 1000));

  const bulletItems: string[] = [];
  const definitionPairs: { term: string; def: string }[] = [];
  const lines = fragment.split('\n');

  const definitionPatterns = [
    /(.+?)\s+se define como\s+(.+)/i,
    /(.+?)\s+es\s+(.+?)(?:\.\s|$)/i,
    /(.+?)\s+consiste en\s+(.+)/i,
    /definición\s+de\s+(.+?)[:.:]\s*(.+)/i,
    /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){1,4}):\s+(.+?)(?:\.\s|$)/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if ((trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) &&
        trimmed.length > 5 && trimmed.length < 400) {
      const item = trimmed.replace(/^[-•*]\s*/, '');
      if (!bulletItems.some(b => areSimilar(b, item, 0.2))) {
        bulletItems.push(item);
      }
    }

    for (const pattern of definitionPatterns) {
      const m = trimmed.match(pattern);
      if (m) {
        const term = m[1].trim();
        const def = m[2].trim();
        if (term.length > 2 && term.length < 100 && def.length > 5 && def.length < 300) {
          if (!definitionPairs.some(d => areSimilar(d.term, term, 0.2))) {
            definitionPairs.push({ term, def });
          }
        }
      }
    }
  }

  let aiAttempts = 0;
  for (const item of bulletItems) {
    const parts = item.split(/[:.:]/);
    const concept = parts[0].trim();
    const definition = parts.slice(1).join(':').trim() || '';
    if (concept.length < 2) continue;

    const clsItem = classifyContent(item);
    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, concept.substring(0, 200), definition.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
    conceptCount++;

    let flashcardFront = `¿Qué es ${concept}?`;
    let flashcardBack = definition.substring(0, 200);

    if (definition && aiAttempts < 3) {
      aiAttempts++;
      const aiFlashcard = await tryAiFlashcardGeneration(concept, definition, clsItem.topic, clsItem.specialty);
      if (aiFlashcard) {
        flashcardFront = aiFlashcard.front;
        flashcardBack = aiFlashcard.back;
      }
    }

    await db.prepare(`
      INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `).run(
      userId, documentId,
      flashcardFront.substring(0, 200),
      flashcardBack.substring(0, 200),
      clsItem.topic || cls.topic || 'Material de Estudio',
      clsItem.subtopic || cls.subtopic || 'General',
      clsItem.specialty || cls.specialty || 'General',
      definition.length > 50 ? 'medio' : 'fácil',
      ''
    );
    flashcardCount++;
  }

  for (const dp of definitionPairs) {
    if (bulletItems.some(b => areSimilar(b, dp.term, 0.3))) continue;

    const clsItem = classifyContent(dp.term + ' ' + dp.def);
    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, dp.term.substring(0, 200), dp.def.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
    conceptCount++;

    const simpleFront = `¿Qué es ${dp.term}?`;
    await db.prepare(`
      INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `).run(
      userId, documentId,
      simpleFront.substring(0, 200),
      dp.def.substring(0, 200),
      clsItem.topic || cls.topic || 'Material de Estudio',
      clsItem.subtopic || cls.subtopic || 'General',
      clsItem.specialty || cls.specialty || 'General',
      dp.def.length > 50 ? 'medio' : 'fácil',
      ''
    );
    flashcardCount++;
  }

  const headerMatch = fragment.match(/^((?:Capítulo|Tema|Lección|Unidad|Chapter|Unit|Lesson)\s+\d+[.:]\s*.+)$/im);
  if (headerMatch && conceptCount === 0) {
    const header = headerMatch[1].trim().substring(0, 200);

    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, header, `Sección del documento: ${filename}`, cls.topic || 'Material de Estudio');
    conceptCount++;
  }

  return { concepts: conceptCount, flashcards: flashcardCount };
}

export async function processTheoryDocument(
  userId: number,
  documentId: number,
  text: string,
  filename: string
): Promise<{
  conceptsExtracted: number;
  questionsGenerated: number;
  flashcardsGenerated: number;
  summariesGenerated: number;
}> {
  const fragments = splitIntoFragments(text);

  let totalConcepts = 0;
  let totalFlashcards = 0;

  for (let i = 0; i < fragments.length; i++) {
    const result = await processFragment(userId, documentId, fragments[i], filename);
    totalConcepts += result.concepts;
    totalFlashcards += result.flashcards;
  }

  const db = getDb();
  const cls = classifyContent(text.substring(0, 2000));

  let totalSummaries = 0;
  const summaryLines: string[] = [];
  const summaryHeaders = /^(resumen|summary|conclusión|conclusion|ideas clave|key points|síntesis)/i;
  let currentSummary = '';
  let inSummary = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (summaryHeaders.test(trimmed)) {
      if (currentSummary) summaryLines.push(currentSummary.trim());
      currentSummary = '';
      inSummary = true;
      continue;
    }
    if (inSummary && trimmed) {
      if (trimmed.match(/^\d+[.)]/) && currentSummary.length > 100) {
        summaryLines.push(currentSummary.trim());
        currentSummary = '';
        inSummary = false;
      } else {
        currentSummary += (currentSummary ? ' ' : '') + trimmed;
      }
    }
  }
  if (currentSummary) summaryLines.push(currentSummary.trim());

  if (summaryLines.length > 0) {
    const combined = summaryLines.join('\n\n').substring(0, 2000);
    await db.prepare(
      'INSERT INTO summaries (user_id, title, content, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, `Resumen - ${filename}`, combined, cls.topic || 'Material de Estudio');
    totalSummaries++;
  }

  let totalQuestions = 0;
  const allConcepts = await db.prepare(
    'SELECT concept, definition, topic FROM key_concepts WHERE user_id = $1 AND definition != \'\''
  ).all(userId) as { concept: string; definition: string; topic: string }[];

  if (allConcepts.length >= 3) {
    for (let i = 0; i < allConcepts.length && totalQuestions < 30; i += 2) {
      const c = allConcepts[i];
      if (!c.definition || c.definition.length < 10) continue;

      const def = c.definition.substring(0, 150);
      const distractors = allConcepts
        .filter(x => x.concept !== c.concept && x.definition.length > 5)
        .slice(i % (allConcepts.length - 3) + 1, i % (allConcepts.length - 3) + 4)
        .map(x => x.definition.substring(0, 150));

      if (distractors.length < 2) continue;

      const options = [def, ...distractors];
      for (let j = options.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [options[j], options[k]] = [options[k], options[j]];
      }

      await db.prepare(`
        INSERT INTO questions (document_id, user_id, statement, options, correct_answer, explanation, topic, subtopic, specialty, origin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `).run(
        documentId, userId,
        `¿Qué es ${c.concept}?`,
        JSON.stringify(options),
        def,
        c.definition,
        c.topic || cls.topic || 'Material de Estudio',
        'General',
        cls.specialty || 'General',
        'IA'
      );
      totalQuestions++;
    }
  }

  return {
    conceptsExtracted: totalConcepts,
    questionsGenerated: totalQuestions,
    flashcardsGenerated: totalFlashcards,
    summariesGenerated: totalSummaries,
  };
}
