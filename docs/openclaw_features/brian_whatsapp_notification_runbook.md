# Brian WhatsApp Order Notification Runbook

## Daily Schedule

- Run time: `09:00`
- Timezone: `Asia/Makassar`
- Trigger: Brian/OpenClaw cron

## Endpoint Flow

1. Brian calls:

```bash
curl -s -X POST http://34.158.47.112/schoolcatering/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Teameditor@123"}'
```

Extract `accessToken`.

2. Brian calls:

```bash
curl -s -X POST http://34.158.47.112/schoolcatering/api/v1/admin/whatsapp/order-notifications/run-daily \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

3. For each row in `orders[]`, Brian sends one WhatsApp message:

```bash
openclaw message send --to +6281234567890 --message "Brian ♾️

Today's Order

Student: Natasha
Order ID: #08785409
Date: 2026-05-04
Session: LUNCH
Items: Beef Rice Bowl, Beetroot & Hazelnut Salad, Buffalo Chicken, Cheesy Beans, Chicken & Cheese Macaroni

Enjoy your meal, Natasha! 🍽️"
```

4. If send succeeds, Brian calls:

```bash
curl -s -X POST http://34.158.47.112/schoolcatering/api/v1/admin/whatsapp/order-notifications/ORDER_ID/mark-sent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{
    "sentTo":"+6281234567890",
    "targetSource":"STUDENT",
    "sentVia":"BRIAN",
    "provider":"OPENCLAW",
    "sentAt":"2026-05-04T09:00:12+08:00"
  }'
```

5. If send fails, Brian calls:

```bash
curl -s -X POST http://34.158.47.112/schoolcatering/api/v1/admin/whatsapp/order-notifications/ORDER_ID/mark-failed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{
    "targetPhone":"+6281234567890",
    "targetSource":"STUDENT",
    "sentVia":"BRIAN",
    "provider":"OPENCLAW",
    "failedAt":"2026-05-04T09:00:20+08:00",
    "reason":"WHATSAPP_SEND_FAILED"
  }'
```

## Expected `run-daily` Response

```json
{
  "ok": true,
  "date": "2026-05-04",
  "timezone": "Asia/Makassar",
  "orders": [
    {
      "orderId": "3f95d2d6-2f46-4d2a-bf74-31b3d4d4a111",
      "orderNumber": "08785409",
      "serviceDate": "2026-05-04",
      "session": "LUNCH",
      "status": "PLACED",
      "student": {
        "id": "8b127e10-b191-4a7b-a1d1-f281e62f1001",
        "userId": "1a127e10-b191-4a7b-a1d1-f281e62f1abc",
        "name": "Natasha",
        "firstName": "Natasha",
        "phone": "+6281234567890"
      },
      "parentFallback": {
        "id": "9d3488cf-42bd-4da1-8d67-8c4b8cd11002",
        "name": "Ayu",
        "phone": "+6281333344444"
      },
      "target": {
        "phone": "+6281234567890",
        "source": "STUDENT"
      },
      "items": [
        "Beef Rice Bowl",
        "Beetroot & Hazelnut Salad",
        "Buffalo Chicken",
        "Cheesy Beans",
        "Chicken & Cheese Macaroni"
      ]
    }
  ],
  "skipped": [
    {
      "orderId": "39e98979-a112-4cc2-8f49-765cb7700003",
      "orderNumber": "08785410",
      "reason": "NO_TARGET_PHONE"
    }
  ]
}
```

## Brian Loop Rules

- One WhatsApp per order
- Do not combine sessions
- Use `target.phone`
- Use `target.source` when calling `mark-sent` or `mark-failed`
- Continue processing remaining orders even if one send fails
- Do not resend anything already excluded by `run-daily`

## Minimal Brian Pseudocode

```text
login
call run-daily
for each order in orders:
  build message
  send whatsapp
  if send ok:
    call mark-sent
  else:
    call mark-failed
finish
```
