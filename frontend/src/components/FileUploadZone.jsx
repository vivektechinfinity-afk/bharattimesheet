import { useRef, useState } from 'react';
import { UploadCloud, FileText, X, Loader } from 'lucide-react';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv';
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export default function FileUploadZone({ onFile, uploading, progress, file, onClear }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const validate = (f) => {
    if (f.size > MAX_SIZE) return 'File 50MB se badi hai';
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) return `Format ${ext} supported nahi hai`;
    return null;
  };

  const handleFile = (f) => {
    if (!f) return;
    const err = validate(f);
    if (err) { setError(err); return; }
    setError('');
    onFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  if (file) {
    return (
      <div className="border border-accent-gold/40 bg-dark-700 rounded-lg p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-accent-gold/10 rounded-lg flex items-center justify-center shrink-0">
            {uploading ? <Loader size={20} className="text-accent-gold animate-spin" /> : <FileText size={20} className="text-accent-gold" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white truncate">{file.name}</p>
            <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            {uploading && (
              <div className="mt-2 h-1.5 bg-dark-900 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
          {!uploading && (
            <button onClick={onClear} className="text-gray-500 hover:text-red-400 p-2">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${
          dragging ? 'border-accent-gold bg-accent-gold/5' : 'border-dark-600 hover:border-accent-gold/50'
        }`}
      >
        <UploadCloud size={40} className="mx-auto text-accent-gold mb-3" />
        <p className="text-white font-medium">Timesheet file yahan drop karein</p>
        <p className="text-sm text-gray-400 mt-1">ya click karke select karein</p>
        <p className="text-xs text-gray-500 mt-3">PDF, PNG, JPG, Excel, CSV — max 50MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
