import { useNavigate } from 'react-router-dom';
import { LogOut, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-dark-900 border-b border-dark-600 sticky top-0 z-20">
      <div className="px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <span className="text-white font-semibold tracking-wide">Timesheet Portal</span>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="tel:+919967169405"
            className="hidden md:flex items-center gap-2 text-sm text-gray-400 hover:text-accent-gold transition"
          >
            <Phone size={15} /> +91-99671 69405
          </a>

          <div className="flex items-center gap-3 pl-6 border-l border-dark-600">
            <div className="text-right">
              <p className="text-white text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-accent-gold capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-gray-400 hover:text-accent-gold hover:bg-dark-700 transition"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
