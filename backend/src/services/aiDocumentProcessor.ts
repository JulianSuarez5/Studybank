import { getDb } from '../database';
import { classifyContent } from './classifier';
import { generateText } from './aiProvider';

const FRAGMENT_ENDINGS = /\b(el|la|los|las|de|del|por|para|con|sin|que|es|se|su|un|una|lo|al|en|y|no|o|a|e|i|más|pero|como|cuando|donde|este|esta|esto|eso|esa|ese|muy|tan|tal|tras|entre|según|mediante|durante|sin|sobre|ante|cabe|yo|tu|él|nos|les|mis|tus|sus|son|era|fue|será|sea|sido|han|has|había|habrá|hay|haya|hubo)\s*$/i;

const QUESTION_FRAGMENTS = /¿(Cuál|Qué|Cómo|Cuándo|Dónde|Por qué|Para qué|Quién|Cuánto|Cuáles|Quien)/i;
const CLINICAL_QUESTION = /(el diagnóstico más probable|la interpretación más adecuada|la localización más probable|la causa más probable|el tratamiento más adecuado|la mejor opción|cuál de las siguientes|señale|indique|escoja|elija|marque|qué afirmación|cuál es|cuál sería)/i;
const OPTION_LINE = /^[A-Da-d][.)]\s/;
const TRAILING_HYPHEN = /\w-\s*$/;
const HAS_QUESTION_MARK = /[¿?]/;

function validateText(text: string, context: string): boolean {
  if (!text) {
    console.log(`[VALIDATOR] REJECTED ${context}: vacío`);
    return false;
  }
  if (text.length < 15) {
    console.log(`[VALIDATOR] REJECTED ${context}: menos de 15 caracteres — "${text.substring(0, 60)}"`);
    return false;
  }
  if (text.length > 400) {
    console.log(`[VALIDATOR] REJECTED ${context}: más de 400 caracteres — "${text.substring(0, 60)}..."`);
    return false;
  }
  if (/^[a-z]/.test(text)) {
    console.log(`[VALIDATOR] REJECTED ${context}: empieza en minúscula (fragmento truncado) — "${text.substring(0, 60)}"`);
    return false;
  }
  const trimmedEnd = text.trim();
  if (FRAGMENT_ENDINGS.test(trimmedEnd)) {
    console.log(`[VALIDATOR] REJECTED ${context}: termina en conector (texto truncado) — "${text.substring(0, 60)}"`);
    return false;
  }
  if (TRAILING_HYPHEN.test(trimmedEnd)) {
    console.log(`[VALIDATOR] REJECTED ${context}: termina en guión (cortado a media palabra) — "${text.substring(0, 60)}"`);
    return false;
  }
  if (OPTION_LINE.test(text)) {
    console.log(`[VALIDATOR] REJECTED ${context}: empieza con opción A/B/C/D — "${text.substring(0, 60)}"`);
    return false;
  }
  if (/^[A-D]\b/.test(text) && !text.includes(':')) {
    console.log(`[VALIDATOR] REJECTED ${context}: letra suelta A-D — "${text.substring(0, 60)}"`);
    return false;
  }
  if ((text.match(/\s+/g) || []).length < 3) {
    console.log(`[VALIDATOR] REJECTED ${context}: menos de 4 palabras — "${text.substring(0, 60)}"`);
    return false;
  }
  if (HAS_QUESTION_MARK.test(text)) {
    console.log(`[VALIDATOR] REJECTED ${context}: contiene signo de interrogación (¿?) — "${text.substring(0, 60)}"`);
    return false;
  }
  if (QUESTION_FRAGMENTS.test(text)) {
    console.log(`[VALIDATOR] REJECTED ${context}: fragmento de pregunta (¿Cuál/¿Qué) — "${text.substring(0, 60)}"`);
    return false;
  }
  if (CLINICAL_QUESTION.test(text)) {
    console.log(`[VALIDATOR] REJECTED ${context}: patrón de pregunta clínica — "${text.substring(0, 60)}"`);
    return false;
  }
  const wordCount = (text.match(/\w+/g) || []).length;
  if (wordCount < 4) {
    console.log(`[VALIDATOR] REJECTED ${context}: menos de 4 palabras significativas — "${text.substring(0, 60)}"`);
    return false;
  }
  const words = text.split(/\s+/);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  if (uniqueWords.size / words.length < 0.4) {
    console.log(`[VALIDATOR] REJECTED ${context}: poca variedad léxica — "${text.substring(0, 60)}"`);
    return false;
  }
  return true;
}

