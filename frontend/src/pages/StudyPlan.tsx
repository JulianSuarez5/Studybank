import { useEffect, useState } from 'react';
import api from '../api/client';

export default function StudyPlan() {
  const [plan, setPlan] = useState('');
  const [loading, setLoading] = useState(false);
  const [srStats, setSrStats] = useState({ total: 0, dueToday: 0, mature: 0, young: 0 });
  const [dueCards, setDueCards] = useState<any[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    api.get('/ai/spaced-repetition/stats').then(({ data }) => setSrStats(data)).catch(() => {});
    api.get('/ai/spaced-repetition/due').then(({ data }) => setDueCards(data)).catch(() => {});
  }, []);

  const generatePlan = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ai/study-plan');
      setPlan(data.plan);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (quality: number) => {
    if (!dueCards[flashcardIndex]) return;
    try {
      await api.post('/ai/spaced-repetition/review', {
        flashcardId: dueCards[flashcardIndex].flashcard_id,
        quality,
      });
      setFlipped(false);
      if (flashcardIndex < dueCards.length - 1) {
        setFlashcardIndex(prev => prev + 1);
      } else {
        setDueCards(prev => prev.filter((_, i) => i !== flashcardIndex));
        setFlashcardIndex(0);
      }
      const { data } = await api.get('/ai/spaced-repetition/stats');
      setSrStats(data);
    } catch {
    }
  };

  const currentCard = dueCards[flashcardIndex];

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(4)}</h3>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-indigo-700 mt-4 mb-2">{line.slice(3)}</h2>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-gray-900 mt-2">{line.slice(2, -2)}</p>;
      if (line.startsWith('- ')) return <li key={i} className="text-sm text-gray-700 ml-4 list-disc">{line.slice(2)}</li>;
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="text-sm text-gray-700">{line}</p>;
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📖 Plan de Estudio Inteligente</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{srStats.dueToday}</p>
          <p className="text-xs text-gray-500">Repasos pendientes hoy</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{srStats.mature}</p>
          <p className="text-xs text-gray-500">Tarjetas dominadas</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{srStats.young}</p>
          <p className="text-xs text-gray-500">En aprendizaje</p>
        </div>
      </div>

      {dueCards.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Repetición Espaciada (SM-2)</h2>
          <p className="text-sm text-gray-500 mb-4">{dueCards.length} flashcards pendientes de repaso</p>

          <div
            onClick={() => setFlipped(!flipped)}
            className="cursor-pointer min-h-[180px] flex items-center justify-center p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border-2 border-amber-100 mb-4"
          >
            <div className="text-center">
              {flipped ? (
                <div>
                  <p className="text-xs text-amber-500 mb-2">Respuesta</p>
                  <p className="text-lg text-gray-900">{currentCard?.back}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-amber-500 mb-2">Pregunta</p>
                  <p className="text-lg font-medium text-gray-900">{currentCard?.front}</p>
                  {currentCard?.topic && <span className="inline-block mt-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{currentCard.topic}</span>}
                  <p className="text-xs text-gray-400 mt-4">Haz clic para voltear</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <p className="text-xs text-gray-500 self-center">¿Qué tan difícil fue recordar?</p>
            <button onClick={() => handleReview(1)} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs">Muy difícil</button>
            <button onClick={() => handleReview(3)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs">Difícil</button>
            <button onClick={() => handleReview(4)} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs">Fácil</button>
            <button onClick={() => handleReview(5)} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs">Muy fácil</button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-2">{flashcardIndex + 1} / {dueCards.length}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Plan de Estudio Generado por IA</h2>
          <button
            onClick={generatePlan}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Generando...' : '🔄 Generar Plan'}
          </button>
        </div>

        {plan ? (
          <div className="prose prose-sm max-w-none">
            {renderContent(plan)}
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
              📚 Plan generado por IA basado en tu rendimiento y repetición espaciada
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">Haz clic en "Generar Plan" para obtener un plan de estudio personalizado</p>
            <p className="text-xs">La IA analizará tu rendimiento, errores y repetición espaciada para crear el plan óptimo</p>
          </div>
        )}
      </div>
    </div>
  );
}
