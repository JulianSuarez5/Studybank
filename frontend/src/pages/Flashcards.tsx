import { useEffect, useState } from 'react';
import api from '../api/client';

interface Flashcard {
  id: number;
  front: string;
  back: string;
  topic: string;
  subtopic: string;
  specialty: string;
  difficulty: string;
  tags: string;
  document_name: string;
  document_id: number;
  repetitions_count: number;
  accuracy_rate: number;
  interval_days: number;
  next_review: string;
  last_studied: string;
  created_at: string;
}

type StudyMode = 'study' | 'browse';

export default function Flashcards() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [filteredCards, setFilteredCards] = useState<Flashcard[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [mode, setMode] = useState<StudyMode>('study');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [stats, setStats] = useState({ total: 0, due: 0, studied: 0, notStudied: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/flashcards').then(({ data }) => { setCards(data); setFilteredCards(data); }),
      api.get('/flashcards/specialties').then(({ data }) => setSpecialties(data)),
      api.get('/flashcards/topics').then(({ data }) => setTopics(data)),
      api.get('/flashcards/stats').then(({ data }) => setStats(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = cards;
    if (filterSpecialty) result = result.filter(c => c.specialty === filterSpecialty);
    if (filterTopic) result = result.filter(c => c.topic === filterTopic);
    if (search) result = result.filter(c =>
      c.front.toLowerCase().includes(search.toLowerCase()) ||
      c.back.toLowerCase().includes(search.toLowerCase())
    );
    if (showDueOnly) result = result.filter(c => !c.next_review || new Date(c.next_review) <= new Date());
    setFilteredCards(result);
  }, [cards, filterSpecialty, filterTopic, search, showDueOnly]);

  useEffect(() => {
    if (filterSpecialty) {
      api.get(`/flashcards/topics?specialty=${filterSpecialty}`).then(({ data }) => setTopics(data)).catch(() => {});
    } else {
      api.get('/flashcards/topics').then(({ data }) => setTopics(data)).catch(() => {});
    }
  }, [filterSpecialty]);

  const handleStudy = async (quality: number) => {
    const card = filteredCards[currentIndex];
    if (!card) return;
    try {
      await api.post(`/flashcards/${card.id}/study`, { quality });
      const { data } = await api.get('/flashcards/stats');
      setStats(data);

      if (currentIndex < filteredCards.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setFlipped(false);
        setShowAnswer(false);
      } else {
        const reload = await api.get('/flashcards');
        setCards(reload.data);
        setCurrentIndex(0);
        setFlipped(false);
        setShowAnswer(false);
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta flashcard?')) return;
    try {
      await api.delete(`/flashcards/${id}`);
      setCards(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentCard = filteredCards[currentIndex];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🃏 Flashcards</h1>
          <p className="text-sm text-gray-500">Estudia con repetición espaciada SM-2</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('study'); setCurrentIndex(0); setFlipped(false); setShowAnswer(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'study' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            Estudiar
          </button>
          <button
            onClick={() => setMode('browse')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'browse' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            Explorar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{stats.due}</p>
          <p className="text-xs text-gray-500">Pendientes hoy</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{stats.studied}</p>
          <p className="text-xs text-gray-500">Estudiadas</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-gray-400">{stats.notStudied}</p>
          <p className="text-xs text-gray-500">Sin estudiar</p>
        </div>
      </div>

      {mode === 'browse' && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs text-gray-500 mb-1">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar flashcards..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="w-44">
              <label className="block text-xs text-gray-500 mb-1">Especialidad</label>
              <select value={filterSpecialty} onChange={e => { setFilterSpecialty(e.target.value); setFilterTopic(''); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Todas</option>
                {specialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="w-44">
              <label className="block text-xs text-gray-500 mb-1">Tema</label>
              <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Todos</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showDueOnly} onChange={e => setShowDueOnly(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded" />
                <span className="text-sm text-gray-600">Solo pendientes</span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            {filteredCards.map((card) => (
              <div key={card.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex gap-2 mb-2">
                      {card.specialty && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{card.specialty}</span>}
                      {card.topic && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{card.topic}</span>}
                      {card.difficulty && (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          card.difficulty === 'fácil' ? 'bg-green-100 text-green-700' :
                          card.difficulty === 'difícil' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{card.difficulty}</span>
                      )}
                      {card.tags && card.tags.split(',').map((t, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t.trim()}</span>
                      ))}
                    </div>
                    <p className="font-medium text-gray-900">{card.front}</p>
                    <p className="text-sm text-gray-500 mt-1">{card.back}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      {card.repetitions_count > 0 && <span>Repeticiones: {card.repetitions_count}</span>}
                      {card.accuracy_rate > 0 && <span>Aciertos: {Math.round(card.accuracy_rate * 100)}%</span>}
                      {card.last_studied && <span>Último estudio: {new Date(card.last_studied).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(card.id)} className="text-xs text-red-500 hover:text-red-700 ml-2">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {filteredCards.length === 0 && (
              <p className="text-center text-gray-500 py-10">No hay flashcards. Sube documentos para generarlas automáticamente.</p>
            )}
          </div>
        </>
      )}

      {mode === 'study' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          {filteredCards.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 mb-2">No hay flashcards para estudiar hoy</p>
              <p className="text-sm text-gray-400">Sube documentos o explora todas las flashcards disponibles</p>
              <button onClick={() => { setShowDueOnly(false); setMode('browse'); }}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                Explorar todas
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">
                  Tarjeta {currentIndex + 1} de {filteredCards.length}
                </span>
                <div className="flex gap-2">
                  {currentCard?.specialty && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{currentCard.specialty}</span>}
                  {currentCard?.topic && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{currentCard.topic}</span>}
                  {currentCard?.difficulty && (
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      currentCard.difficulty === 'fácil' ? 'bg-green-100 text-green-700' :
                      currentCard.difficulty === 'difícil' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{currentCard.difficulty}</span>
                  )}
                </div>
              </div>

              <div
                onClick={() => { if (!showAnswer) { setFlipped(!flipped); setShowAnswer(true); } }}
                className="cursor-pointer min-h-[250px] flex items-center justify-center p-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-100 mb-6"
              >
                <div className="text-center max-w-xl">
                  {showAnswer && flipped ? (
                    <div>
                      <p className="text-xs text-indigo-500 mb-3 font-medium uppercase tracking-wide">Respuesta</p>
                      <p className="text-lg text-gray-900 leading-relaxed">{currentCard?.back}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-indigo-500 mb-3 font-medium uppercase tracking-wide">Pregunta</p>
                      <p className="text-lg font-medium text-gray-900 leading-relaxed">{currentCard?.front}</p>
                      {!showAnswer && <p className="text-xs text-gray-400 mt-6">Haz clic para ver la respuesta</p>}
                    </div>
                  )}
                </div>
              </div>

              {showAnswer && flipped && (
                <div>
                  <p className="text-center text-sm text-gray-500 mb-3">¿Qué tan fácil fue recordar?</p>
                  <div className="flex justify-center gap-3">
                    <button onClick={() => handleStudy(1)}
                      className="px-5 py-2.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">
                      🔴 Muy difícil
                    </button>
                    <button onClick={() => handleStudy(3)}
                      className="px-5 py-2.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors">
                      🟡 Difícil
                    </button>
                    <button onClick={() => handleStudy(4)}
                      className="px-5 py-2.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors">
                      🟢 Fácil
                    </button>
                    <button onClick={() => handleStudy(5)}
                      className="px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors">
                      💚 Muy fácil
                    </button>
                  </div>
                </div>
              )}

              {!showAnswer && (
                <div className="flex justify-center gap-4">
                  <button onClick={() => { if (currentIndex > 0) { setCurrentIndex(i => i - 1); setFlipped(false); setShowAnswer(false); } }}
                    disabled={currentIndex === 0}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40">
                    Anterior
                  </button>
                  <button onClick={() => { setFlipped(!flipped); setShowAnswer(true); }}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                    Mostrar respuesta
                  </button>
                  <button onClick={() => { if (currentIndex < filteredCards.length - 1) { setCurrentIndex(i => i + 1); setFlipped(false); setShowAnswer(false); } }}
                    disabled={currentIndex >= filteredCards.length - 1}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg disabled:opacity-40">
                    Saltar
                  </button>
                </div>
              )}

              <div className="mt-4 w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-indigo-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${((currentIndex + 1) / filteredCards.length) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
