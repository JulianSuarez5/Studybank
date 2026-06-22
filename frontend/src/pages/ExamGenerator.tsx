import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ExamGenerator() {
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(10);
  const [wrongQuestions, setWrongQuestions] = useState(false);
  const [weakTopics, setWeakTopics] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/questions/specialties').then(({ data }) => setSpecialties(data)).catch(() => {});
    api.get('/questions/topics').then(({ data }) => setTopics(data)).catch(() => {});
  }, []);

  const toggleSpecialty = (s: string) => {
    setSelectedSpecialties(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const toggleTopic = (t: string) => {
    setSelectedTopics(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/exams/generate', {
        title: 'Simulacro personalizado',
        specialties: selectedSpecialties,
        topics: selectedTopics,
        numQuestions,
        wrongQuestions,
        weakTopics,
      });
      navigate(`/exam/${data.attemptId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al generar simulacro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Generar Simulacro</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Especialidades</h2>
          <div className="flex flex-wrap gap-2">
            {specialties.map(s => (
              <button
                key={s}
                onClick={() => toggleSpecialty(s)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selectedSpecialties.includes(s)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {s}
              </button>
            ))}
            {specialties.length === 0 && <p className="text-sm text-gray-400">Sin especialidades</p>}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Temas</h2>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {topics.map(t => (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selectedTopics.includes(t)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {t}
              </button>
            ))}
            {topics.length === 0 && <p className="text-sm text-gray-400">Sin temas</p>}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Opciones</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Número de preguntas</label>
              <input
                type="number"
                min={1}
                max={200}
                value={numQuestions}
                onChange={e => setNumQuestions(Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wrongQuestions}
                onChange={e => setWrongQuestions(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">Solo preguntas respondidas incorrectamente</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={weakTopics}
                onChange={e => setWeakTopics(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">Enfocar en temas con bajo rendimiento</span>
            </label>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Generando...' : 'Comenzar Simulacro'}
        </button>
      </div>
    </div>
  );
}
