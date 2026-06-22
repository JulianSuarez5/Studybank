import { useEffect, useState, useRef } from 'react';
import api from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AITutor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const chatEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.get('/ai/profile').then(({ data }) => setProfile(data)).catch(() => {});
    api.get('/ai/conversation').then(({ data }) => {
      if (data && data.length > 0) {
        const formatted = data.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
        setMessages(formatted);
        setShowQuickActions(false);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sendQuery = async (query: string) => {
    if (!query.trim() || loading) return;

    setInput('');
    setShowQuickActions(false);
    setStreamingContent('');

    const userMsg: Message = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ query }),
        signal: abortRef.current.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

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
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullText += parsed.content;
              setStreamingContent(fullText);
            }
          } catch { }
        }
      }

      setStreamingContent('');
      setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setStreamingContent('');
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  const quickActions = [
    { label: '📊 Analiza mi rendimiento', query: 'Analiza mi rendimiento actual. ¿Cuáles son mis temas débiles y fuertes? Dame recomendaciones para mejorar.' },
    { label: '📝 Genera un simulacro', query: 'Genera un simulacro de 10 preguntas enfocado en mis temas débiles.' },
    { label: '📖 Plan de estudio para hoy', query: 'Genera un plan de estudio personalizado para hoy basado en mi rendimiento.' },
    { label: '❓ Explica un tema', query: 'Explícame el tema con peor rendimiento que tengo. Usa las preguntas de mi banco como base.' },
    { label: '🧠 Flashcards para repasar', query: '¿Qué flashcards debería repasar hoy según mi progreso?' },
    { label: '🎯 Genera preguntas ENARM', query: 'Genera 5 preguntas tipo ENARM sobre mi especialidad principal.' },
  ];

  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const code = part.replace(/```\w*\n?/, '').replace(/```$/, '');
        return <pre key={i} className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto my-2">{code}</pre>;
      }
      return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tutor IA</h1>
          <p className="text-sm text-gray-500">Tu profesor particular 24/7 con RAG</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { api.post('/ai/rebuild-embeddings').catch(() => {}); }}
            className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200"
            title="Reconstruir índices RAG"
          >
            🔄 Reindexar
          </button>
          <button
            onClick={async () => {
              try {
                await api.delete('/ai/conversation');
              } catch {}
              setMessages([]);
              setShowQuickActions(true);
            }}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
          >
            🗑️ Limpiar chat
          </button>
        </div>
      </div>

      {profile && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <div className="bg-white rounded-lg shadow-sm px-3 py-1.5 text-xs whitespace-nowrap">
            🎯 Precisión: <strong>{profile.accuracy}%</strong>
          </div>
          <div className="bg-white rounded-lg shadow-sm px-3 py-1.5 text-xs whitespace-nowrap">
            ❓ Preguntas: <strong>{profile.totalQuestions}</strong>
          </div>
          <div className="bg-white rounded-lg shadow-sm px-3 py-1.5 text-xs whitespace-nowrap">
            📊 Respondidas: <strong>{profile.totalAnswered}</strong>
          </div>
          {profile.weakTopics?.length > 0 && (
            <div className="bg-red-50 rounded-lg shadow-sm px-3 py-1.5 text-xs text-red-700 whitespace-nowrap">
              ⚠️ Débiles: <strong>{profile.weakTopics.map((t: any) => t.topic).join(', ')}</strong>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-thin">
        {showQuickActions && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
            <h2 className="text-lg font-semibold text-indigo-900 mb-1">¡Bienvenido al Tutor IA! 🧠</h2>
            <p className="text-sm text-gray-600 mb-4">
              Tu asistente de estudio inteligente. Usa RAG para buscar en tu base de conocimiento y Tavily para información actualizada.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => sendQuery(action.query)}
                  className="text-left text-sm px-4 py-3 bg-white rounded-lg border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl p-4 ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white shadow-sm border border-gray-100 rounded-bl-sm'
            }`}>
              <div className="text-sm whitespace-pre-wrap">{renderContent(msg.content)}</div>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-white shadow-sm border border-gray-100 rounded-xl rounded-bl-sm p-4">
              <div className="text-sm whitespace-pre-wrap">{renderContent(streamingContent)}</div>
              <div className="mt-1">
                <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {loading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm border border-gray-100 rounded-xl rounded-bl-sm p-4">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEnd} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pregúntale al tutor IA..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
