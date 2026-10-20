import { Link, useLocation } from 'react-router-dom';
import { Home, FilePlus, FileText, BarChart3, CheckSquare, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const items = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/timesheet/new', label: 'New Timesheet', icon: FilePlus },
    { path: '/timesheets', label: user?.role === 'employee' ? 'My Timesheets' : 'All Timesheets', icon: FileText },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  if (['admin', 'manager'].includes(user?.role)) {
    items.push({ path: '/approvals', label: 'Approvals', icon: CheckSquare });
  }
  if (user?.role === 'admin') {
    items.push({ path: '/admin', label: 'Admin Panel', icon: Settings });
  }

  return (
    <aside className="w-64 bg-dark-800 border-r border-dark-600 min-h-screen sticky top-0 flex flex-col">
      <div className="p-6 flex-1">
        <div className="flex items-center gap-3 mb-8">
          <Logo size={42} />
          <div>
            <h2 className="font-semibold text-white leading-tight text-[15px]">Bharat Enterprises</h2>
            <p className="text-xs text-accent-gold tracking-wide">Timesheet Portal</p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {items.map(({ path, label, icon: Icon }) => {
            const active = pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  active
                    ? 'bg-gradient-gold text-dark-900 font-semibold shadow-glow-gold'
                    : 'text-gray-300 hover:bg-dark-700 hover:text-accent-gold'
                }`}
              >
                <Icon size={19} />
                <span className="text-sm">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-6 pt-0">
        <div className="p-4 bg-dark-700 rounded-lg border border-dark-600">
          <p className="text-xs text-gray-400 mb-1">Logged in as</p>
          <p className="text-sm text-white truncate">{user?.full_name}</p>
          <p className="text-xs text-accent-gold capitalize mt-0.5">{user?.role}</p>
        </div>
      </div>
    </aside>
  );
}
