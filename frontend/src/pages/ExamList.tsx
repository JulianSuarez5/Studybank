import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

interface Exam {
  id: number;
  title: string;
  total_questions: number;
  correct_answers: number;
  started_at: string;
  completed_at: string | null;
}

export default function ExamList() {
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    api.get('/exams').then(({ data }) => setExams(data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Simulacros</h1>
        <Link
          to="/exam/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Nuevo Simulacro
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        {exams.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-500 mb-4">No has realizado ningún simulacro</p>
            <Link to="/exam/new" className="text-indigo-600 font-medium hover:underline">
              Generar tu primer simulacro
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {exams.map((exam) => {
              const percentage = exam.total_questions > 0
                ? Math.round((exam.correct_answers / exam.total_questions) * 100) : 0;

              return (
                <Link
                  key={exam.id}
                  to={`/exams/${exam.id}`}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{exam.title}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(exam.started_at).toLocaleDateString()} - {exam.total_questions} preguntas
                    </p>
                    <p className="text-xs text-gray-400">
                      {exam.completed_at ? 'Completado' : 'En progreso'}
                    </p>
                  </div>
                  <div className="text-right">
                    {exam.completed_at ? (
                      <div>
                        <span className={`text-lg font-bold ${
                          percentage >= 70 ? 'text-green-600' : percentage >= 40 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {percentage}%
                        </span>
                        <p className="text-xs text-gray-400">
                          {exam.correct_answers}/{exam.total_questions}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-amber-600">En progreso</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
