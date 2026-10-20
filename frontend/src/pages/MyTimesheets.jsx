import { useEffect, useState, useMemo } from 'react';
import { Search, Filter, Download, Trash2, Edit2, X, Check } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const CATEGORIES = ['Development', 'Testing', 'Documentation', 'Design', 'Maintenance', 'Support', 'Meeting', 'Other'];
const STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected'];

export default function MyTimesheets() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', category: '', startDate: '', endDate: '' });
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

  const isPrivileged = user?.role === 'admin' || user?.role === 'manager';

  const load = async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (!isPrivileged) params.employeeId = user.id;
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await api.listTimesheets(params);
      setRows(res.data.data || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Load fail hua');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.task_name, r.category, r.description, r.employee_name].some((v) => v?.toLowerCase().includes(q))
        )
      : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const cmp = sort.key === 'hours' ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sort]);

  const totalHours = visible.reduce((s, r) => s + Number(r.hours || 0), 0);

  const startEdit = (row) => {
    setEditing(row.id);
    setDraft({ task_name: row.task_name, category: row.category, hours: row.hours, description: row.description || '' });
  };

  const saveEdit = async (id) => {
    try {
      await api.updateTimesheet(id, {
        taskName: draft.task_name,
        category: draft.category,
        hours: Number(draft.hours),
        description: draft.description,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Update fail hua');
    }
  };

  const remove = async (id) => {
    if (!confirm('Yeh entry delete karni hai?')) return;
    try {
      await api.deleteTimesheet(id);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete fail hua');
    }
  };

  const exportCsv = () => {
    const headers = ['Date', 'Employee', 'Task', 'Category', 'Start', 'End', 'Hours', 'Status', 'Description'];
    const lines = visible.map((r) =>
      [r.date, r.employee_name, r.task_name, r.category, r.start_time || '', r.end_time || '', r.hours, r.status, (r.description || '').replace(/"/g, '""')]
        .map((v) => `"${v ?? ''}"`).join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{isPrivileged ? 'All Timesheets' : 'My Timesheets'}</h1>
          <p className="text-gray-400 mt-1">{visible.length} entries · {totalHours.toFixed(2)} total hours</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary flex items-center gap-2">
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-accent-gold">
          <Filter size={16} /> <span className="text-sm font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input-field pl-10" placeholder="Task, category, notes search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" className="input-field" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          <input type="date" className="input-field" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
        </div>
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">{error}</div>}

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="table-header">
                  {[
                    { k: 'date', l: 'Date' },
                    ...(isPrivileged ? [{ k: 'employee_name', l: 'Employee' }] : []),
                    { k: 'task_name', l: 'Task' },
                    { k: 'category', l: 'Category' },
                    { k: 'hours', l: 'Hours' },
                    { k: 'status', l: 'Status' },
                  ].map(({ k, l }) => (
                    <th key={k} onClick={() => sortBy(k)} className="px-4 py-3 cursor-pointer select-none hover:text-accent-gold">
                      {l} {sort.key === k && (sort.dir === 'asc' ? '↑' : '↓')}
                    </th>
                  ))}
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">Koi entry nahi mili</td></tr>
                )}
                {visible.map((r) => (
                  <tr key={r.id} className="table-row align-top">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                    {isPrivileged && <td className="px-4 py-3 text-gray-300">{r.employee_name}</td>}
                    <td className="px-4 py-3 text-white">
                      {editing === r.id
                        ? <input className="input-field py-1.5" value={draft.task_name} onChange={(e) => setDraft({ ...draft, task_name: e.target.value })} />
                        : r.task_name}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {editing === r.id
                        ? <select className="input-field py-1.5" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        : r.category}
                    </td>
                    <td className="px-4 py-3 text-accent-teal font-medium">
                      {editing === r.id
                        ? <input type="number" step="0.25" className="input-field py-1.5 w-24" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} />
                        : `${r.hours}h`}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs">
                      {editing === r.id
                        ? <textarea rows={2} className="input-field py-1.5 resize-none" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                        : <span className="line-clamp-2">{r.description || '—'}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {editing === r.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(r.id)} className="p-1.5 text-green-400 hover:bg-dark-700 rounded"><Check size={16} /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 text-gray-500 hover:bg-dark-700 rounded"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          {(r.status === 'Draft' || r.status === 'Rejected' || isPrivileged) && (
                            <button onClick={() => startEdit(r)} className="p-1.5 text-accent-gold hover:bg-dark-700 rounded"><Edit2 size={15} /></button>
                          )}
                          {(r.status === 'Draft' || isPrivileged) && (
                            <button onClick={() => remove(r.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-dark-700 rounded"><Trash2 size={15} /></button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {visible.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-accent-teal/30">
                    <td colSpan={isPrivileged ? 4 : 3} className="px-4 py-3 text-right text-gray-400 font-medium">Total</td>
                    <td className="px-4 py-3 text-accent-teal font-bold">{totalHours.toFixed(2)}h</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
