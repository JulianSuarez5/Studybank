import { getDb } from '../database';
import { generateText, streamText } from './aiProvider';
import { searchSimilar } from './embeddings';
import { searchWeb } from './tavily';
import { addMessage, getRecentContext, getConversationHistory } from './conversationMemory';

function getTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY || '';
}

function buildSystemPrompt(): string {
  return `Eres un tutor académico inteligente especializado en educación médica y ciencias de la salud. Trabajas dentro de la plataforma StudyBank, un sistema de estudio basado en banco de preguntas.

REGLAS ABSOLUTAS:

1. **FUENTE DE VERDAD**: Debes responder usando exclusivamente el contexto proporcionado. NUNCA inventes información, datos, estadísticas o referencias.

2. **RAG OBLIGATORIO**: Siempre consulta primero el contexto de la base de datos del usuario. Solo usa la sección "INFORMACIÓN DE INTERNET" (si está presente en el contexto) cuando el conocimiento del usuario no contenga la respuesta.

3. **MARCA LA FUENTE**: Al final de cada respuesta, indica de dónde provino la información usando uno de estos sellos:
   - 📚 *Fuente: Base de datos de StudyBank*
   - 📄 *Fuente: Documento cargado*
   - 🌐 *Fuente: Búsqueda en internet*
   - 📊 *Fuente: Historial de estudio*

4. **NUNCA digas "según el contexto provisto"**. Habla natural.

5. **ESTRUCTURA tus respuestas**: Usa **negritas**, listas, emojis educativos.

6. **CAPACIDADES**: Explicar respuestas, generar ejemplos clínicos, crear preguntas (ENARM, MIR, USMLE, ECAES), adaptar dificultad, analizar rendimiento, generar planes de estudio.

7. **IDIOMA**: Responde siempre en español.

8. **TONO**: Profesional pero accesible, como un tutor particular.`;
}

async function buildUserProfile(userId: number): Promise<{
  name: string; accuracy: number; totalQuestions: number; totalAnswered: number;
  totalCorrect: number; weakTopics: { topic: string; accuracy: number }[];
  strongTopics: { topic: string; accuracy: number }[];
  specialties: string[]; topics: string[];
  recentErrors: { statement: string; correct_answer: string; topic: string }[];
  conceptsCount: number; flashcardsCount: number; summariesCount: number;
}> {
  const db = getDb();

  const user = await db.prepare('SELECT name FROM users WHERE id = $1').get(userId) as any;
  const totalQuestions = (await db.prepare('SELECT COUNT(*)::int as c FROM questions WHERE user_id = $1').get(userId)).c;
  const totalAnswered = (await db.prepare(`
    SELECT COUNT(*)::int as c FROM exam_answers ea 
    JOIN exam_attempts e ON e.id = ea.exam_attempt_id 
    WHERE e.user_id = $1 AND ea.is_correct IS NOT NULL
  `).get(userId)).c;
  const totalCorrect = (await db.prepare(`
    SELECT COUNT(*)::int as c FROM exam_answers ea 
    JOIN exam_attempts e ON e.id = ea.exam_attempt_id 
    WHERE e.user_id = $1 AND ea.is_correct = 1
  `).get(userId)).c;

  const topicsData = await db.prepare(`
    SELECT q.topic, COUNT(*)::int as total,
      COALESCE(SUM(CASE WHEN ea.is_correct = 1 THEN 1 ELSE 0 END),0)::int as correct,
      COALESCE(SUM(CASE WHEN ea.is_correct = 0 THEN 1 ELSE 0 END),0)::int as incorrect
    FROM questions q
    LEFT JOIN exam_answers ea ON ea.question_id = q.id
    LEFT JOIN exam_attempts e ON e.id = ea.exam_attempt_id AND e.user_id = $1
    WHERE q.user_id = $2 AND q.topic != ''
    GROUP BY q.topic
  `).all(userId, userId) as any[];

  const weakTopics = topicsData
    .filter((t: any) => t.total >= 2 && (t.correct / t.total) < 0.6)
    .map((t: any) => ({ topic: t.topic, accuracy: Math.round((t.correct / t.total) * 100) }));

  const strongTopics = topicsData
    .filter((t: any) => t.total >= 2 && (t.correct / t.total) >= 0.8)
    .map((t: any) => ({ topic: t.topic, accuracy: Math.round((t.correct / t.total) * 100) }));

  const specialties = (await db.prepare(
    'SELECT DISTINCT specialty FROM questions WHERE user_id = $1 AND specialty != \'\''
  ).all(userId)).map((s: any) => s.specialty);

  const topicNames = topicsData.map((t: any) => t.topic);

  const recentErrors = await db.prepare(`
    SELECT q.statement, q.correct_answer, q.topic FROM exam_answers ea
    JOIN exam_attempts e ON e.id = ea.exam_attempt_id
    JOIN questions q ON q.id = ea.question_id
    WHERE e.user_id = $1 AND ea.is_correct = 0
    ORDER BY ea.id DESC LIMIT 5
  `).all(userId) as any[];

  const conceptsCount = (await db.prepare('SELECT COUNT(*)::int as c FROM key_concepts WHERE user_id = $1').get(userId)).c;
  const flashcardsCount = (await db.prepare('SELECT COUNT(*)::int as c FROM flashcards WHERE user_id = $1').get(userId)).c;
  const summariesCount = (await db.prepare('SELECT COUNT(*)::int as c FROM summaries WHERE user_id = $1').get(userId)).c;

  return {
    name: user?.name || 'Usuario',
    accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    totalQuestions, totalAnswered, totalCorrect,
    weakTopics, strongTopics, specialties, topics: topicNames, recentErrors, conceptsCount, flashcardsCount, summariesCount,
  };
}

