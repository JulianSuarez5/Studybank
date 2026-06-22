import { useEffect, useState } from 'react';
import api from '../api/client';

interface Question {
  id: number;
  statement: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  subtopic: string;
  specialty: string;
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filtered, setFiltered] = useState<Question[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    api.get('/questions/specialties').then(({ data }) => setSpecialties(data)).catch(() => {});
    api.get('/questions').then(({ data }) => {
      setQuestions(data);
      setFiltered(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedSpecialty) {
      api.get(`/questions/topics?specialty=${selectedSpecialty}`).then(({ data }) => setTopics(data)).catch(() => {});
    } else {
      setTopics([]);
    }
  }, [selectedSpecialty]);

  useEffect(() => {
    let result = questions;
    if (selectedSpecialty) result = result.filter(q => q.specialty === selectedSpecialty);
    if (selectedTopic) result = result.filter(q => q.topic === selectedTopic);
    if (search) result = result.filter(q => q.statement.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  }, [selectedSpecialty, selectedTopic, search, questions]);

  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setEditForm({
      statement: q.statement,
      options: [...q.options],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      topic: q.topic,
      subtopic: q.subtopic,
      specialty: q.specialty,
    });
  };

  const saveEdit = async (id: number) => {
    try {
      await api.put(`/questions/${id}`, editForm);
      setEditingId(null);
      const { data } = await api.get('/questions');
      setQuestions(data);
    } catch {
      alert('Error al guardar la pregunta');
    }
  };

  const deleteQuestion = async (id: number) => {
    if (!confirm('¿Eliminar esta pregunta?')) return;
    try {
      await api.delete(`/questions/${id}`);
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch {
      alert('Error al eliminar la pregunta');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Banco de Preguntas</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar preguntas..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs text-gray-500 mb-1">Especialidad</label>
          <select
            value={selectedSpecialty}
            onChange={e => { setSelectedSpecialty(e.target.value); setSelectedTopic(''); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas</option>
            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="block text-xs text-gray-500 mb-1">Tema</label>
          <select
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((q) => (
          <div key={q.id} className="bg-white rounded-xl shadow-sm p-5">
            {editingId === q.id ? (
              <div className="space-y-3">
                <textarea
                  value={editForm.statement}
                  onChange={e => setEditForm({ ...editForm, statement: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={3}
                />
                <div className="space-y-1">
                  {editForm.options.map((opt: string, i: number) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-sm font-medium w-6 text-gray-500">{String.fromCharCode(65 + i)}.</span>
                      <input
                        value={opt}
                        onChange={e => {
                          const opts = [...editForm.options];
                          opts[i] = e.target.value;
                          setEditForm({ ...editForm, options: opts });
                        }}
                        className="flex-1 border rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Respuesta correcta</label>
                  <input
                    value={editForm.correct_answer}
                    onChange={e => setEditForm({ ...editForm, correct_answer: e.target.value })}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Explicación</label>
                  <textarea
                    value={editForm.explanation}
                    onChange={e => setEditForm({ ...editForm, explanation: e.target.value })}
                    className="w-full border rounded p-2 text-sm"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={editForm.specialty}
                    onChange={e => setEditForm({ ...editForm, specialty: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  >
                    <option value="">Especialidad</option>
                    {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    value={editForm.topic}
                    onChange={e => setEditForm({ ...editForm, topic: e.target.value })}
                    placeholder="Tema"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <input
                    value={editForm.subtopic}
                    onChange={e => setEditForm({ ...editForm, subtopic: e.target.value })}
                    placeholder="Subtema"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(q.id)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm">Guardar</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm">Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">{q.statement}</p>
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, i) => (
                        <p key={i} className={`text-sm ${opt === q.correct_answer ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                          {String.fromCharCode(65 + i)}. {opt} {opt === q.correct_answer && '✓'}
                        </p>
                      ))}
                    </div>
                    {q.explanation && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                        <strong>Explicación:</strong> {q.explanation}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      {q.specialty && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{q.specialty}</span>}
                      {q.topic && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{q.topic}</span>}
                      {q.subtopic && <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">{q.subtopic}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => startEdit(q)} className="text-sm text-indigo-600 hover:underline">Editar</button>
                    <button onClick={() => deleteQuestion(q.id)} className="text-sm text-red-600 hover:underline">Eliminar</button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-10">No hay preguntas que coincidan con los filtros</p>
        )}
      </div>
    </div>
  );
}
