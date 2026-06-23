const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getConfig(): { provider: string; apiKey: string } {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || '';
  if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };
  if (groqKey) return { provider: 'groq', apiKey: groqKey };
  return { provider: 'none', apiKey: '' };
}

function buildGroqBody(systemPrompt: string, messages: { role: string; content: string }[], stream: boolean) {
  return {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.4,
    max_tokens: 4096,
    stream,
  };
}

function buildGeminiBody(systemPrompt: string, messages: { role: string; content: string }[], _stream: boolean) {
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
  };
}

export async function generateText(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const { provider, apiKey } = getConfig();
  if (!apiKey) return '⚠️ No hay API key configurada. Agrega GEMINI_API_KEY o GROQ_API_KEY en .env';

  try {
    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
      const body = buildGeminiBody(systemPrompt, messages, false);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Gemini API error (${res.status}):`, errText);
        return fallbackGroq(systemPrompt, messages, false);
      }
      const data = await res.json() as any;
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const body = buildGroqBody(systemPrompt, messages, false);
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Groq API error (${res.status}):`, errText);
      return `⚠️ Error AI (${res.status})`;
    }
    const data = await res.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    console.error('AI generateText error:', err);
    if (provider === 'gemini') return fallbackGroq(systemPrompt, messages, false);
    return `⚠️ Error: ${err.message}`;
  }
}

async function fallbackGroq(systemPrompt: string, messages: { role: string; content: string }[], _stream: boolean): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return '⚠️ Error al contactar Gemini y no hay GROQ_API_KEY de respaldo.';
  try {
    const body = buildGroqBody(systemPrompt, messages, false);
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `⚠️ Fallback Groq falló (${res.status})`;
    const data = await res.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  } catch {
    return '⚠️ Todos los proveedores AI fallaron.';
  }
}

export async function streamText(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const { provider, apiKey } = getConfig();
  if (!apiKey) {
    const msg = '⚠️ No hay API key configurada. Agrega GEMINI_API_KEY o GROQ_API_KEY en .env';
    onChunk(msg);
    return msg;
  }

  try {
    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const body = buildGeminiBody(systemPrompt, messages, true);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Gemini stream error (${res.status}):`, errText);
        return fallbackGroqStream(systemPrompt, messages, onChunk);
      }

      const reader = res.body?.getReader();
      if (!reader) { onChunk('⚠️ No se pudo leer la respuesta'); return ''; }

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { fullText += text; onChunk(text); }
          } catch { }
        }
      }

      return fullText;
    }

    const body = buildGroqBody(systemPrompt, messages, true);
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const err = `⚠️ Error Groq: ${res.status}`; onChunk(err); return err; }

    const reader = res.body?.getReader();
    if (!reader) { const err = '⚠️ No se pudo leer la respuesta'; onChunk(err); return err; }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) { fullText += delta; onChunk(delta); }
        } catch { }
      }
    }

    return fullText;
  } catch (err: any) {
    console.error('AI streamText error:', err);
    if (provider === 'gemini') return fallbackGroqStream(systemPrompt, messages, onChunk);
    const msg = `⚠️ Error: ${err.message}`;
    onChunk(msg);
    return msg;
  }
}

async function fallbackGroqStream(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    const msg = '⚠️ Gemini falló y no hay GROQ_API_KEY de respaldo.';
    onChunk(msg);
    return msg;
  }
  try {
    const body = buildGroqBody(systemPrompt, messages, true);
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { onChunk(`⚠️ Fallback Groq falló (${res.status})`); return ''; }

    const reader = res.body?.getReader();
    if (!reader) { onChunk('⚠️ No se pudo leer respuesta de Groq fallback'); return ''; }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) { fullText += delta; onChunk(delta); }
        } catch { }
      }
    }
    return fullText;
  } catch (err: any) {
    onChunk(`⚠️ Error fallback: ${err.message}`);
    return '';
  }
}