async function buildStudyContext(userId: number): Promise<string> {
  const db = getDb();
  const profile = await buildUserProfile(userId);

  let context = `=== PERFIL DEL USUARIO ===\n`;
  context += `Nombre: ${profile.name}\nPrecisión global: ${profile.accuracy}%\n`;
  context += `Preguntas respondidas: ${profile.totalAnswered}\n`;
  context += `Respuestas correctas: ${profile.totalCorrect}\n`;
  context += `Total preguntas en banco: ${profile.totalQuestions}\n`;
  context += `Conceptos clave: ${profile.conceptsCount}\n`;
  context += `Flashcards: ${profile.flashcardsCount}\n`;
  context += `Resúmenes: ${profile.summariesCount}\n`;

  if (profile.specialties.length > 0) {
    context += `\n=== ESPECIALIDADES DISPONIBLES ===\n${profile.specialties.map(s => `- ${s}`).join('\n')}`;
  }
  if (profile.topics.length > 0) {
    context += `\n\n=== TEMAS DISPONIBLES ===\n${profile.topics.map(t => `- ${t}`).join('\n')}`;
  }
  if (profile.weakTopics.length > 0) {
    context += `\n\n=== TEMAS DÉBILES ===\n${profile.weakTopics.map(t => `- ${t.topic} (${t.accuracy}% precisión) - PRIORIDAD ALTA`).join('\n')}`;
  }
  if (profile.strongTopics.length > 0) {
    context += `\n\n=== TEMAS FUERTES ===\n${profile.strongTopics.map(t => `- ${t.topic} (${t.accuracy}% precisión)`).join('\n')}`;
  }
  if (profile.recentErrors.length > 0) {
    context += `\n\n=== ERRORES RECIENTES ===\n${profile.recentErrors.map(e => `- "${e.statement.substring(0, 100)}..." | Correcta: ${e.correct_answer} | Tema: ${e.topic}`).join('\n')}`;
  }

  const dueCards = (await db.prepare(`
    SELECT COUNT(*)::int as c FROM spaced_repetition sr
    WHERE sr.user_id = $1 AND sr.next_review <= NOW()
  `).get(userId));

  if (dueCards && dueCards.c > 0) {
    context += `\n\n=== REPASOS PENDIENTES ===\nTienes ${dueCards.c} flashcards pendientes de repaso.`;
  }

  return context;
}