function isStudyMaterial(text: string): boolean {
  return validateText(text, 'texto');
}

function isValidConcept(conceptText: string): boolean {
  if (!validateText(conceptText, 'concepto')) return false;
  if (!conceptText.includes(':') || !conceptText.includes(': ')) {
    console.log(`[VALIDATOR] REJECTED concepto: sin definición (sin ":") — "${conceptText.substring(0, 60)}"`);
    return false;
  }
  const parts = conceptText.split(/:\s*/);
  const conceptPart = parts[0].trim();
  const definitionPart = parts.slice(1).join(': ').trim();
  if (conceptPart.length < 5) {
    console.log(`[VALIDATOR] REJECTED concepto: parte del concepto muy corta — "${conceptText.substring(0, 60)}"`);
    return false;
  }
  if (!definitionPart || definitionPart.length < 10) {
    console.log(`[VALIDATOR] REJECTED concepto: definición vacía o muy corta — "${conceptText.substring(0, 60)}"`);
    return false;
  }
  return true;
}

function isValidFlashcard(front: string, back: string): boolean {
  if (!front || !back) {
    console.log(`[VALIDATOR] REJECTED flashcard: front o back vacío — front="${(front||'').substring(0,40)}" back="${(back||'').substring(0,40)}"`);
    return false;
  }
  if (front.length < 10 || back.length < 5) {
    console.log(`[VALIDATOR] REJECTED flashcard: front (${front.length}) o back (${back.length}) demasiado corto — "${front.substring(0,40)}"`);
    return false;
  }
  if (front.length > 200 || back.length > 200) {
    console.log(`[VALIDATOR] REJECTED flashcard: front (${front.length}) o back (${back.length}) demasiado largo — "${front.substring(0,40)}..."`);
    return false;
  }
  if (HAS_QUESTION_MARK.test(back)) {
    console.log(`[VALIDATOR] REJECTED flashcard: back contiene signo de interrogación — front="${front.substring(0,40)}" back="${back.substring(0,40)}"`);
    return false;
  }
  if (areSimilar(front, back, 0.25)) {
    console.log(`[VALIDATOR] REJECTED flashcard: front y back casi iguales — front="${front.substring(0,40)}" back="${back.substring(0,40)}"`);
    return false;
  }
  return true;
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

export type DocType = 'question_bank' | 'theory' | 'flashcard_set' | 'concept_list' | 'summary' | 'presentation' | 'mixed';

export function detectDocumentType(text: string): DocType {
  const lines = text.split('\n').filter(l => l.trim());
  const textLower = text.toLowerCase();

  const qNumCount = (text.match(/^\d+[.)]\s+.+$/gm) || []).length;
  const optCount = (text.match(/^[A-Da-d][.)]\s+.+$/gm) || []).length;
  const flashcardCount = (text.match(/¿(Qué|Cuál|Cómo|Cuándo|Dónde|Para qué|Por qué).*\?/gi) || []).length;
  const respCorrectaCount = (text.match(/respuesta\s+correcta\s*[:\-]/gi) || []).length;
  const bulletCount = (text.match(/^[-•*]\s+.+$/gm) || []).length;
  const defCount = (text.match(/(?:se define como|consiste en|se refiere a|significa)\s+/gi) || []).length;
  const headerCount = (text.match(/^(?:capítulo|tema|unidad|lección|chapter|unit|lesson)\s+\d+/im) || []).length;
  const tablaCount = (lines.filter(l => l.includes('|') && l.split('|').length > 3).length);

  // 1. Question bank: numbered questions + options A-D
  if (qNumCount >= 3 && optCount >= qNumCount * 2) {
    if (respCorrectaCount > 0) {
      console.log(`[DOC TYPE] Banco de preguntas (${qNumCount} preg, ${optCount} ops, ${respCorrectaCount} respuestas)`);
      return 'question_bank';
    }
    const theoryIndicators = (text.match(/introducci[oó]n|concepto|definici[oó]n|marco\ste[oó]rico|fundamento|capi[tá]p[ií]tulo|tema\s+\d+|resumen/gi) || []).length;
    if (theoryIndicators >= 3) {
      console.log(`[DOC TYPE] Mixto (${qNumCount} preg + teoría)`);
      return 'mixed';
    }
    console.log(`[DOC TYPE] Banco de preguntas (${qNumCount} preg, ${optCount} ops)`);
    return 'question_bank';
  }

  // 2. Flashcard set
  if (flashcardCount >= 5 && qNumCount < 3) {
    console.log(`[DOC TYPE] Set de flashcards (${flashcardCount} flashcards detectadas)`);
    return 'flashcard_set';
  }

  // 3. Concept list
  if (bulletCount >= 5 && defCount >= 2) {
    console.log(`[DOC TYPE] Lista de conceptos (${bulletCount} items, ${defCount} definiciones)`);
    return 'concept_list';
  }

  // 4. Theory document
  if (headerCount >= 2 || (bulletCount >= 3 && text.length > 1000)) {
    console.log(`[DOC TYPE] Documento teórico (${headerCount} headers, ${bulletCount} bullets)`);
    return 'theory';
  }

  // 5. Summary
  const summaryHeaders = ['resumen', 'summary', 'conclusión', 'conclusion', 'ideas clave', 'key points', 'síntesis'];
  const hasSummaryHeader = summaryHeaders.some(h => textLower.startsWith(h) || textLower.includes('\n' + h));
  if (hasSummaryHeader && text.length < 3000) {
    console.log(`[DOC TYPE] Resumen`);
    return 'summary';
  }

  // 6. Tables
  if (tablaCount >= 2) {
    console.log(`[DOC TYPE] Documento con tablas`);
    return 'presentation';
  }

  console.log(`[DOC TYPE] Documento teórico (default)`);
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

