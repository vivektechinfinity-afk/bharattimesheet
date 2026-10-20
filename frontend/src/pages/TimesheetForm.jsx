import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Upload, PenLine, AlertCircle, CheckCircle, ScanLine } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import FileUploadZone from '../components/FileUploadZone';
import OCRReviewTable from '../components/OCRReviewTable';

const CATEGORIES = ['Development', 'Testing', 'Documentation', 'Design', 'Maintenance', 'Support', 'Meeting', 'Other'];

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  start_time: '09:00',
  end_time: '18:00',
  hours: 9,
  task_name: '',
  category: 'Development',
  description: '',
};

export default function TimesheetForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'upload' ? 'upload' : 'manual');

  // Manual
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  // Upload
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrRows, setOcrRows] = useState(null);
  const [confidence, setConfidence] = useState({});
  const [rawText, setRawText] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // ---------- manual ----------
  const setField = (key, value) => {
    const next = { ...form, [key]: value };
    if (key === 'start_time' || key === 'end_time') {
      if (next.start_time && next.end_time) {
        const [sh, sm] = next.start_time.split(':').map(Number);
        const [eh, em] = next.end_time.split(':').map(Number);
        let d = (eh * 60 + em - sh * 60 - sm) / 60;
        if (d < 0) d += 24;
        next.hours = Math.round(d * 100) / 100;
      }
    }
    setForm(next);
    setErrors({ ...errors, [key]: undefined });
  };

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Date zaroori hai';
    else if (new Date(form.date) > new Date()) e.date = 'Future date allowed nahi hai';
    if (!form.task_name.trim()) e.task_name = 'Task ka naam likhein';
    if (!form.category) e.category = 'Category select karein';
    if (!form.hours || form.hours <= 0) e.hours = 'Hours 0 se zyada hone chahiye';
    else if (form.hours > 24) e.hours = 'Ek din mein 24 ghante se zyada nahi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitManual = async (status) => {
    if (!validate()) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.createTimesheet({
        employeeId: user.id,
        employeeName: user.full_name,
        date: form.date,
        startTime: form.start_time,
        endTime: form.end_time,
        hours: Number(form.hours),
        taskName: form.task_name,
        category: form.category,
        description: form.description,
        status,
      });
      setMessage({ type: 'success', text: status === 'Draft' ? 'Draft save ho gaya' : 'Timesheet submit ho gayi' });
      setForm(emptyForm);
      setTimeout(() => navigate('/timesheets'), 1200);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Save fail hua' });
    } finally {
      setSaving(false);
    }
  };

  // ---------- upload + OCR ----------
  const handleUpload = async (f) => {
    setFile(f);
    setUploading(true);
    setProgress(0);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('employeeId', user.id);
      fd.append('employeeName', user.full_name);

      const res = await api.uploadDocument(fd, setProgress);
      const { rows, confidence: conf, rawText: text } = res.data.data;

      setOcrRows(rows?.length ? rows : [{ ...emptyForm, employee_name: user.full_name, task_name: '', hours: '' }]);
      setConfidence(conf || {});
      setRawText(text || '');
      setMessage({
        type: 'success',
        text: `${rows?.length || 0} entries scan hui. Niche verify karke submit karein.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Scan fail hua. Dusri file try karein.' });
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const submitOcrRows = async (status) => {
    const incomplete = ocrRows.some((r) => !r.date || !r.task_name || !r.category || !r.hours);
    if (incomplete) {
      setMessage({ type: 'error', text: 'Kuch required fields khaali hain — laal border wale bharein.' });
      return;
    }
    setSaving(true);
    try {
      await api.bulkCreate(
        ocrRows.map((r) => ({
          employeeId: user.id,
          employeeName: r.employee_name || user.full_name,
          date: r.date,
          startTime: r.start_time || null,
          endTime: r.end_time || null,
          hours: Number(r.hours),
          taskName: r.task_name,
          category: r.category,
          description: r.description || '',
          status,
          filePath: file?.name,
        }))
      );
      setMessage({ type: 'success', text: `${ocrRows.length} entries save ho gayi` });
      setTimeout(() => navigate('/timesheets'), 1200);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Bulk save fail hua' });
    } finally {
      setSaving(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setOcrRows(null);
    setConfidence({});
    setRawText('');
    setMessage(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">New Timesheet</h1>
        <p className="text-gray-400 mt-1">Manually bharein ya file upload karke auto-scan karwayein</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-dark-800 border border-dark-600 rounded-lg w-fit">
        {[
          { key: 'manual', label: 'Manual Entry', icon: PenLine },
          { key: 'upload', label: 'Upload & Scan', icon: Upload },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setMode(key); setMessage(null); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md transition ${
              mode === key ? 'bg-gradient-gold text-dark-900 font-semibold' : 'text-gray-400 hover:text-accent-gold'
            }`}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* MANUAL */}
      {mode === 'manual' && (
        <div className="card space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="form-label">Date *</label>
              <input type="date" className="input-field" value={form.date} max={new Date().toISOString().split('T')[0]} onChange={(e) => setField('date', e.target.value)} />
              {errors.date && <p className="form-error">{errors.date}</p>}
            </div>
            <div>
              <label className="form-label">Start Time</label>
              <input type="time" className="input-field" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} />
            </div>
            <div>
              <label className="form-label">End Time</label>
              <input type="time" className="input-field" value={form.end_time} onChange={(e) => setField('end_time', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2">
              <label className="form-label">Task / Project *</label>
              <input type="text" className="input-field" placeholder="e.g. Login module bug fix" value={form.task_name} onChange={(e) => setField('task_name', e.target.value)} />
              {errors.task_name && <p className="form-error">{errors.task_name}</p>}
            </div>
            <div>
              <label className="form-label">Hours *</label>
              <input type="number" step="0.25" className="input-field" value={form.hours} onChange={(e) => setField('hours', e.target.value)} />
              {errors.hours && <p className="form-error">{errors.hours}</p>}
            </div>
          </div>

          <div>
            <label className="form-label">Category *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setField('category', c)}
                  className={`px-4 py-2 rounded-lg text-sm transition ${
                    form.category === c ? 'bg-accent-gold/15 border border-accent-gold text-accent-gold' : 'bg-dark-700 border border-dark-600 text-gray-400 hover:border-accent-gold/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {errors.category && <p className="form-error">{errors.category}</p>}
          </div>

          <div>
            <label className="form-label">Description / Kya kaam kiya</label>
            <textarea rows={4} className="input-field resize-none" placeholder="Detail mein likhein — commit, ticket number, blockers..." value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => submitManual('Submitted')} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Save size={18} /> {saving ? 'Saving...' : 'Submit for Approval'}
            </button>
            <button onClick={() => submitManual('Draft')} disabled={saving} className="btn-secondary">
              Save as Draft
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {mode === 'upload' && (
        <div className="space-y-5">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <ScanLine size={18} className="text-accent-gold" />
              <h3 className="font-semibold text-white">Document Scan</h3>
            </div>
            <FileUploadZone
              onFile={handleUpload}
              uploading={uploading}
              progress={progress}
              file={file}
              onClear={resetUpload}
            />
            {uploading && (
              <p className="text-sm text-accent-gold mt-3 animate-pulse">
                Scan ho raha hai... har row aur column padha ja raha hai
              </p>
            )}
          </div>

          {ocrRows && (
            <>
              <div className="card">
                <OCRReviewTable rows={ocrRows} setRows={setOcrRows} confidence={confidence} />
              </div>

              {rawText && (
                <details className="card">
                  <summary className="cursor-pointer text-accent-gold text-sm">Raw scanned text dekhein (verify ke liye)</summary>
                  <pre className="mt-4 p-4 bg-dark-900 rounded-lg text-xs text-gray-400 whitespace-pre-wrap max-h-72 overflow-auto">{rawText}</pre>
                </details>
              )}

              <div className="flex gap-3">
                <button onClick={() => submitOcrRows('Submitted')} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <Save size={18} /> {saving ? 'Saving...' : `Submit ${ocrRows.length} entries`}
                </button>
                <button onClick={() => submitOcrRows('Draft')} disabled={saving} className="btn-secondary">Save as Draft</button>
                <button onClick={resetUpload} className="px-6 py-3 text-gray-400 hover:text-red-400">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
