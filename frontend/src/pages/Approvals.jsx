import { useEffect, useState } from 'react';
import { Check, X, AlertCircle, Inbox } from 'lucide-react';
import { api } from '../api/client';

export default function Approvals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.pendingApprovals();
      setRows(res.data.data || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Load fail hua');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (id, approve) => {
    setBusy(id);
    try {
      const comment = comments[id] || '';
      if (!approve && !comment.trim()) {
        setError('Reject karne ke liye reason likhna zaroori hai');
        setBusy(null);
        return;
      }
      if (approve) await api.approve(id, comment);
      else await api.reject(id, comment);
      setRows(rows.filter((r) => r.id !== id));
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Action fail hua');
    } finally {
      setBusy(null);
    }
  };

  const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pending Approvals</h1>
        <p className="text-gray-400 mt-1">{rows.length} entries · {totalHours.toFixed(2)} hours waiting</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16">
          <Inbox size={44} className="mx-auto text-gray-600 mb-3" />
          <p className="text-white font-medium">Sab clear hai</p>
          <p className="text-gray-500 text-sm mt-1">Koi approval pending nahi</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-white">{r.employee_name}</span>
                    <span className="text-gray-500 text-sm">
                      {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="badge badge-submitted">{r.category}</span>
                    <span className="text-accent-teal font-medium">{r.hours}h</span>
                    {r.start_time && <span className="text-gray-500 text-sm">{r.start_time}–{r.end_time}</span>}
                  </div>
                  <p className="text-white mt-2">{r.task_name}</p>
                  {r.description && <p className="text-gray-400 text-sm mt-1">{r.description}</p>}
                  {r.file_path && <p className="text-gray-500 text-xs mt-1">📎 {r.file_path}</p>}
                </div>

                <div className="flex flex-col gap-2 w-full md:w-80">
                  <input
                    className="input-field py-2 text-sm"
                    placeholder="Comment (reject ke liye zaroori)"
                    value={comments[r.id] || ''}
                    onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(r.id, true)}
                      disabled={busy === r.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg hover:bg-green-600/30 transition disabled:opacity-50"
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={() => act(r.id, false)}
                      disabled={busy === r.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/40 text-red-300 rounded-lg hover:bg-red-600/30 transition disabled:opacity-50"
                    >
                      <X size={16} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
