# Start Guide

## 1) Start App Locally

### Prerequisites
- Node.js and npm installed
- Project cloned at:
  - `/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering`

### Install dependencies
```bash
npm install
```

### Prepare local environment
Create a local `.env` (or copy from `.env.example`) with local values.

Required storage/auth env for uploads and receipts:
- `GCS_BUCKET`
- `GCS_FOLDER`
- `GCS_MENU_IMAGES_FOLDER`
- `GCS_RECEIPTS_FOLDER`
- `GCS_PAYMENT_PROOFS_FOLDER`
- `CDN_BASE_URL`
- Service account auth via either:
  - `GOOGLE_APPLICATION_CREDENTIALS` (path to json file), or
  - `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`

### Run API (terminal 1)
```bash
npm run dev:api
```

### Run Web (terminal 2)
```bash
npm run dev:web
```

### Local URLs
- Web app:
  - `http://127.0.0.1:5173/schoolcatering`
- API:
  - `http://127.0.0.1:3000/api/v1`

Note:
- Web root `/` is expected to return 404 in local dev because app base path is `/schoolcatering`.

### Stop local app
- In each terminal running dev servers, press `Ctrl + C`.
- If a process is stuck:
```bash
pkill -f "next dev -p 5173"
pkill -f "nest start --watch"
```

### Build production files
```bash
npm run build
```

- Build outputs:
  - `apps/web/.next/`
  - `apps/api/dist/`

### Run production build locally (optional)
```bash
npm run build:web
npm run build:api
npm --prefix apps/web run start
npm --prefix apps/api run start:prod
```


## 2) Alter (Update) App on Staging Server

Server details:
- Host: `34.124.244.233`
- User: `azlan`
- SSH key: `~/.ssh/gda-ce01`
- Server app path: `/var/www/schoolcatering`
- Staging URL: `http://34.124.244.233/schoolcatering`

### A. Build locally first
```bash
npm install
npm run build:web
npm run build:api
```

### B. Update on server (git workflow)
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

### C. Verify on server
```bash
pm2 status
curl -I http://127.0.0.1/schoolcatering
```

### D. Open staging site
- `http://34.124.244.233/schoolcatering`


## 3) Quick Update Cycle

When you change web/api files:
1. Edit files locally.
2. Commit and push:
```bash
git add .
git commit -m "your message"
git push origin main
```
3. Pull and rebuild on server:
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```
4. Refresh staging URL and verify.


## 4) Optional Git-based Update on Server

Default deployment mode is git checkout + PM2 restart:
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```
