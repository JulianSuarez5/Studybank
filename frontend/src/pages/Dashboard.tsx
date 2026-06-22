import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

interface Overview {
  totalQuestions: number;
  totalExams: number;
  completedExams: number;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  totalConcepts: number;
  totalFlashcards: number;
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats/overview').then(({ data }) => {
      setData(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const cards = [
    { label: 'Preguntas en banco', value: data?.totalQuestions || 0, color: 'bg-blue-500' },
    { label: 'Simulacros realizados', value: data?.completedExams || 0, color: 'bg-green-500' },
    { label: 'Respuestas totales', value: data?.totalAnswered || 0, color: 'bg-purple-500' },
    { label: 'Precisión global', value: `${data?.accuracy || 0}%`, color: 'bg-indigo-500' },
    { label: 'Flashcards', value: data?.totalFlashcards || 0, color: 'bg-amber-500' },
    { label: 'Conceptos clave', value: data?.totalConcepts || 0, color: 'bg-teal-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${card.color}`} />
              <span className="text-sm text-gray-500">{card.label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/exam/new" className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900">Generar Simulacro</h2>
          <p className="text-sm text-gray-500 mt-1">Crea un simulacro personalizado</p>
        </Link>
        <Link to="/review" className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900">Materiales de Repaso</h2>
          <p className="text-sm text-gray-500 mt-1">Flashcards, conceptos y resúmenes</p>
        </Link>
        <Link to="/documents" className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900">Subir Documentos</h2>
          <p className="text-sm text-gray-500 mt-1">PDF o Word con preguntas y contenido</p>
        </Link>
        <Link to="/stats" className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900">Estadísticas</h2>
          <p className="text-sm text-gray-500 mt-1">Rendimiento detallado por tema</p>
        </Link>
      </div>
    </div>
  );
}
