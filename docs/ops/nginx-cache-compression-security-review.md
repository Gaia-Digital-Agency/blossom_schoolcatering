# Nginx Cache/Compression/Security Headers Review

Date: 2026-03-02
Scope: `/schoolcatering` web + `/schoolcatering/api/v1` API proxy

## Current target
- Ensure gzip compression, static caching, and baseline security headers are explicitly configured in Nginx.
- Keep API responses non-cacheable by default unless explicitly allowed.

## Recommended Nginx baseline
```nginx
gzip on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

location ^~ /schoolcatering/_next/static/ {
  expires 1y;
  add_header Cache-Control "public, max-age=31536000, immutable";
}

location ^~ /schoolcatering/api/v1/ {
  proxy_pass http://127.0.0.1:3006/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  add_header Cache-Control "no-store" always;
}

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "same-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

## Review checklist
- [ ] `nginx -t` passes before reload
- [ ] gzip enabled and compression level tuned
- [ ] static assets under `/_next/static/` have immutable cache headers
- [ ] API responses default to `Cache-Control: no-store`
- [ ] security headers present on HTML and API responses
- [ ] access logs include API routes and status codes

## Verification commands
```bash
nginx -t
systemctl reload nginx
curl -I http://127.0.0.1/schoolcatering/
curl -I http://127.0.0.1/schoolcatering/_next/static/chunks/main.js
curl -I http://127.0.0.1/schoolcatering/api/v1/health
```