async function tryAiMultiFlashcardGeneration(
  concept: string,
  definition: string,
  fragmentText: string
): Promise<{ front: string; back: string }[]> {
  const prompt = `Basándote ESTRICTAMENTE en el contenido real de este texto, genera de 3 a 5 flashcards educativas sobre "${concept}".

Las flashcards deben cubrir ASPECTOS DIFERENTES: qué evalúa, cuál es su función, cómo se explora, qué nervios/vías participan, tipos, etc.

Texto:
${(fragmentText || definition || '').substring(0, 600)}

REGLAS:
- Extrae SOLO del texto, NO inventes información
- NO uses el formato "¿Qué es ${concept}?"
- Una sola idea por flashcard
- Respuesta máxima 20 palabras
- Si no hay suficiente información en el texto para 3 flashcards, genera solo 1-2

Responde SOLO JSON: [{"front":"pregunta","back":"respuesta"}]`;

  const result = await generateText('Eres un asistente que extrae flashcards del contenido textual. Responde solo JSON.', [{ role: 'user', content: prompt }]);
  if (!result) return [];

  const parsed = parseJsonResponse(result);
  if (!Array.isArray(parsed)) return [];

  const valid: { front: string; back: string }[] = [];
  for (const item of parsed) {
    const front = String(item.front || '').trim();
    const back = String(item.back || '').trim();
    if (isValidFlashcard(front, back) && !QUESTION_FRAGMENTS.test(front)) {
      valid.push({ front, back });
    }
  }
  return valid;
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
      if (isValidConcept(item)) {
        if (!bulletItems.some(b => areSimilar(b, item, 0.2))) {
          console.log(`[VALIDATOR] ACCEPTED bullet concepto: "${item.substring(0, 80)}"`);
          bulletItems.push(item);
        }
      }
    }

    if (FRAGMENT_ENDINGS.test(trimmed) || QUESTION_FRAGMENTS.test(trimmed) || CLINICAL_QUESTION.test(trimmed)) continue;
    for (const pattern of definitionPatterns) {
      const m = trimmed.match(pattern);
      if (m) {
        const term = m[1].trim();
        const def = m[2].trim();
        if (term.length > 5 && term.length < 100 && def.length > 15 && def.length < 300) {
          if (FRAGMENT_ENDINGS.test(term)) continue;
          if (/^[a-z]/.test(term)) continue;
          if (HAS_QUESTION_MARK.test(term + def)) continue;
          if ((term.match(/\w+/g) || []).length < 2) continue;
          if (!definitionPairs.some(d => areSimilar(d.term, term, 0.2))) {
            console.log(`[VALIDATOR] ACCEPTED definición: term="${term}" def="${def.substring(0, 60)}..."`);
            definitionPairs.push({ term, def });
          }
        }
      }
    }
  }

  let aiAttempts = 0;
  for (const item of bulletItems) {
    const parts = item.split(/:\s*/);
    const concept = parts[0].trim();
    const definition = parts.slice(1).join(': ').trim() || '';
    if (concept.length < 5) {
      console.log(`[VALIDATOR] REJECTED bullet concepto: concepto muy corto — "${item.substring(0, 60)}"`);
      continue;
    }
    if (!definition || definition.length < 10) {
      console.log(`[VALIDATOR] REJECTED bullet concepto: definición vacía/insuficiente — "${item.substring(0, 60)}"`);
      continue;
    }

    const clsItem = classifyContent(item);
    console.log(`[VALIDATOR] ACCEPTED concept INSERT: "${concept}" → "${definition.substring(0, 60)}..."`);
    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, concept.substring(0, 200), definition.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
    conceptCount++;

    let aiFlashcards: { front: string; back: string }[] = [];
    if (definition && aiAttempts < 3) {
      aiAttempts++;
      aiFlashcards = await tryAiMultiFlashcardGeneration(concept, definition, item);
    }

    if (aiFlashcards.length === 0) {
      const qVariations = [
        `Define: ${concept}`,
        `Explica brevemente ${concept}`,
        `¿En qué consiste ${concept}?`,
      ];
      const front = qVariations[Math.floor(Math.random() * qVariations.length)];
      const back = definition.substring(0, 200);
      if (isValidFlashcard(front, back)) {
        aiFlashcards.push({ front, back });
      }
    }

    for (const fc of aiFlashcards) {
      console.log(`[VALIDATOR] ACCEPTED flashcard INSERT: front="${fc.front.substring(0, 60)}" back="${fc.back.substring(0, 60)}"`);
      await db.prepare(`
        INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `).run(
        userId, documentId,
        fc.front.substring(0, 200),
        fc.back.substring(0, 200),
        clsItem.topic || cls.topic || 'Material de Estudio',
        clsItem.subtopic || cls.subtopic || 'General',
        clsItem.specialty || cls.specialty || 'General',
        definition.length > 50 ? 'medio' : 'fácil',
        ''
      );
      flashcardCount++;
    }
  }

  for (const dp of definitionPairs) {
    if (bulletItems.some(b => areSimilar(b, dp.term, 0.3))) continue;

    const clsItem = classifyContent(dp.term + ' ' + dp.def);
    console.log(`[VALIDATOR] ACCEPTED definitionPair concept INSERT: "${dp.term}" → "${dp.def.substring(0, 60)}..."`);
    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, dp.term.substring(0, 200), dp.def.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
    conceptCount++;

    let aiFlashcards: { front: string; back: string }[] = [];
    if (dp.def.length > 15 && aiAttempts < 6) {
      aiAttempts += 2;
      aiFlashcards = await tryAiMultiFlashcardGeneration(dp.term, dp.def, dp.term + ': ' + dp.def);
    }

    if (aiFlashcards.length === 0) {
      const front = `Define: ${dp.term}`;
      const back = dp.def.substring(0, 200);
      if (isValidFlashcard(front, back)) {
        aiFlashcards.push({ front, back });
      }
    }

    for (const fc of aiFlashcards) {
      console.log(`[VALIDATOR] ACCEPTED definitionPair flashcard INSERT: front="${fc.front.substring(0, 60)}" back="${fc.back.substring(0, 60)}..."`);
      await db.prepare(`
        INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `).run(
        userId, documentId,
        fc.front.substring(0, 200),
        fc.back.substring(0, 200),
        clsItem.topic || cls.topic || 'Material de Estudio',
        clsItem.subtopic || cls.subtopic || 'General',
        clsItem.specialty || cls.specialty || 'General',
        dp.def.length > 50 ? 'medio' : 'fácil',
        ''
      );
      flashcardCount++;
    }
  }

  if (conceptCount === 0) {
    const headerMatch = fragment.match(/^((?:Capítulo|Tema|Lección|Unidad|Chapter|Unit|Lesson|Tópico)\s+\d+[.:]\s*.+)$/im);
    if (headerMatch) {
      const header = headerMatch[1].trim().substring(0, 100);
      if (header.length > 10 && !QUESTION_FRAGMENTS.test(header) && !CLINICAL_QUESTION.test(header)) {
        await db.prepare(
          'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
        ).run(userId, header, `Sección del documento: ${filename}`, cls.topic || 'Material de Estudio');
        conceptCount++;
      }
    }
  }

  return { concepts: conceptCount, flashcards: flashcardCount };
}

