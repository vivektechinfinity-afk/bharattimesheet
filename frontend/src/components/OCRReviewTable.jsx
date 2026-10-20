import { useState } from 'react';
import { AlertTriangle, Trash2, CheckCircle } from 'lucide-react';

const CATEGORIES = ['Development', 'Testing', 'Documentation', 'Design', 'Maintenance', 'Support', 'Meeting', 'Other'];
const FIELDS = [
  { key: 'date', label: 'Date', type: 'date', required: true, width: 'w-36' },
  { key: 'employee_name', label: 'Employee', type: 'text', required: true, width: 'w-40' },
  { key: 'task_name', label: 'Task', type: 'text', required: true, width: 'w-56' },
  { key: 'category', label: 'Category', type: 'select', required: true, width: 'w-40' },
  { key: 'start_time', label: 'Start', type: 'time', required: false, width: 'w-28' },
  { key: 'end_time', label: 'End', type: 'time', required: false, width: 'w-28' },
  { key: 'hours', label: 'Hours', type: 'number', required: true, width: 'w-24' },
  { key: 'description', label: 'Notes', type: 'text', required: false, width: 'w-64' },
];

/**
 * Editable table of OCR-extracted rows. Low-confidence or missing fields
 * are highlighted so nothing gets submitted silently wrong.
 */
export default function OCRReviewTable({ rows, setRows, confidence = {} }) {
  const [touched, setTouched] = useState({});

  const update = (i, key, value) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: value };
    // auto-calculate hours from start/end
    if ((key === 'start_time' || key === 'end_time') && next[i].start_time && next[i].end_time) {
      const [sh, sm] = next[i].start_time.split(':').map(Number);
      const [eh, em] = next[i].end_time.split(':').map(Number);
      let diff = (eh * 60 + em - sh * 60 - sm) / 60;
      if (diff < 0) diff += 24;
      next[i].hours = Math.round(diff * 100) / 100;
    }
    setRows(next);
    setTouched({ ...touched, [`${i}-${key}`]: true });
  };

  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));

  const isMissing = (row, f) => f.required && (row[f.key] === '' || row[f.key] == null);
  const isLowConf = (i, key) => !touched[`${i}-${key}`] && (confidence[`${i}-${key}`] ?? 1) < 0.6;

  const missingCount = rows.reduce(
    (acc, row) => acc + FIELDS.filter((f) => isMissing(row, f)).length, 0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">
          Extracted Data — {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </h3>
        {missingCount > 0 ? (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle size={16} /> {missingCount} field(s) bharna baaki hai
          </div>
        ) : (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle size={16} /> Sab fields complete
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Peela border = OCR ko confidence kam thi, verify karein. Laal border = required field khaali hai.
      </p>

      <div className="overflow-x-auto border border-dark-600 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="px-3 py-3 w-10">#</th>
              {FIELDS.map((f) => (
                <th key={f.key} className={`px-3 py-3 ${f.width}`}>
                  {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="table-row">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                {FIELDS.map((f) => {
                  const border = isMissing(row, f)
                    ? 'border-red-500/60'
                    : isLowConf(i, f.key)
                    ? 'border-amber-500/60'
                    : 'border-dark-600';
                  return (
                    <td key={f.key} className="px-2 py-2">
                      {f.type === 'select' ? (
                        <select
                          className={`w-full px-2 py-1.5 bg-dark-700 border rounded text-white text-sm focus:outline-none focus:border-accent-gold ${border}`}
                          value={row[f.key] || ''}
                          onChange={(e) => update(i, f.key, e.target.value)}
                        >
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type}
                          step={f.type === 'number' ? '0.25' : undefined}
                          className={`w-full px-2 py-1.5 bg-dark-700 border rounded text-white text-sm focus:outline-none focus:border-accent-gold ${border}`}
                          value={row[f.key] ?? ''}
                          onChange={(e) => update(i, f.key, e.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  <button onClick={() => removeRow(i)} className="text-gray-500 hover:text-red-400 p-1">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setRows([...rows, { date: '', employee_name: '', task_name: '', category: '', start_time: '', end_time: '', hours: '', description: '' }])}
        className="text-accent-gold text-sm hover:text-accent-amber"
      >
        + Manually ek aur row add karein
      </button>
    </div>
  );
}
