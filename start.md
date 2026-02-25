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

### Run in development mode
```bash
npm run dev
```

- Local URL:
  - `http://localhost:5173`

### Build production files
```bash
npm run build
```

- Build output:
  - `dist/`

### Preview production build locally
```bash
npm run preview
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
npm run build
```

### B. Upload build files to server
```bash
rsync -avz --delete -e "ssh -i ~/.ssh/gda-ce01" dist/ azlan@34.124.244.233:/var/www/schoolcatering/
```

### C. Verify on server
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
ls -la /var/www/schoolcatering
exit
```

### D. Open staging site
- `http://34.124.244.233/schoolcatering`


## 3) Quick Update Cycle

When you change frontend files:
1. Edit files locally.
2. Run:
```bash
npm run build
```
3. Deploy updated `dist/` with:
```bash
rsync -avz --delete -e "ssh -i ~/.ssh/gda-ce01" dist/ azlan@34.124.244.233:/var/www/schoolcatering/
```
4. Refresh staging URL and verify.


## 4) Optional Git-based Update on Server

If server is using git checkout instead of rsync:
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
npm install
npm run build
```

Use this only if `/var/www/schoolcatering` is a git working copy with Node build tooling installed.
