import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useEffect } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import QuestionBank from './pages/QuestionBank';
import ExamGenerator from './pages/ExamGenerator';
import TakeExam from './pages/TakeExam';
import ExamList from './pages/ExamList';
import ExamDetail from './pages/ExamDetail';
import Stats from './pages/Stats';
import Review from './pages/Review';
import FlashcardsPage from './pages/Flashcards';
import AITutor from './pages/AITutor';
import StudyPlan from './pages/StudyPlan';

export default function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/questions" element={<QuestionBank />} />
                <Route path="/exam/new" element={<ExamGenerator />} />
                <Route path="/exam/generator" element={<ExamGenerator />} />
                <Route path="/exam/:id" element={<TakeExam />} />
                <Route path="/exams" element={<ExamList />} />
                <Route path="/exams/:id" element={<ExamDetail />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/flashcards" element={<FlashcardsPage />} />
                <Route path="/review" element={<Review />} />
                <Route path="/ai-tutor" element={<AITutor />} />
                <Route path="/study-plan" element={<StudyPlan />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
