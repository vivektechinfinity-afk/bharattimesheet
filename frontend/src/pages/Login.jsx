import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.email || !form.password) {
      setError('Email aur password dono zaroori hain');
      return;
    }

    setLoading(true);
    const result = await login(form.email, form.password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Login failed. Credentials check karein.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow — mirrors the hero section on bharatenterprises.tech */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-teal/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-gold/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Logo size={64} className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">Bharat Enterprises</h1>
          <p className="text-accent-gold mt-1 tracking-wide">Timesheet Portal</p>
          <p className="text-gray-400 text-sm mt-2">Apne kaam ka hisaab, ek jagah</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-xl font-semibold text-white">Sign In</h2>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="form-label">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                className="input-field pl-12"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field pl-12 pr-12"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-accent-gold"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="pt-4 border-t border-dark-600">
            <p className="text-xs text-gray-500 mb-2">
              Demo credentials (password <code className="text-gray-400">password123</code>):
            </p>
            <div className="space-y-1 text-xs text-gray-400">
              <p>Admin — admin@example.com</p>
              <p>Manager — manager@example.com</p>
              <p>Employee — emp1@example.com</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
