import { useEffect, useState } from 'react';
import api from '../api/client';

interface TopicStat {
  topic: string;
  total: number;
  correct: number;
  incorrect: number;
  accuracy?: number;
}

interface SpecialtyStat {
  specialty: string;
  total: number;
  correct: number;
  incorrect: number;
}

interface Evolution {
  id: number;
  title: string;
  started_at: string;
  percentage: number;
  correct_answers: number;
  total_questions: number;
}

interface WeakArea {
  topic: string;
  specialty: string;
  total: number;
  correct: number;
  accuracy: number;
}

export default function Stats() {
  const [overview, setOverview] = useState<any>({});
  const [byTopic, setByTopic] = useState<TopicStat[]>([]);
  const [bySpecialty, setBySpecialty] = useState<SpecialtyStat[]>([]);
  const [evolution, setEvolution] = useState<Evolution[]>([]);
  const [weakAreas, setWeakAreas] = useState<{ weakTopics: WeakArea[]; weakSpecialties: WeakArea[] }>({ weakTopics: [], weakSpecialties: [] });
  const [activeTab, setActiveTab] = useState<'overview' | 'topics' | 'specialties' | 'evolution' | 'weak'>('overview');

  useEffect(() => {
    api.get('/stats/overview').then(({ data }) => setOverview(data)).catch(() => {});
    api.get('/stats/by-topic').then(({ data }) => setByTopic(data.map((d: any) => ({ ...d, accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0 })))).catch(() => {});
    api.get('/stats/by-specialty').then(({ data }) => setBySpecialty(data)).catch(() => {});
    api.get('/stats/evolution').then(({ data }) => setEvolution(data)).catch(() => {});
    api.get('/stats/weak-areas').then(({ data }) => setWeakAreas(data)).catch(() => {});
  }, []);

  const tabs = [
    { key: 'overview', label: 'General' },
    { key: 'topics', label: 'Por Tema' },
    { key: 'specialties', label: 'Por Especialidad' },
    { key: 'evolution', label: 'Evolución' },
    { key: 'weak', label: 'Áreas Débiles' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Estadísticas</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Precisión Global', value: `${overview.accuracy || 0}%` },
            { label: 'Preguntas Respondidas', value: overview.totalAnswered || 0 },
            { label: 'Correctas', value: overview.totalCorrect || 0 },
            { label: 'Simulacros', value: overview.completedExams || 0 },
            { label: 'Preguntas en Banco', value: overview.totalQuestions || 0 },
            { label: 'Flashcards', value: overview.totalFlashcards || 0 },
            { label: 'Conceptos Clave', value: overview.totalConcepts || 0 },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'topics' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {byTopic.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Responde preguntas para ver estadísticas por tema</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Tema</th>
                  <th className="text-center p-3 font-medium text-gray-600">Total</th>
                  <th className="text-center p-3 font-medium text-gray-600">Correctas</th>
                  <th className="text-center p-3 font-medium text-gray-600">Incorrectas</th>
                  <th className="text-center p-3 font-medium text-gray-600">Precisión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byTopic.map(row => (
                  <tr key={row.topic}>
                    <td className="p-3 font-medium">{row.topic}</td>
                    <td className="p-3 text-center">{row.total}</td>
                    <td className="p-3 text-center text-green-600">{row.correct || 0}</td>
                    <td className="p-3 text-center text-red-600">{row.incorrect || 0}</td>
                    <td className="p-3 text-center">
                      <span className={`font-bold ${(row.accuracy || 0) >= 70 ? 'text-green-600' : (row.accuracy || 0) >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                        {row.accuracy || 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'specialties' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {bySpecialty.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Responde preguntas para ver estadísticas por especialidad</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Especialidad</th>
                  <th className="text-center p-3 font-medium text-gray-600">Total</th>
                  <th className="text-center p-3 font-medium text-gray-600">Correctas</th>
                  <th className="text-center p-3 font-medium text-gray-600">Incorrectas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bySpecialty.map(row => (
                  <tr key={row.specialty}>
                    <td className="p-3 font-medium">{row.specialty}</td>
                    <td className="p-3 text-center">{row.total}</td>
                    <td className="p-3 text-center text-green-600">{row.correct || 0}</td>
                    <td className="p-3 text-center text-red-600">{row.incorrect || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'evolution' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {evolution.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Completa simulacros para ver tu evolución</p>
          ) : (
            <div className="p-4">
              {evolution.map((e, i) => (
                <div key={e.id} className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{e.title || `Simulacro #${i + 1}`}</p>
                    <p className="text-xs text-gray-400">{new Date(e.started_at).toLocaleDateString()}</p>
                  </div>
                  <div className="w-48 bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${
                        e.percentage >= 70 ? 'bg-green-500' : e.percentage >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${e.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-16 text-right">{e.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'weak' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Temas con Bajo Rendimiento</h2>
            {weakAreas.weakTopics.length === 0 ? (
              <p className="text-sm text-gray-500">No se detectaron temas débiles. ¡Sigue así!</p>
            ) : (
              <div className="space-y-3">
                {weakAreas.weakTopics.map(w => (
                  <div key={w.topic} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{w.topic}</p>
                      <p className="text-xs text-gray-500">{w.specialty} - {w.total} preguntas</p>
                    </div>
                    <span className="text-lg font-bold text-red-600">{w.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Especialidades con Bajo Rendimiento</h2>
            {weakAreas.weakSpecialties.length === 0 ? (
              <p className="text-sm text-gray-500">No se detectaron especialidades débiles</p>
            ) : (
              <div className="space-y-3">
                {weakAreas.weakSpecialties.map(w => (
                  <div key={w.specialty} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{w.specialty}</p>
                      <p className="text-xs text-gray-500">{w.total} preguntas</p>
                    </div>
                    <span className="text-lg font-bold text-amber-600">{w.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
