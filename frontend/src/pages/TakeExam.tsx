import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

interface Question {
  id: number;
  statement: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
}

export default function TakeExam() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, { isCorrect: boolean; correctAnswer: string; explanation: string }>>({});
  const [showResult, setShowResult] = useState(false);
  const [finished, setFinished] = useState(false);


  useEffect(() => {
    api.get(`/exams/${id}`).then(({ data }) => {
      setQuestions(data.questions || []);
    }).catch(() => navigate('/exams'));
  }, [id]);

  const currentQ = questions[currentIndex];

  const answerQuestion = async (selected: string) => {
    if (results[currentQ.id]) return;

    setAnswers(prev => ({ ...prev, [currentQ.id]: selected }));

    try {
      const { data } = await api.post(`/exams/${id}/answer`, {
        questionId: currentQ.id,
        selectedAnswer: selected,
      });

      setResults(prev => ({
        ...prev,
        [currentQ.id]: { isCorrect: data.isCorrect, correctAnswer: data.correctAnswer, explanation: data.explanation },
      }));
    } catch {
    }
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowResult(false);
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const finishExam = async () => {
    try {
      await api.post(`/exams/${id}/complete`);
    } catch {
    } finally {
      setFinished(true);
    }
  };

  if (finished) {
    const correct = questions.filter(q => results[q.id]?.isCorrect).length;
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-white rounded-2xl shadow-sm p-10">
          <div className={`text-6xl mb-4 ${score >= 70 ? 'text-green-500' : score >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
            {score >= 70 ? '🎉' : score >= 40 ? '💪' : '📚'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Simulacro Completado</h2>
          <p className="text-5xl font-bold text-indigo-600 my-4">{score}%</p>
          <p className="text-gray-500 mb-2">
            {correct} de {questions.length} respuestas correctas
          </p>
          <div className="flex justify-center gap-4 mt-6">
            <button onClick={() => navigate('/exam/new')} className="px-6 py-2 bg-indigo-600 text-white rounded-lg">Nuevo Simulacro</button>
            <button onClick={() => navigate(`/exams/${id}`)} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg">Ver Detalles</button>
            <button onClick={() => navigate('/stats')} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg">Estadísticas</button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const hasResult = results[currentQ.id];
  const progress = questions.length > 0 ? Math.round((Object.keys(results).length / questions.length) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">
            Pregunta {currentIndex + 1} de {questions.length}
          </span>
          <span className="text-sm font-medium text-indigo-600">{progress}% completado</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="mb-2 flex gap-2">
          {currentQ.topic && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{currentQ.topic}</span>}
        </div>
        <p className="text-lg font-medium text-gray-900 mb-6">{currentQ.statement}</p>

        <div className="space-y-3">
          {currentQ.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = answers[currentQ.id] === opt;
            const isCorrectOption = hasResult && opt === currentQ.correct_answer;
            const isWrongSelected = hasResult && isSelected && !results[currentQ.id]?.isCorrect;

            let className = 'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ';
            if (!hasResult) {
              className += isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 bg-white';
            } else if (isCorrectOption) {
              className += 'border-green-500 bg-green-50';
            } else if (isWrongSelected) {
              className += 'border-red-500 bg-red-50';
            } else {
              className += 'border-gray-200 bg-gray-50 opacity-60';
            }

            return (
              <button
                key={i}
                onClick={() => answerQuestion(opt)}
                disabled={!!hasResult}
                className={className}
              >
                <span className="font-medium mr-2">{letter}.</span>
                {opt}
                {isCorrectOption && <span className="float-right text-green-600">✓</span>}
                {isWrongSelected && <span className="float-right text-red-600">✗</span>}
              </button>
            );
          })}
        </div>

        {hasResult && (
          <div className={`mt-4 p-4 rounded-lg ${results[currentQ.id].isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`font-medium ${results[currentQ.id].isCorrect ? 'text-green-800' : 'text-red-800'}`}>
              {results[currentQ.id].isCorrect ? '✓ Correcto' : `✗ Incorrecto - Respuesta: ${results[currentQ.id].correctAnswer}`}
            </p>
            {results[currentQ.id].explanation && (
              <p className="text-sm mt-1 text-gray-600">{results[currentQ.id].explanation}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={prevQuestion}
          disabled={currentIndex === 0}
          className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg disabled:opacity-40"
        >
          Anterior
        </button>

        <div className="flex gap-2">
          {currentIndex < questions.length - 1 ? (
            <button
              onClick={nextQuestion}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={finishExam}
              disabled={Object.keys(results).length < questions.length}
              className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Finalizar Simulacro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
