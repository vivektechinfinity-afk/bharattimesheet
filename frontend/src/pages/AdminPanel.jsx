import { useEffect, useState } from 'react';
import { UserPlus, Edit2, Power, X, Check, AlertCircle, Shield } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLES = ['employee', 'manager', 'admin'];
const emptyNew = { fullName: '', email: '', password: '', role: 'employee', department: '' };

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newUser, setNewUser] = useState(emptyNew);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listUsers();
      setUsers(res.data.data || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Users load nahi hue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const create = async () => {
    if (!newUser.fullName.trim() || !newUser.email.trim()) return setError('Name aur email zaroori hai');
    if (newUser.password.length < 8) return setError('Password kam se kam 8 characters ka ho');
    try {
      await api.createUser(newUser);
      setNewUser(emptyNew);
      setShowNew(false);
      setError('');
      flash('Employee add ho gaya');
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Create fail hua');
    }
  };

  const saveEdit = async (id) => {
    try {
      await api.updateUser(id, draft);
      setEditing(null);
      setError('');
      flash('Update ho gaya');
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Update fail hua');
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { isActive: !u.is_active });
      flash(`${u.full_name} ${u.is_active ? 'deactivate' : 'activate'} ho gaya`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Status change fail hua');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={22} className="text-accent-gold" /> Admin Panel
          </h1>
          <p className="text-gray-400 mt-1">{users.length} users · {users.filter((u) => u.is_active).length} active</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary flex items-center gap-2">
          <UserPlus size={18} /> Add Employee
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300 text-sm">
          <Check size={18} /> {success}
        </div>
      )}

      {showNew && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">New Employee</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input className="input-field" value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Email *</label>
              <input type="email" className="input-field" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Password * (min 8)</label>
              <input type="text" className="input-field" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Role</label>
              <select className="input-field" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Department</label>
              <input className="input-field" value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={create} className="btn-primary">Create</button>
            <button onClick={() => { setShowNew(false); setNewUser(emptyNew); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Entries</th>
                  <th className="px-4 py-3">Approved Hrs</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="table-row">
                    <td className="px-4 py-3 text-white">
                      {editing === u.id
                        ? <input className="input-field py-1.5" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
                        : u.full_name}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{u.email}</td>
                    <td className="px-4 py-3">
                      {editing === u.id
                        ? <select className="input-field py-1.5" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        : <span className={`badge ${u.role === 'admin' ? 'badge-rejected' : u.role === 'manager' ? 'badge-submitted' : 'badge-draft'}`}>{u.role}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {editing === u.id
                        ? <input className="input-field py-1.5" value={draft.department || ''} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
                        : u.department || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{u.entry_count}</td>
                    <td className="px-4 py-3 text-accent-teal font-medium">{u.approved_hours}h</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-draft'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editing === u.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(u.id)} className="p-1.5 text-green-400 hover:bg-dark-700 rounded"><Check size={16} /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 text-gray-500 hover:bg-dark-700 rounded"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditing(u.id); setDraft({ fullName: u.full_name, role: u.role, department: u.department }); }}
                            className="p-1.5 text-accent-gold hover:bg-dark-700 rounded"
                          >
                            <Edit2 size={15} />
                          </button>
                          {u.id !== user.id && (
                            <button
                              onClick={() => toggleActive(u)}
                              className={`p-1.5 hover:bg-dark-700 rounded ${u.is_active ? 'text-gray-500 hover:text-red-400' : 'text-green-400'}`}
                              title={u.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <Power size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
