# Testing

## Software smoke test

From `backend`:

```bat
npm install
npm start
```

In another terminal:

```bat
curl http://localhost:3000/api/health
curl http://localhost:3000/api/medicines
curl -X POST http://localhost:3000/api/medicines -H "Content-Type: application/json" -d "{\"name\":\"Demo Medicine\",\"dosage\":\"1 tablet\",\"time\":\"08:00\",\"frequency\":\"DAILY\",\"startDate\":\"2026-09-26\"}"
curl -X POST http://localhost:3000/api/test-reminder
curl http://localhost:3000/api/reminders/today
```

## Device API test

```bat
curl http://localhost:3000/api/esp32/schedule -H "x-api-key: change-this-key"
curl -X POST http://localhost:3000/api/esp32/heartbeat -H "x-api-key: change-this-key" -H "Content-Type: application/json" -d "{\"deviceId\":\"ESP32-MED-001\",\"wifiRssi\":-55,\"rtcStatus\":\"SYNCED\"}"
```

## Physical acceptance test

1. Confirm Serial Monitor reports WiFi, RTC, LED, buzzer, and button checks.
2. Set a schedule one minute ahead of the DS3231 time.
3. Confirm LED and buzzer activate once.
4. Press the button; confirm outputs turn off and `MEDICINE_TAKEN` is posted.
5. Disconnect Wi-Fi, repeat; reconnect and verify the queued event appears in History.
6. Leave the alarm untouched past the timeout and verify `MISSED`.