export async function generateStudyPlan(userId: number): Promise<string> {
  const profile = await buildStudyContext(userId);
  const systemPrompt = buildSystemPrompt();

  const userContent = `${profile}

Basado en la información del perfil del usuario arriba, genera un PLAN DE ESTUDIO DIARIO personalizado y detallado. Incluye:
1. **Temas a estudiar hoy** (priorizando temas débiles y con mayor probabilidad de olvido)
2. **Flashcards a repasar** (aplicando repetición espaciada)
3. **Preguntas a practicar** (cuántas y de qué temas)
4. **Conceptos a repasar**
5. **Simulacro recomendado** (si aplica)

IMPORTANTE: No inventes información. Usa exclusivamente los datos del perfil proporcionado.`;

  return generateText(systemPrompt, [{ role: 'user', content: userContent }]);
}

async function buildRAGContext(userId: number, query: string): Promise<string> {
  const similar = await searchSimilar(userId, query, 8);
  if (similar.length === 0) return '';

  let context = '\n=== INFORMACIÓN DE LA BASE DE DATOS (RAG) ===\n';
  for (const s of similar) {
    const typeLabel = s.sourceType === 'question' ? 'Pregunta' :
      s.sourceType === 'explanation' ? 'Explicación' :
      s.sourceType === 'flashcard' ? 'Flashcard' :
      s.sourceType === 'concept' ? 'Concepto clave' :
      s.sourceType === 'summary' ? 'Resumen' : 'Documento';
    context += `[${typeLabel} - Relevancia: ${Math.round(s.score * 100)}%]\n${s.content.substring(0, 300)}\n\n`;
  }
  return context;
}

async function buildTutorContext(userId: number, query: string): Promise<string> {
  const profile = await buildStudyContext(userId);
  const ragContext = await buildRAGContext(userId, query);
  const conversationHistory = await getRecentContext(userId, 8);

  let context = profile;
  if (ragContext) context += `\n\n${ragContext}`;
  if (conversationHistory) context += `\n\n=== HISTORIAL DE CONVERSACIÓN ===\n${conversationHistory}`;
  return context;
}

export async function processTutorQuery(userId: number, query: string): Promise<{ response: string; source: string }> {
  await addMessage(userId, 'user', query);

  const systemPrompt = buildSystemPrompt();
  let context = await buildTutorContext(userId, query);
  const hasRag = context.includes('INFORMACIÓN DE LA BASE DE DATOS');

  let internetContext = '';
  if (!hasRag && getTavilyApiKey()) {
    internetContext = await searchWeb(query);
    if (internetContext) context += `\n\n${internetContext}`;
  }

  const finalSource = internetContext ? 'internet' : hasRag ? 'database' : 'no_source';
  const userContent = `${context}\n\n=== PREGUNTA DEL USUARIO ===\n${query}\n\nIMPORTANTE: Responde usando el contexto provisto. Indica si la respuesta viene de la base de datos, documentos subidos, o búsqueda en internet.`;

  const response = await generateText(systemPrompt, [{ role: 'user', content: userContent }]);
  await addMessage(userId, 'assistant', response);
  return { response, source: finalSource };
}

export async function streamTutorResponse(userId: number, query: string, onChunk: (chunk: string) => void): Promise<string> {
  await addMessage(userId, 'user', query);

  const systemPrompt = buildSystemPrompt();
  let context = await buildTutorContext(userId, query);

  if (!context.includes('INFORMACIÓN DE LA BASE DE DATOS') && getTavilyApiKey()) {
    const webContext = await searchWeb(query);
    if (webContext) context += `\n\n${webContext}`;
  }

  const conversationHistory = await getConversationHistory(userId, 8);

  const messages = [
    ...conversationHistory.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: `${context}\n\n=== PREGUNTA ===\n${query}` },
  ];

  const fullResponse = await streamText(systemPrompt, messages, onChunk);
  if (fullResponse) await addMessage(userId, 'assistant', fullResponse);
  return fullResponse;
}

