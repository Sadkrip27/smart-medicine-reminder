# API reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health and timezone |
| GET/POST | `/api/medicines` | List/create medicines |
| GET/PUT/DELETE | `/api/medicines/:id` | Read/update/archive medicine |
| GET | `/api/reminders/today` | Today's persisted schedule/log rows |
| GET | `/api/reminders/history` | Recent reminder history |
| POST | `/api/reminders/taken` | Manual confirmation |
| POST | `/api/reminders/missed` | Manual missed event |
| GET | `/api/esp32/schedule` | Active schedules for device |
| POST | `/api/esp32/events` | Authenticated device event |
| POST | `/api/esp32/heartbeat` | Authenticated online status |
| GET | `/api/esp32/status` | Current device status |
| POST | `/api/test-reminder` | Create a labelled test trigger |
| GET | `/api/dashboard` | Dashboard summary |

ESP32 endpoints require headers `x-api-key: <ESP32_API_KEY>` and optionally `x-device-id`.

Example event:

```json
{"deviceId":"ESP32-MED-001","eventType":"MEDICINE_TAKEN","medicineId":1,"scheduledTime":"2026-09-26T08:00:00","eventTime":"2026-09-26T08:02:15"}
```

Successful API responses use JSON; invalid input is `400`, invalid device credentials are `401`, missing resources are `404`, and server/database failures are `500`.
