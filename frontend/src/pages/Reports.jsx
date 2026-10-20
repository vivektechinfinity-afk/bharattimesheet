import { useEffect, useState } from 'react';
import { Download, Calendar, TrendingUp, Clock, Users, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../api/client';
import StatusBadge from '../components/StatusBadge';

const COLORS = ['#4FE3C1', '#F2B733', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#6366F1'];

const firstOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
};

export default function Reports() {
  const [range, setRange] = useState({ startDate: firstOfMonth(), endDate: new Date().toISOString().split('T')[0] });
  const [status, setStatus] = useState('Approved');
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (new Date(range.startDate) > new Date(range.endDate)) {
      setError('Start date end date se pehle honi chahiye');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [s, t] = await Promise.all([
        api.summaryReport({ ...range, status }),
        api.listTimesheets({ ...range }),
      ]);
      setSummary(s.data.data);

      // Group entries by date for the day-wise log
      const byDate = {};
      (t.data.data || []).forEach((r) => {
        const key = String(r.date).split('T')[0];
        byDate[key] ??= { date: key, hours: 0, entries: [] };
        byDate[key].hours += Number(r.hours);
        byDate[key].entries.push(r);
      });
      setTimeline(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) {
      setError(e.response?.data?.error || 'Report load nahi hui');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportCsv = async () => {
    try {
      const res = await api.exportReport({ ...range, status });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${range.startDate}-to-${range.endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Export fail hua');
    }
  };

  const categoryTotals = (() => {
    const map = {};
    (summary?.rows || []).forEach((r) => {
      map[r.category] = (map[r.category] || 0) + r.total_hours;
    });
    return Object.entries(map).map(([category, hours]) => ({ category, hours }));
  })();

  const employeeTotals = (summary?.byEmployee || []).map((e) => ({ name: e.employee, hours: Math.round(e.total * 100) / 100 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-gray-400 mt-1">Date-wise, employee-wise, category-wise breakdown</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary flex items-center gap-2">
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="form-label">From</label>
            <input type="date" className="input-field" value={range.startDate} onChange={(e) => setRange({ ...range, startDate: e.target.value })} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="input-field" value={range.endDate} onChange={(e) => setRange({ ...range, endDate: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['Approved', 'Submitted', 'Draft', 'Rejected', 'All'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={load} disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {summary && (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="card">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-accent-teal" />
                <div>
                  <p className="text-sm text-gray-400">Total Hours</p>
                  <p className="text-3xl font-bold text-white">{summary.grandTotal}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <Users size={20} className="text-accent-gold" />
                <div>
                  <p className="text-sm text-gray-400">Employees</p>
                  <p className="text-3xl font-bold text-white">{summary.byEmployee.length}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <TrendingUp size={20} className="text-green-400" />
                <div>
                  <p className="text-sm text-gray-400">Avg / Employee</p>
                  <p className="text-3xl font-bold text-white">
                    {summary.byEmployee.length ? (summary.grandTotal / summary.byEmployee.length).toFixed(1) : 0}h
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="font-semibold text-white mb-4">Hours by Employee</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={employeeTotals} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis type="number" stroke="#6B7280" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="#6B7280" fontSize={12} width={110} />
                  <Tooltip contentStyle={{ background: '#121212', border: '1px solid #4FE3C1', borderRadius: 8 }} />
                  <Bar dataKey="hours" fill="#4FE3C1" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="font-semibold text-white mb-4">Hours by Category</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie isAnimationActive={false} data={categoryTotals} dataKey="hours" nameKey="category" innerRadius={60} outerRadius={110} paddingAngle={3}>
                    {categoryTotals.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#121212', border: '1px solid #4FE3C1', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Employee x Category matrix */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Employee × Category Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Entries</th>
                    <th className="px-4 py-3">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Is range mein koi data nahi</td></tr>
                  )}
                  {summary.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-4 py-3 text-white">{r.employee_name}</td>
                      <td className="px-4 py-3 text-gray-400">{r.category}</td>
                      <td className="px-4 py-3 text-gray-400">{r.entry_count}</td>
                      <td className="px-4 py-3 text-accent-teal font-medium">{r.total_hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Day-wise log */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-accent-teal" />
              <h3 className="font-semibold text-white">Day-wise Work Log</h3>
            </div>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {timeline.length === 0 && <p className="text-gray-500 text-sm">Koi entry nahi</p>}
              {timeline.map((day) => (
                <div key={day.date} className="border-l-2 border-accent-teal/40 pl-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-white">
                      {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <span className="text-accent-teal text-sm font-medium">{day.hours.toFixed(2)}h</span>
                  </div>
                  <div className="space-y-1.5">
                    {day.entries.map((e) => (
                      <div key={e.id} className="flex items-start gap-3 text-sm p-2 bg-dark-700/50 rounded">
                        <span className="text-gray-400 w-32 shrink-0 truncate">{e.employee_name}</span>
                        <span className="text-white flex-1">{e.task_name}</span>
                        <span className="text-gray-500 w-28 shrink-0">{e.category}</span>
                        <span className="text-accent-teal w-14 shrink-0 text-right">{e.hours}h</span>
                        <StatusBadge status={e.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
