import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';

interface Answer {
  id: number;
  question_id: number;
  selected_answer: string;
  is_correct: number;
  statement: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  specialty: string;
}

export default function ExamDetail() {
  const { id } = useParams();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/exams/${id}`).then(({ data }) => {
      setAnswers(data.answers || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const correct = answers.filter(a => a.is_correct).length;
  const score = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detalle del Simulacro</h1>
          <p className="text-gray-500">
            {correct} correctas de {answers.length} - {score}%
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/exams" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm">Volver</Link>
          <Link to="/exam/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Nuevo</Link>
        </div>
      </div>

      <div className="space-y-4">
        {answers.map((a) => (
          <div key={a.id} className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${
            a.is_correct ? 'border-l-green-500' : 'border-l-red-500'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`text-lg font-bold ${a.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                {a.is_correct ? '✓' : '✗'}
              </span>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{a.statement}</p>
                <div className="mt-2 space-y-1">
                  {a.options.map((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const isSelected = opt === a.selected_answer;
                    const isCorrectOpt = opt === a.correct_answer;
                    return (
                      <p key={i} className={`text-sm ${
                        isCorrectOpt ? 'text-green-700 font-medium' :
                        isSelected && !a.is_correct ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {letter}. {opt}
                        {isCorrectOpt && ' ✓'}
                        {isSelected && !a.is_correct && ' (tu respuesta)'}
                      </p>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  {a.specialty && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{a.specialty}</span>}
                  {a.topic && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{a.topic}</span>}
                </div>
                {a.explanation && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                    {a.explanation}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
