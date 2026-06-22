import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/ai-tutor', label: 'Tutor IA', icon: '🤖' },
  { to: '/study-plan', label: 'Plan Estudio', icon: '📖' },
  { to: '/documents', label: 'Documentos', icon: '📄' },
  { to: '/flashcards', label: 'Flashcards', icon: '🃏' },
  { to: '/questions', label: 'Banco Preguntas', icon: '❓' },
  { to: '/exam/new', label: 'Generar Simulacro', icon: '📝' },
  { to: '/exams', label: 'Simulacros', icon: '📋' },
  { to: '/stats', label: 'Estadísticas', icon: '📈' },
  { to: '/review', label: 'Materiales', icon: '🧠' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-lg flex flex-col">
        <div className="p-5 border-b">
          <h1 className="text-xl font-bold text-indigo-600">StudyBank</h1>
          <p className="text-sm text-gray-500 mt-1">{user?.name}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
