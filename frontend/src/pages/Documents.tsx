import { useEffect, useState, useRef } from 'react';
import api from '../api/client';

interface Document {
  id: number;
  original_name: string;
  status: string;
  created_at: string;
}

export default function Documents() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = () => {
    api.get('/documents').then(({ data }) => setDocs(data)).catch(() => setError('Error al cargar documentos'));
  };

  useEffect(() => { loadDocs(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setProcessing(true);
    setError('');
    setResult(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const { data } = await api.post('/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      loadDocs();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al subir el archivo');
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este documento y sus preguntas?')) return;
    try {
      await api.delete(`/documents/${id}`);
      loadDocs();
    } catch {
      setError('Error al eliminar el documento');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Documentos</h1>

      <form onSubmit={handleUpload} className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subir Documento</h2>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={uploading}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Procesando...' : 'Subir y Procesar'}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        {processing && (
          <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
            Procesando documento...
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">Documento procesado exitosamente</p>
            <p className="mt-1 text-xs text-green-600">Tipo: {result.docType}</p>
            <ul className="mt-2 text-sm text-green-700 space-y-1">
              <li>Archivo: {result.filename}</li>
              {result.questionsFound != null && <li>Preguntas encontradas: {result.questionsFound}</li>}
              <li>Conceptos extraídos: {result.conceptsExtracted}</li>
              {result.tablesExtracted > 0 && <li>Tablas extraídas: {result.tablesExtracted}</li>}
              {result.summariesExtracted > 0 && <li>Resúmenes extraídos: {result.summariesExtracted}</li>}
              {result.aiProcessed && (
                <>
                  <li className="font-medium text-indigo-700 mt-2">✨ Generado por IA:</li>
                  {result.aiQuestionsGenerated > 0 && <li>- Preguntas generadas: {result.aiQuestionsGenerated}</li>}
                  {result.aiConceptsExtracted > 0 && <li>- Conceptos extraídos: {result.aiConceptsExtracted}</li>}
                  {result.aiFlashcardsGenerated > 0 && <li>- Flashcards generadas: {result.aiFlashcardsGenerated}</li>}
                  {result.aiSummariesGenerated > 0 && <li>- Resúmenes generados: {result.aiSummariesGenerated}</li>}
                </>
              )}
            </ul>
          </div>
        )}
      </form>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Documentos Subidos</h2>
        </div>
        {docs.length === 0 ? (
          <p className="p-6 text-gray-500 text-center">No hay documentos subidos</p>
        ) : (
          <div className="divide-y">
            {docs.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{doc.original_name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString()} -{' '}
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      doc.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {doc.status === 'completed' ? 'Procesado' : 'En proceso'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
