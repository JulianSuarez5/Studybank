import mammoth from 'mammoth';
import { classifyContent } from './classifier';

interface ExtractedQuestion {
  statement: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  topic: string;
  subtopic: string;
  specialty: string;
}

interface ExtractedContent {
  questions: ExtractedQuestion[];
  concepts: string[];
  summaries: string[];
  tables: string[];
  rawText: string;
}

function extractAnswerKey(text: string): Map<number, string> {
  const answerKey = new Map<number, string>();
  const lines = text.split('\n');

  let inAnswerSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^(respuestas?|clave|answer\s*key|soluci[oó]n|solucionario|hoja\s+de\s+respuestas)/i.test(trimmed)) {
      inAnswerSection = true;
      continue;
    }

    if (/^\d+\s*[.)\]]?\s*[-–]\s*[A-Da-d]\s*$/.test(trimmed)) {
      const parts = trimmed.split(/[-–]/);
      const num = parseInt(parts[0].replace(/[^0-9]/g, ''));
      const letter = parts[1]?.trim()?.[0]?.toUpperCase();
      if (num > 0 && letter && /[A-D]/.test(letter)) {
        answerKey.set(num, letter);
        inAnswerSection = true;
        continue;
      }
    }

    if (/^(\d+)\s*[.)\]]?\s*([A-Da-d])\s*$/.test(trimmed)) {
      const m = trimmed.match(/^(\d+)\s*[.)\]]?\s*([A-Da-d])\s*$/);
      if (m) {
        const num = parseInt(m[1]);
        const letter = m[2].toUpperCase();
        if (inAnswerSection || trimmed.length < 8) {
          answerKey.set(num, letter);
          continue;
        }
      }
    }

    if (inAnswerSection && trimmed.length > 20) {
      inAnswerSection = false;
    }
  }

  return answerKey;
}

function extractQuestionsFromText(text: string): ExtractedQuestion[] {
  const allQuestions: { q: Partial<ExtractedQuestion>; num: number }[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let currentQuestion: Partial<ExtractedQuestion> | null = null;
  let currentOptions: string[] = [];
  let currentNum = 0;
  let collectingExplanation = false;
  let explanationText = '';

  const optionRegex = /^([a-dA-D][.)])\s*(.+)/;
  const correctMarkerRegex = /^\s*(\*{1,2}|[Rr][.:]|[Rr]espuesta[.:]|[Cc]orrecta[.:]|[Cc]lave[.:]|[✓✗X])\s*[.:]?\s*([a-dA-D])/i;
  const questionNumberRegex = /^(\d+[.)])\s*(.+)/;
  const answerLineRegex = /^(respuesta|rta|clave)\s*[.:]\s*(.+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (correctMarkerRegex.test(line)) {
      const match = line.match(correctMarkerRegex);
      if (match && currentQuestion) {
        const answerLetter = match[2].toUpperCase();
        const letterIndex = answerLetter.charCodeAt(0) - 65;
        if (letterIndex >= 0 && letterIndex < currentOptions.length) {
          currentQuestion.correctAnswer = currentOptions[letterIndex];
        }
      }
      collectingExplanation = true;
      continue;
    }

    const ansMatch = line.match(answerLineRegex);
    if (ansMatch && currentQuestion) {
      currentQuestion.correctAnswer = ansMatch[2].trim();
      collectingExplanation = true;
      continue;
    }

    if (collectingExplanation) {
      if (line.match(/^\d+[.)]/) || line.match(/^\d+\.\s/) || line.match(/^[a-dA-D][.)]\s/)) {
        collectingExplanation = false;
      } else {
        explanationText += (explanationText ? ' ' : '') + line;
        continue;
      }
    }

    const qMatch = line.match(questionNumberRegex);
    if (qMatch) {
      if (currentQuestion && currentQuestion.statement) {
        currentQuestion.explanation = explanationText;
        allQuestions.push({ q: currentQuestion, num: currentNum });
      }
      currentNum = parseInt(qMatch[1]);
      currentOptions = [];
      explanationText = '';
      currentQuestion = {
        statement: qMatch[2],
        options: [],
        correctAnswer: '',
        explanation: '',
        topic: '',
        subtopic: '',
        specialty: '',
      };
      continue;
    }

    const oMatch = line.match(optionRegex);
    if (oMatch && currentQuestion) {
      currentOptions.push(oMatch[2]);
      currentQuestion.options = [...currentOptions];
      continue;
    }

    if (currentQuestion && !currentQuestion.statement) {
      currentQuestion.statement = line;
    } else if (currentQuestion && currentQuestion.statement && !line.match(/^[a-dA-D][.)]/)) {
      currentQuestion.statement += ' ' + line;
    }
  }

  if (currentQuestion && currentQuestion.statement) {
    currentQuestion.explanation = explanationText;
    allQuestions.push({ q: currentQuestion, num: currentNum });
  }

  const answerKey = extractAnswerKey(text);

  const questions: ExtractedQuestion[] = [];
  for (const { q, num } of allQuestions) {
    const opts = q.options || [];
    if (!q.correctAnswer && answerKey.has(num) && opts.length > 0) {
      const letter = answerKey.get(num)!;
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= 0 && idx < opts.length) {
        q.correctAnswer = opts[idx];
      }
    }
    if (q.statement && opts.length >= 2) {
      q.options = opts;
      questions.push(q as ExtractedQuestion);
    }
  }

  return questions;
}