export async function generateAIExam(userId: number, config: {
  numQuestions?: number; topics?: string[]; specialty?: string;
  difficulty?: string; examType?: string; focusErrors?: boolean;
}): Promise<{ questions: any[]; title: string }> {
  const db = getDb();
  let sql = 'SELECT * FROM questions WHERE user_id = $1';
  const params: any[] = [userId];

  if (config.topics && config.topics.length > 0) {
    sql += ` AND topic = ANY($${params.length + 1}::text[])`;
    params.push(config.topics);
  }
  if (config.specialty) {
    sql += ` AND specialty = $${params.length + 1}`;
    params.push(config.specialty);
  }
  if (config.focusErrors) {
    const wrongIds = (await db.prepare(`
      SELECT DISTINCT q.id FROM questions q
      JOIN exam_answers ea ON ea.question_id = q.id
      JOIN exam_attempts e ON e.id = ea.exam_attempt_id
      WHERE e.user_id = $1 AND ea.is_correct = 0
    `).all(userId)).map((r: any) => r.id);

    if (wrongIds.length > 0) {
      sql += ` AND id = ANY($${params.length + 1}::int[])`;
      params.push(wrongIds);
    }
  }

  sql += ' ORDER BY RANDOM() LIMIT $' + (params.length + 1);
  params.push(config.numQuestions || 10);

  const questions = await db.prepare(sql).all(...params);
  const parsed = (questions as any[]).map((q: any) => ({ ...q, options: JSON.parse(q.options) }));

  const typeLabel = config.examType || 'personalizado';
  const title = `Simulacro IA - ${typeLabel.toUpperCase()}`;

  await db.prepare(
    'INSERT INTO exam_attempts (user_id, title, config, total_questions) VALUES ($1, $2, $3, $4)'
  ).run(userId, title, JSON.stringify(config), parsed.length);

  return { questions: parsed, title };
}

export async function generateAIReport(userId: number, attemptId: number): Promise<string> {
  const db = getDb();
  const attempt = await db.prepare(
    'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2'
  ).get(attemptId, userId) as any;
  if (!attempt) return 'Simulacro no encontrado.';

  const answers = await db.prepare(`
    SELECT ea.*, q.statement, q.options, q.correct_answer, q.explanation, q.topic, q.specialty
    FROM exam_answers ea
    JOIN questions q ON q.id = ea.question_id
    WHERE ea.exam_attempt_id = $1
  `).all(attemptId) as any[];

  const correct = answers.filter(a => a.is_correct).length;
  const wrong = answers.filter(a => !a.is_correct);
  const percentage = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;

  const topicErrors: Record<string, number> = {};
  for (const w of wrong) topicErrors[w.topic] = (topicErrors[w.topic] || 0) + 1;

  const profile = await buildUserProfile(userId);

  const context = `
=== INFORME DEL SIMULACRO ===
Título: ${attempt.title}
Preguntas: ${answers.length}
Correctas: ${correct} (${percentage}%)
Incorrectas: ${wrong.length}
Errores por tema: ${Object.entries(topicErrors).map(([t, c]) => `${t}: ${c}`).join(', ')}

=== PERFIL DEL USUARIO ===
Precisión global: ${profile.accuracy}%
Temas débiles: ${profile.weakTopics.map(t => `${t.topic} (${t.accuracy}%)`).join(', ') || 'Ninguno'}
Temas fuertes: ${profile.strongTopics.map(t => `${t.topic} (${t.accuracy}%)`).join(', ') || 'Ninguno'}
`;

  const systemPrompt = buildSystemPrompt();
  const userContent = `${context}

Basado en estos datos, genera un informe completo de desempeño que incluya:
1. Análisis del desempeño general
2. Errores conceptuales identificados
3. Errores repetitivos
4. Temas críticos que necesita reforzar
5. Recomendaciones específicas de estudio
6. Plan de estudio sugerido
7. Probabilidad estimada de aprobar`;

  return generateText(systemPrompt, [{ role: 'user', content: userContent }]);
}

export { buildUserProfile };
