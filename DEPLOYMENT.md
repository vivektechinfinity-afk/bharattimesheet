# Deployment Guide

Two paths: **Railway** (recommended) and **VPS**. The backend serves the built frontend,
so a single service runs the whole portal.

---

## Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Timesheet portal"
git remote add origin https://github.com/<you>/timesheet-portal.git
git push -u origin main
```

### 2. Create the project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select the repo. Railway reads `railway.json`:
   - Build: `npm run install:all && npm --prefix frontend run build`
   - Start: `npm --prefix backend start`
   - Health check: `/api/health`

### 3. Add PostgreSQL

**New** → **Database** → **Add PostgreSQL**. Railway injects `DATABASE_URL` automatically —
`db.js` picks it up and enables SSL when `NODE_ENV=production`.

### 4. Set variables

In the service's **Variables** tab:

```
NODE_ENV=production
JWT_SECRET=<paste output of: openssl rand -base64 48>
SEED_PASSWORD=<a strong password for the seeded accounts>
```

`PORT` is set by Railway. `DATABASE_URL` comes from the plugin. `CORS_ORIGIN` is only
needed if you serve the frontend from a different domain.

### 5. Create the tables

After the first successful deploy, open the service shell (**⋮** → **Shell**) and run:

```bash
npm run init-db
```

This applies the schema and seeds demo users. It is idempotent — safe to re-run.

### 6. Verify

```bash
curl https://<your-app>.railway.app/api/health
# {"status":"ok","db":"connected","time":"..."}
```

Open the app, log in, create an entry, upload a CSV, approve it as the manager.

### 7. Lock it down

1. Log in as `admin@example.com`, go to **Admin Panel**.
2. Create real accounts for your team.
3. Deactivate `emp1` / `emp2` / `emp3` / `manager1` demo accounts.
4. Change the admin password via the API:
   ```bash
   curl -X POST https://<app>/api/auth/change-password \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"currentPassword":"<seed>","newPassword":"<new strong password>"}'
   ```

---

## Custom domain (Hostinger subdomain → Railway)

1. **Railway** → service → **Settings** → **Networking** → **Custom Domain**
   → enter `timesheet.yourdomain.com`. Railway shows a CNAME target.

2. **Hostinger** → hPanel → **Domains** → **DNS / Nameservers** → add:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | CNAME | `timesheet` | `<target>.railway.app` | 3600 |

3. Wait for propagation (usually minutes, up to 48h):
   ```bash
   dig timesheet.yourdomain.com CNAME +short
   ```

4. Railway provisions the TLS certificate automatically once DNS resolves.

> Hostinger's **shared/business** hosting runs PHP only and cannot host this app.
> The subdomain is used purely as a DNS pointer to Railway.

---

## VPS (Hostinger VPS, DigitalOcean, EC2…)

### Install prerequisites

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx
```

### Database

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE timesheet_db;
CREATE USER timesheet_user WITH PASSWORD 'strong-password-here';
GRANT ALL PRIVILEGES ON DATABASE timesheet_db TO timesheet_user;
SQL
```

### Application

```bash
cd /opt
sudo git clone https://github.com/<you>/timesheet-portal.git
cd timesheet-portal

npm run install:all
npm --prefix frontend run build

cp backend/.env.example backend/.env
sudo nano backend/.env     # set DATABASE_URL, JWT_SECRET, NODE_ENV=production

npm run init-db
```

### systemd service

`/etc/systemd/system/timesheet.service`:

```ini
[Unit]
Description=Timesheet Portal
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/timesheet-portal/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now timesheet
sudo systemctl status timesheet
```

### Nginx

`/etc/nginx/sites-available/timesheet`:

```nginx
server {
    listen 80;
    server_name timesheet.yourdomain.com;
    client_max_body_size 55M;   # uploads are capped at 50 MB

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/timesheet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d timesheet.yourdomain.com
```

---

## Operations

### Logs

```bash
# Railway: service → Deployments → View Logs
# VPS:
journalctl -u timesheet -f
```

### Backups

```bash
pg_dump -U timesheet_user timesheet_db | gzip > backup-$(date +%F).sql.gz

# nightly at 02:00
0 2 * * * pg_dump -U timesheet_user timesheet_db | gzip > /backups/ts-$(date +\%F).sql.gz
```

On Railway, enable automated backups in the Postgres plugin settings.

### Updating

```bash
git pull
npm run install:all
npm --prefix frontend run build
sudo systemctl restart timesheet     # Railway redeploys on push automatically
```

### Upload storage

Uploaded documents land in `backend/uploads/`. On Railway this is **ephemeral** and is
wiped on redeploy. Timesheet data itself is safe in Postgres — only the original files
are lost. To retain them, attach a Railway volume mounted at `/app/backend/uploads`
and set `UPLOAD_DIR` to match, or switch the upload handler to S3.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `/api/health` → `db: disconnected` | `DATABASE_URL` correct? Postgres plugin running? |
| Login always 401 | Did `npm run init-db` run? Is `SEED_PASSWORD` what you're typing? |
| 500 on every request | Logs — usually a missing `JWT_SECRET` |
| Upload returns 413 | Nginx `client_max_body_size`, or `MAX_FILE_SIZE` |
| Scan returns "koi row nahi mili" | File has no recognizable date/task/hours columns |
| Scanned PDF rejected | Expected — upload a photo or Excel instead |
| Blank page, API works | Frontend build didn't run; `npm --prefix frontend run build` |
