const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');
const { CATEGORIES } = require('../middleware/validation');

/**
 * Turns an uploaded timesheet (image / PDF / Excel / CSV) into structured rows.
 *
 * Strategy by file type:
 *   - .xlsx/.xls/.csv -> read the real cells (no OCR guessing, 100% accurate)
 *   - .pdf            -> extract embedded text; fall back to OCR if the PDF is a scan
 *   - images          -> Tesseract OCR, then table/line parsing
 *
 * Returns { rows, confidence, rawText, source }.
 * `confidence` maps "<rowIndex>-<field>" -> 0..1 so the UI can highlight
 * anything the parser wasn't sure about instead of silently accepting it.
 */

const HEADER_ALIASES = {
  date: ['date', 'day', 'work date', 'dt', 'date of work', 'tarikh'],
  employee_name: ['employee', 'employee name', 'name', 'staff', 'emp name', 'resource', 'member'],
  task_name: ['task', 'task name', 'work', 'work done', 'project', 'activity', 'description of work', 'job', 'ticket', 'summary'],
  category: ['category', 'type', 'work type', 'department', 'classification'],
  start_time: ['start', 'start time', 'from', 'in', 'in time', 'clock in'],
  end_time: ['end', 'end time', 'to', 'out', 'out time', 'clock out'],
  hours: ['hours', 'hrs', 'total hours', 'duration', 'time spent', 'qty', 'hours worked'],
  description: ['description', 'notes', 'remarks', 'comment', 'details', 'detail'],
};

const EMPTY_ROW = {
  date: '', employee_name: '', task_name: '', category: '',
  start_time: '', end_time: '', hours: '', description: '',
};

// ---------------------------------------------------------------- helpers

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Maps a sheet's header row to our canonical field names. */
function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((raw, idx) => {
    const norm = normalizeHeader(raw);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm) || aliases.some((a) => norm.includes(a))) {
        if (map[field] == null) map[field] = idx;
        break;
      }
    }
  });
  return map;
}

/** Parses many date shapes into YYYY-MM-DD. Returns '' when unparseable. */
function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  const s = String(value).trim();

  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // ISO: 2026-10-20
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD-MM-YYYY or MM/DD/YYYY — assume day-first (Indian convention) unless >12
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    let day = Number(a), month = Number(b);
    if (day > 12 && month <= 12) { /* day-first, correct */ }
    else if (month > 12 && day <= 12) { [day, month] = [month, day]; }
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // "20 Oct 2026" / "Oct 20, 2026"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = s.toLowerCase().match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})/);
  if (m) return `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})\s*,?\s*(\d{4})/);
  if (m) return `${m[3]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;

  return '';
}

/** Normalizes 9am / 09:00 / 9.00 / 0900 to HH:MM 24-hour. */
function normalizeTime(value) {
  if (!value) return '';
  const s = String(value).trim().toLowerCase();

  let m = s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2];
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23) return '';
    return `${String(h).padStart(2, '0')}:${min}`;
  }

  m = s.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    if (m[2] === 'pm' && h < 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }

  m = s.match(/^(\d{2})(\d{2})$/); // 0900
  if (m && Number(m[1]) <= 23) return `${m[1]}:${m[2]}`;

  return '';
}

function normalizeHours(value, startTime, endTime) {
  const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isNaN(n) && n > 0 && n <= 24) return Math.round(n * 100) / 100;

  // Derive from start/end when the hours cell is blank or garbage
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diff = (eh * 60 + em - sh * 60 - sm) / 60;
    if (diff < 0) diff += 24;
    if (diff > 0 && diff <= 24) return Math.round(diff * 100) / 100;
  }
  return '';
}

/** Snaps free text onto one of our known categories. */
function normalizeCategory(value) {
  if (!value) return '';
  const s = String(value).toLowerCase().trim();
  const exact = CATEGORIES.find((c) => c.toLowerCase() === s);
  if (exact) return exact;

  const hints = {
    Development: ['dev', 'coding', 'code', 'build', 'feature', 'implement', 'programming', 'bug fix', 'bugfix'],
    Testing: ['test', 'qa', 'quality', 'verification'],
    Documentation: ['doc', 'write-up', 'readme', 'spec'],
    Design: ['design', 'ui', 'ux', 'figma', 'mockup', 'graphic'],
    Maintenance: ['maintenance', 'refactor', 'cleanup', 'upgrade', 'patch'],
    Support: ['support', 'helpdesk', 'ticket', 'customer'],
    Meeting: ['meeting', 'call', 'standup', 'scrum', 'sync', 'discussion'],
  };
  for (const [cat, words] of Object.entries(hints)) {
    if (words.some((w) => s.includes(w))) return cat;
  }
  return '';
}

