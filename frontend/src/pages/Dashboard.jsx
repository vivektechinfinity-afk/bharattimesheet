import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, FileText, AlertTriangle, Plus, Upload } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';

const COLORS = ['#4FE3C1', '#F2B733', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          api.dashboardStats(),
          api.listTimesheets({ limit: 8 }),
        ]);
        setStats(s.data.data);
        setRecent(r.data.data || []);
      } catch (e) {
        setError(e.response?.data?.error || 'Data load nahi hua');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Namaste, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-gray-400 mt-1">Aaj ka overview</p>
        </div>
        <div className="flex gap-3">
          <Link to="/timesheet/new" className="btn-primary flex items-center gap-2">
            <Plus size={18} /> New Entry
          </Link>
          <Link to="/timesheet/new?mode=upload" className="btn-secondary flex items-center gap-2">
            <Upload size={18} /> Upload
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle size={18} className="text-red-400" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard icon={Clock} label="Total Hours (Month)" value={stats?.totalHours ?? 0} sub="Approved only" accent="teal" />
        <StatsCard icon={FileText} label="Entries" value={stats?.entryCount ?? 0} sub="This month" accent="gold" />
        <StatsCard icon={CheckCircle} label="Approved" value={stats?.approvedCount ?? 0} sub="Ready to bill" accent="green" />
        <StatsCard icon={AlertTriangle} label="Pending" value={stats?.pendingCount ?? 0} sub="Awaiting approval" accent="red" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-white mb-4">Daily Hours — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats?.dailyHours || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis
                dataKey="date"
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              />
              <YAxis stroke="#6B7280" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#121212', border: '1px solid #4FE3C1', borderRadius: 8 }}
                labelStyle={{ color: '#4FE3C1' }}
              />
              <Bar dataKey="hours" fill="#4FE3C1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-white mb-4">Category Split</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie isAnimationActive={false}
                data={stats?.categoryBreakdown || []}
                dataKey="hours"
                nameKey="category"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
              >
                {(stats?.categoryBreakdown || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#121212', border: '1px solid #4FE3C1', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {(stats?.categoryBreakdown || []).map((c, i) => (
              <div key={c.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-300">{c.category}</span>
                </div>
                <span className="text-gray-400">{c.hours}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent entries */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Recent Entries</h3>
          <Link to="/timesheets" className="text-accent-gold text-sm hover:text-accent-amber">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 rounded-l-lg">Date</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3 rounded-r-lg">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Abhi koi entry nahi. Pehli entry banaiye.</td></tr>
              )}
              {recent.map((t) => (
                <tr key={t.id} className="table-row">
                  <td className="px-4 py-3 text-gray-300">{new Date(t.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-white">{t.task_name}</td>
                  <td className="px-4 py-3 text-gray-400">{t.category}</td>
                  <td className="px-4 py-3 text-accent-teal font-medium">{t.hours}h</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
