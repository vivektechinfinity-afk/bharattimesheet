-- Timesheet Automation Portal — schema
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(100) UNIQUE NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'employee'
              CHECK (role IN ('employee', 'manager', 'admin')),
  department  VARCHAR(100),
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timesheets (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_name    VARCHAR(255) NOT NULL,
  date             DATE NOT NULL,
  start_time       TIME,
  end_time         TIME,
  hours            NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  task_name        VARCHAR(500) NOT NULL,
  category         VARCHAR(100) NOT NULL,
  description      TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'Draft'
                   CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected')),
  file_path        VARCHAR(500),
  approver_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_comment TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record of every scanned upload, so a bad import can be traced back to its file.
CREATE TABLE IF NOT EXISTS ocr_extractions (
  id             SERIAL PRIMARY KEY,
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_name      VARCHAR(500),
  file_path      VARCHAR(500),
  extracted_data JSONB,
  row_count      INTEGER DEFAULT 0,
  source         VARCHAR(30),
  status         VARCHAR(20) DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50)  NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id  INTEGER,
  old_data   JSONB,
  new_data   JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ts_employee   ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_ts_date       ON timesheets(date DESC);
CREATE INDEX IF NOT EXISTS idx_ts_status     ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_ts_category   ON timesheets(category);
CREATE INDEX IF NOT EXISTS idx_ts_emp_date   ON timesheets(employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_audit_record  ON audit_logs(table_name, record_id);

-- Stop the same person logging the same task twice on the same day.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ts_emp_date_task
  ON timesheets(employee_id, date, LOWER(task_name));