function inferCategoryFromTask(task) {
  return normalizeCategory(task) || '';
}

// ---------------------------------------------------------- row assembly

/**
 * Builds a canonical row + per-field confidence from whatever raw values
 * we managed to pull out. Anything we had to infer gets a lower score so
 * the reviewer sees a highlight.
 */
function buildRow(raw, rowIndex, confidence, defaults = {}) {
  const row = { ...EMPTY_ROW };
  const mark = (field, score) => { confidence[`${rowIndex}-${field}`] = score; };

  row.date = normalizeDate(raw.date);
  mark('date', row.date ? (raw.date ? 0.95 : 0.3) : 0);

  row.employee_name = String(raw.employee_name || '').trim() || defaults.employeeName || '';
  mark('employee_name', raw.employee_name ? 0.9 : (defaults.employeeName ? 0.5 : 0));

  row.task_name = String(raw.task_name || '').trim();
  mark('task_name', row.task_name ? 0.9 : 0);

  row.start_time = normalizeTime(raw.start_time);
  mark('start_time', row.start_time ? 0.9 : (raw.start_time ? 0.2 : 1));

  row.end_time = normalizeTime(raw.end_time);
  mark('end_time', row.end_time ? 0.9 : (raw.end_time ? 0.2 : 1));

  row.hours = normalizeHours(raw.hours, row.start_time, row.end_time);
  mark('hours', raw.hours && row.hours ? 0.95 : (row.hours ? 0.55 : 0));

  const explicitCat = normalizeCategory(raw.category);
  row.category = explicitCat || inferCategoryFromTask(row.task_name);
  mark('category', explicitCat ? 0.95 : (row.category ? 0.4 : 0));

  row.description = String(raw.description || '').trim();
  mark('description', 1);

  return row;
}

/** A row is worth keeping if it has any real signal at all. */
function hasSignal(row) {
  return Boolean(row.date || row.task_name || row.hours || row.start_time);
}

// ------------------------------------------------- spreadsheet extraction

function extractFromSheetMatrix(matrix, defaults) {
  const confidence = {};
  const rows = [];

  // Find the header row: the first row that maps at least 2 known fields.
  let headerIdx = -1;
  let headerMap = {};
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const map = mapHeaders(matrix[i]);
    if (Object.keys(map).length >= 2) { headerIdx = i; headerMap = map; break; }
  }

  if (headerIdx === -1) {
    // No header found — treat every row as positional best-effort.
    matrix.forEach((cells, i) => {
      const raw = {
        date: cells[0], task_name: cells[1], hours: cells[2], category: cells[3],
      };
      const row = buildRow(raw, rows.length, confidence, defaults);
      if (hasSignal(row)) rows.push(row);
    });
    return { rows, confidence };
  }

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells || cells.every((c) => c === '' || c == null)) continue;

    const raw = {};
    for (const [field, colIdx] of Object.entries(headerMap)) {
      raw[field] = cells[colIdx];
    }
    const row = buildRow(raw, rows.length, confidence, defaults);
    if (hasSignal(row)) rows.push(row);
  }

  return { rows, confidence };
}

async function extractFromSpreadsheet(filePath, defaults) {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const allRows = [];
  const allConf = {};
  const texts = [];

  for (const sheetName of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1, defval: '', blankrows: false, raw: false,
    });
    if (!matrix.length) continue;

    texts.push(`--- Sheet: ${sheetName} ---\n${matrix.map((r) => r.join(' | ')).join('\n')}`);

    const { rows, confidence } = extractFromSheetMatrix(matrix, defaults);
    // Re-key confidence to the combined row offset
    const offset = allRows.length;
    Object.entries(confidence).forEach(([k, v]) => {
      const [idx, field] = k.split('-');
      allConf[`${Number(idx) + offset}-${field}`] = v;
    });
    allRows.push(...rows);
  }

  return { rows: allRows, confidence: allConf, rawText: texts.join('\n\n'), source: 'spreadsheet' };
}

async function extractFromCsv(filePath, defaults) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matrix = parseCsv(content, { skip_empty_lines: true, relax_column_count: true, trim: true });
  const { rows, confidence } = extractFromSheetMatrix(matrix, defaults);
  return { rows, confidence, rawText: content.slice(0, 20000), source: 'csv' };
}

// ------------------------------------------------------- text extraction

/**
 * Parses plain text (from a PDF or OCR) into rows. Handles two shapes:
 *   1. Pipe/tab/multi-space separated tables with a header line
 *   2. Free-form "Date: ... Task: ... Hours: ..." blocks
 */
