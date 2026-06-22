import { useEffect, useState } from 'react';
import api from '../api/client';

interface Material {
  id: number;
  title: string;
  content: string;
  topic: string;
  type: 'flashcard' | 'concept' | 'summary';
  created_at: string;
}

export default function Review() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');

  useEffect(() => {
    loadMaterials();
    api.get('/questions/topics').then(({ data }) => setTopics(data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [selectedTopic]);

  const loadMaterials = () => {
    const params = selectedTopic ? `?topic=${selectedTopic}` : '';
    api.get(`/review/materials${params}`).then(({ data }) => setMaterials(data)).catch(() => {});
  };

  const flashcards = materials.filter(m => m.type === 'flashcard');
  const currentCard = flashcards[flashcardIndex];

  const nextCard = () => {
    if (flashcardIndex < flashcards.length - 1) {
      setFlashcardIndex(prev => prev + 1);
      setFlipped(false);
    }
  };

  const prevCard = () => {
    if (flashcardIndex > 0) {
      setFlashcardIndex(prev => prev - 1);
      setFlipped(false);
    }
  };

  const filtered = typeFilter === 'all' ? materials : materials.filter(m => m.type === typeFilter);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Materiales de Repaso</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        <select
          value={selectedTopic}
          onChange={e => setSelectedTopic(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos los temas</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">Todos los tipos</option>
          <option value="flashcard">Flashcards</option>
          <option value="concept">Conceptos Clave</option>
          <option value="summary">Resúmenes</option>
        </select>
      </div>

      {flashcards.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Flashcards ({flashcards.length})</h2>
          <div
            onClick={() => setFlipped(!flipped)}
            className="cursor-pointer min-h-[200px] flex items-center justify-center p-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-100"
          >
            <div className="text-center">
              {flipped ? (
                <div>
                  <p className="text-xs text-indigo-500 mb-2">Respuesta</p>
                  <p className="text-lg text-gray-900">{currentCard?.content}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-indigo-500 mb-2">Pregunta</p>
                  <p className="text-lg font-medium text-gray-900">{currentCard?.title}</p>
                  <p className="text-xs text-gray-400 mt-4">Haz clic para voltear</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <button onClick={prevCard} disabled={flashcardIndex === 0} className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40">Anterior</button>
            <span className="text-sm text-gray-500">{flashcardIndex + 1} / {flashcards.length}</span>
            <button onClick={nextCard} disabled={flashcardIndex >= flashcards.length - 1} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div key={`${item.type}-${item.id}`} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                item.type === 'flashcard' ? 'bg-amber-100 text-amber-700' :
                item.type === 'concept' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {item.type === 'flashcard' ? 'Flashcard' : item.type === 'concept' ? 'Concepto' : 'Resumen'}
              </span>
              {item.topic && <span className="text-xs text-gray-400">{item.topic}</span>}
            </div>
            <h3 className="font-medium text-gray-900">{item.title}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-3">{item.content}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <p className="text-gray-500">No hay materiales de repaso. Sube documentos para generar automáticamente flashcards, conceptos y resúmenes.</p>
        </div>
      )}
    </div>
  );
}