export async function processTheoryDocument(
  userId: number,
  documentId: number,
  text: string,
  filename: string,
  hasRealQuestions: boolean = false
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

  if (text.length > 500 && totalConcepts < 5) {
    try {
      const textSample = text.substring(0, 2500);
      const prompt = `Del siguiente texto, EXTRAE ÚNICAMENTE los conceptos que aparecen EXPLÍCITAMENTE.

Para cada concepto que encuentres en el texto, proporciona:
- concept: el término exacto
- definition: la definición textual (entre 15 y 150 caracteres)
- topic: el tema al que pertenece
- subtopic: subtema específico (opcional, máximo 50 caracteres)

IMPORTANTE: NO inventes conceptos ni definiciones. Cada concepto debe estar LITERALMENTE en el texto.

Texto:
${textSample}

Responde SOLO JSON. Máximo 10 conceptos.
Formato: [{"concept":"...","definition":"...","topic":"...","subtopic":"..."}]`;

      const aiResult = await generateText(
        'Eres un asistente que extrae conceptos literalmente del texto. Responde solo JSON. No inventes nada.',
        [{ role: 'user', content: prompt }]
      );

      const parsed = parseJsonResponse(aiResult);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const concept = String(item.concept || '').trim();
          const definition = String(item.definition || '').trim();
          const topic = String(item.topic || '').trim();
          const subtopic = String(item.subtopic || '').trim();
          const combined = concept + ': ' + definition;
          if (concept.length < 5) {
            console.log(`[AI CONCEPT] REJECTED: concepto muy corto — "${concept}"`);
            continue;
          }
          if (!definition || definition.length < 15) {
            console.log(`[AI CONCEPT] REJECTED "${concept}": definición insuficiente`);
            continue;
          }
          if (!isStudyMaterial(combined)) {
            console.log(`[AI CONCEPT] REJECTED "${concept}": no es material de estudio`);
            continue;
          }
          const clsItem = classifyContent(combined);
          const finalTopic = topic || clsItem.topic || cls.topic || 'Material de Estudio';
          const finalSubtopic = subtopic || clsItem.subtopic || 'General';
          console.log(`[AI CONCEPT] ACCEPTED: "${concept}" → "${definition.substring(0, 60)}..." tema=${finalTopic}`);
          await db.prepare(
            'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
          ).run(userId, concept.substring(0, 200), definition.substring(0, 500), finalTopic);
          totalConcepts++;

          const aiFlashcards = await tryAiMultiFlashcardGeneration(concept, definition, combined);
          if (aiFlashcards.length === 0) {
            const fallbackFront = `Define: ${concept}`;
            const fallbackBack = definition.substring(0, 200);
            if (isValidFlashcard(fallbackFront, fallbackBack)) {
              aiFlashcards.push({ front: fallbackFront, back: fallbackBack });
            }
          }
          for (const fc of aiFlashcards) {
            console.log(`[AI CONCEPT] Flashcard: "${fc.front.substring(0, 50)}" → "${fc.back.substring(0, 50)}"`);
            await db.prepare(`
              INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `).run(
              userId, documentId,
              fc.front.substring(0, 200),
              fc.back.substring(0, 200),
              finalTopic,
              finalSubtopic,
              clsItem.specialty || cls.specialty || 'General',
              definition.length > 50 ? 'medio' : 'fácil',
              ''
            );
            totalFlashcards++;
          }
        }
      }
    } catch (e) {
      console.error('[AI CONCEPT] Error:', e);
    }
  }

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

  if (!hasRealQuestions) {
    console.log(`[QUESTION GEN] No hay preguntas reales en el documento. Generando preguntas desde conceptos...`);
    const allConcepts = await db.prepare(
      'SELECT concept, definition, topic FROM key_concepts WHERE user_id = $1 AND definition != \'\''
    ).all(userId) as { concept: string; definition: string; topic: string }[];

    if (allConcepts.length >= 3) {
    for (let i = 0; i < allConcepts.length && totalQuestions < 30; i += 2) {
      const c = allConcepts[i];
      if (!c.definition || c.definition.length < 10) continue;

      const correctDef = c.definition.substring(0, 150);
      const distractors = allConcepts
        .filter(x => x.concept !== c.concept && x.definition.length > 5)
        .slice(i % Math.max(1, allConcepts.length - 3) + 1, i % Math.max(1, allConcepts.length - 3) + 4)
        .map(x => x.definition.substring(0, 150));

      if (distractors.length < 2) continue;

      const options = [correctDef, ...distractors];
      for (let j = options.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [options[j], options[k]] = [options[k], options[j]];
      }

      const questionVariations = [
        `¿Cuál es la definición correcta de ${c.concept}?`,
        `Sobre ${c.concept}, señale la opción correcta:`,
        `${c.concept}: elija la afirmación verdadera`,
        `Respecto a ${c.concept}, ¿qué afirma correctamente?`,
        `Complete: ${c.concept} se refiere a:`,
        `Identifique la opción correcta sobre ${c.concept}:`,
      ];
      const qIdx = Math.floor(Math.random() * questionVariations.length);

      await db.prepare(`
        INSERT INTO questions (document_id, user_id, statement, options, correct_answer, explanation, topic, subtopic, specialty, origin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `).run(
        documentId, userId,
        questionVariations[qIdx],
        JSON.stringify(options),
        correctDef,
        `Definición: ${c.definition} (Fuente: documento procesado)`,
        c.topic || cls.topic || 'Material de Estudio',
        'General',
        cls.specialty || 'General',
        'IA'
      );
      totalQuestions++;
    }
  }
  } else {
    console.log(`[QUESTION GEN] Documento tiene preguntas reales. NO se generan preguntas artificiales.`);
  }

  return {
    conceptsExtracted: totalConcepts,
    questionsGenerated: totalQuestions,
    flashcardsGenerated: totalFlashcards,
    summariesGenerated: totalSummaries,
  };
}