function extractFromText(text, defaults) {
  const confidence = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- shape 1: delimited table
  const splitRow = (line) => {
    if (line.includes('|')) return line.split('|').map((c) => c.trim());
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((c) => c.trim());
    return null;
  };

  let headerIdx = -1;
  let headerMap = {};
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cells = splitRow(lines[i]);
    if (!cells || cells.length < 2) continue;
    const map = mapHeaders(cells);
    if (Object.keys(map).length >= 2) { headerIdx = i; headerMap = map; break; }
  }

  const rows = [];
  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      if (!cells || cells.length < 2) continue;
      const raw = {};
      for (const [field, colIdx] of Object.entries(headerMap)) raw[field] = cells[colIdx];
      const row = buildRow(raw, rows.length, confidence, defaults);
      if (hasSignal(row)) rows.push(row);
    }
    if (rows.length) return { rows, confidence };
  }

  // --- shape 2: free-form labelled blocks
  const grab = (block, aliases) => {
    for (const alias of aliases) {
      const re = new RegExp(`${alias}\\s*[:\\-]\\s*([^\\n|]+)`, 'i');
      const m = block.match(re);
      if (m) return m[1].trim();
    }
    return '';
  };

  // Split into blocks on blank-ish separators or repeated "date:" labels
  const blocks = text.split(/\n\s*\n|(?=\b(?:date|dated)\s*[:\-])/i).filter((b) => b.trim().length > 10);

  for (const block of blocks) {
    const raw = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      raw[field] = grab(block, aliases);
    }
    // Last resort: any bare date in the block
    if (!raw.date) {
      const m = block.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/);
      if (m) raw.date = m[0];
    }
    if (!raw.hours) {
      const m = block.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
      if (m) raw.hours = m[1];
    }
    const row = buildRow(raw, rows.length, confidence, defaults);
    if (hasSignal(row)) rows.push(row);
  }

  return { rows, confidence };
}

// ------------------------------------------------------------ PDF / image

async function ocrImage(filePath, onProgress) {
  const worker = await createWorker('eng', 1, {
    logger: onProgress ? (m) => onProgress(m) : undefined,
  });
  try {
    const { data } = await worker.recognize(filePath);
    return { text: data.text, meanConfidence: (data.confidence || 0) / 100 };
  } finally {
    await worker.terminate();
  }
}

async function extractFromPdf(filePath, defaults) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const text = (data.text || '').trim();

  // A scanned PDF yields almost no embedded text — we cannot OCR page images
  // here without a rasterizer, so tell the user instead of silently returning 0 rows.
  if (text.length < 40) {
    const err = new Error(
      'Is PDF mein text nahi mila (shayad scanned image hai). ' +
      'Page ka screenshot/JPG upload karein, ya Excel/CSV use karein.'
    );
    err.statusCode = 422;
    throw err;
  }

  const { rows, confidence } = extractFromText(text, defaults);
  return { rows, confidence, rawText: text.slice(0, 20000), source: 'pdf', pages: data.numpages };
}

async function extractFromImage(filePath, defaults) {
  const { text, meanConfidence } = await ocrImage(filePath);
  const { rows, confidence } = extractFromText(text, defaults);

  // Scale every field's confidence by how sure Tesseract was overall, so a
  // blurry scan highlights more fields for review.
  Object.keys(confidence).forEach((k) => {
    confidence[k] = Math.round(confidence[k] * Math.max(meanConfidence, 0.3) * 100) / 100;
  });

  return { rows, confidence, rawText: text.slice(0, 20000), source: 'image', meanConfidence };
}

// ------------------------------------------------------------------ entry

async function extract(filePath, { employeeName } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const defaults = { employeeName };

  let result;
  if (['.xlsx', '.xls'].includes(ext)) result = await extractFromSpreadsheet(filePath, defaults);
  else if (ext === '.csv') result = await extractFromCsv(filePath, defaults);
  else if (ext === '.pdf') result = await extractFromPdf(filePath, defaults);
  else if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'].includes(ext)) {
    result = await extractFromImage(filePath, defaults);
  } else {
    const err = new Error(`Format ${ext} supported nahi hai`);
    err.statusCode = 415;
    throw err;
  }

  if (!result.rows.length) {
    const err = new Error(
      'File padhi gayi lekin koi timesheet row nahi mili. ' +
      'Check karein ki file mein date/task/hours columns hain.'
    );
    err.statusCode = 422;
    err.rawText = result.rawText;
    throw err;
  }

  return result;
}

module.exports = {
  extract,
  // exported for tests / reuse
  normalizeDate,
  normalizeTime,
  normalizeHours,
  normalizeCategory,
  extractFromText,
  mapHeaders,
};