function extractConcepts(text: string): string[] {
  const concepts: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) &&
      trimmed.length > 3 && trimmed.length < 300
    ) {
      concepts.push(trimmed.replace(/^[-•*]\s*/, ''));
    }
  }

  return concepts;
}

function extractDefinitionConcepts(text: string): { concept: string; definition: string }[] {
  const results: { concept: string; definition: string }[] = [];
  const definitionPatterns = [
    /(.+?)\s+se define como\s+(.+)/i,
    /(.+?)\s+es\s+(.+?)(?:\.|$)/i,
    /(.+?)\s+consiste en\s+(.+)/i,
    /(.+?)\s+se refiere a\s+(.+)/i,
    /(.+?)\s+significa\s+(.+)/i,
    /definición\s+de\s+(.+?)[:.:]\s*(.+)/i,
    /concepto\s+de\s+(.+?)[:.:]\s*(.+)/i,
    /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,4}):\s+(.+?)(?:\.|$)/,
  ];

  for (const pattern of definitionPatterns) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const m of matches) {
      const concept = m[1].trim();
      const definition = m[2].trim();
      if (concept.length > 2 && concept.length < 100 && definition.length > 10) {
        if (!results.some(r => r.concept.toLowerCase() === concept.toLowerCase())) {
          results.push({ concept, definition });
        }
      }
    }
  }

  return results;
}

function extractTables(text: string): string[] {
  const tables: string[] = [];
  const lines = text.split('\n');
  let currentTable: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const hasPipe = line.includes('|') && line.split('|').length > 2;
    const hasMultiSpace = line.split(/\s{3,}/).length > 2;

    if (hasPipe || hasMultiSpace) {
      inTable = true;
      currentTable.push(line.trim());
    } else {
      if (inTable && currentTable.length > 1) {
        tables.push(currentTable.join('\n'));
      }
      inTable = false;
      currentTable = [];
    }
  }

  if (inTable && currentTable.length > 1) {
    tables.push(currentTable.join('\n'));
  }

  return tables;
}

function extractSummaries(text: string): string[] {
  const summaries: string[] = [];
  const lines = text.split('\n');
  let currentSummary = '';
  let inSummary = false;

  const summaryHeaders = /^(resumen|summary|conclusión|conclusion|ideas clave|key points|para recordar|síntesis)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (summaryHeaders.test(trimmed)) {
      if (currentSummary) summaries.push(currentSummary.trim());
      currentSummary = '';
      inSummary = true;
      continue;
    }
    if (inSummary) {
      if (trimmed.match(/^\d+[.)]/) && currentSummary.length > 100) {
        summaries.push(currentSummary.trim());
        currentSummary = '';
        inSummary = false;
      } else if (trimmed) {
        currentSummary += (currentSummary ? ' ' : '') + trimmed;
      }
    }
  }

  if (currentSummary) summaries.push(currentSummary.trim());
  return summaries;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedContent> {
  let text = '';

  if (mimeType.includes('pdf') || filename.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    text = data.text || '';

    if (!text || text.trim().length < 100) {
      console.warn(`[Parser] PDF text too short (${text.length} chars). Trying raw extraction for: ${filename}`);
      const raw = buffer.toString('utf-8');
      const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length > text.length) {
        text = cleaned;
      }
    }

    console.log(`[Parser] PDF extracted ${text.length} chars from: ${filename}`);
  } else if (
    mimeType.includes('word') ||
    mimeType.includes('officedocument') ||
    filename.endsWith('.docx') ||
    filename.endsWith('.doc')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = buffer.toString('utf-8');
  }

  const questions = extractQuestionsFromText(text);

  const classified = questions.map(q => {
    const cls = classifyContent(q.statement + ' ' + (q.options.join(' ')));
    return {
      ...q,
      topic: cls.topic,
      subtopic: cls.subtopic,
      specialty: cls.specialty,
    };
  });

  const concepts = extractConcepts(text);
  const definitionConcepts = extractDefinitionConcepts(text);
  for (const dc of definitionConcepts) {
    if (!concepts.some(c => c.toLowerCase().includes(dc.concept.toLowerCase()))) {
      concepts.push(`${dc.concept}: ${dc.definition}`);
    }
  }

  const tables = extractTables(text);
  const summaries = extractSummaries(text);

  return {
    questions: classified,
    concepts,
    summaries,
    tables,
    rawText: text,
  };
}
