const TAVILY_API_URL = 'https://api.tavily.com/search';

export async function searchWeb(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY || '';
  if (!apiKey) {
    return '';
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) return '';

    const data = await response.json() as any;
    const results = data.results || [];
    const answer = data.answer || '';

    if (results.length === 0 && !answer) return '';

    let context = '=== INFORMACIÓN DE INTERNET (BÚSQUEDA EN TIEMPO REAL) ===\n';

    if (answer) {
      context += `Resumen: ${answer}\n\n`;
    }

    for (const r of results.slice(0, 5)) {
      context += `- ${r.title || 'Sin título'}: ${r.content || ''}\n  Fuente: ${r.url || ''}\n\n`;
    }

    return context;
  } catch {
    return '';
  }
}
