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
  const conceptPart = definition ? `${concept}: ${definition}` : concept;
  const prompt = `Genera una flashcard educativa sobre este contenido:

${conceptPart.substring(0, 300)}

REGLAS:
- Pregunta original y variada (NO empieces con "¿Qué es")
- Respuesta clara y completa (máximo 25 palabras)
- Una sola idea por flashcard
- Debe reflejar EL CONTENIDO del documento, no una definición genérica

Responde SOLO JSON: {"front":"pregunta","back":"respuesta"}`;

  const result = await generateText('Eres un experto en crear flashcards educativas de alta calidad. Responde solo JSON.', [{ role: 'user', content: prompt }]);
  if (!result) return null;

  const parsed = parseJsonResponse(result);
  if (!parsed || !parsed.front || !parsed.back) return null;

  const front = String(parsed.front).trim();
  const back = String(parsed.back).trim();
  if (!isValidFlashcard(front, back)) return null;

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

    const questionVariations = [
      `¿Qué es ${concept}?`,
      `Define: ${concept}`,
      `Explica brevemente ${concept}`,
      `¿En qué consiste ${concept}?`,
      `${concept}:`,
    ];
    const randomIdx = Math.floor(Math.random() * questionVariations.length);
    let flashcardFront = questionVariations[randomIdx];
    let flashcardBack = definition.substring(0, 200);

    if (definition && aiAttempts < 3) {
      aiAttempts++;
      const aiFlashcard = await tryAiFlashcardGeneration(concept, definition, clsItem.topic, clsItem.specialty);
      if (aiFlashcard) {
        flashcardFront = aiFlashcard.front;
        flashcardBack = aiFlashcard.back;
      }
    }

    if (!isValidFlashcard(flashcardFront, flashcardBack)) continue;

    console.log(`[VALIDATOR] ACCEPTED flashcard INSERT: front="${flashcardFront.substring(0, 60)}" back="${flashcardBack.substring(0, 60)}"`);
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
    console.log(`[VALIDATOR] ACCEPTED definitionPair concept INSERT: "${dp.term}" → "${dp.def.substring(0, 60)}..."`);
    await db.prepare(
      'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
    ).run(userId, dp.term.substring(0, 200), dp.def.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
    conceptCount++;

    const simpleFront = `¿Qué es ${dp.term}?`;
    if (!isValidFlashcard(simpleFront, dp.def.substring(0, 200))) continue;

    console.log(`[VALIDATOR] ACCEPTED definitionPair flashcard INSERT: front="${simpleFront}" back="${dp.def.substring(0, 60)}..."`);
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

  if (totalConcepts === 0 && text.length > 100) {
    try {
      const prompt = `Extrae los conceptos clave de este texto. Para cada concepto da una definición breve.

Texto:
${text.substring(0, 2000)}

Responde SOLO JSON: [{"concept":"nombre","definition":"definición"}] (máximo 5 conceptos)`;

      const aiResult = await generateText(
        'Eres un asistente que extrae conceptos de textos educativos. Responde solo JSON.',
        [{ role: 'user', content: prompt }]
      );

      const parsed = parseJsonResponse(aiResult);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const concept = String(item.concept || '').trim();
          const definition = String(item.definition || '').trim();
          const combined = concept + ': ' + definition;
          if (concept.length < 5) {
            console.log(`[VALIDATOR] REJECTED AI concepto: concepto muy corto — "${concept}"`);
            continue;
          }
          if (!definition || definition.length < 15) {
            console.log(`[VALIDATOR] REJECTED AI concepto: definición vacía o corta para "${concept}"`);
            continue;
          }
          if (!isStudyMaterial(combined)) continue;
          const clsItem = classifyContent(combined);
          console.log(`[VALIDATOR] ACCEPTED AI concept INSERT: "${concept}" → "${definition.substring(0, 60)}..."`);
          await db.prepare(
            'INSERT INTO key_concepts (user_id, concept, definition, topic) VALUES ($1, $2, $3, $4)'
          ).run(userId, concept.substring(0, 200), definition.substring(0, 500), clsItem.topic || cls.topic || 'Material de Estudio');
          totalConcepts++;

          const qVariations = ['Define:', 'Explica brevemente', '¿En qué consiste'];
          const front = `${qVariations[Math.floor(Math.random() * qVariations.length)]} ${concept}?`;
          if (!isValidFlashcard(front, definition.substring(0, 200))) continue;
          console.log(`[VALIDATOR] ACCEPTED AI flashcard INSERT: front="${front.substring(0, 60)}" back="${definition.substring(0, 60)}..."`);
          await db.prepare(`
            INSERT INTO flashcards (user_id, document_id, front, back, topic, subtopic, specialty, difficulty, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `).run(
            userId, documentId,
            front.substring(0, 200),
            definition.substring(0, 200),
            clsItem.topic || cls.topic || 'Material de Estudio',
            clsItem.subtopic || 'General',
            clsItem.specialty || cls.specialty || 'General',
            definition.length > 50 ? 'medio' : 'fácil',
            ''
          );
          totalFlashcards++;
        }
      }
    } catch (e) {
      console.error('AI concept extraction fallback error:', e);
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

  return {
    conceptsExtracted: totalConcepts,
    questionsGenerated: totalQuestions,
    flashcardsGenerated: totalFlashcards,
    summariesGenerated: totalSummaries,
  };
}
