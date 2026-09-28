# Architecture

## Layers

1. **Hardware:** ESP32 runs the reminder loop. DS3231 provides local time; GPIO 25 drives LED, GPIO 27 drives buzzer, and GPIO 26 reads the active-high button with an external 10kΩ pull-down.
2. **Firmware:** schedules are cached in RAM, trigger keys are persisted in Preferences, and events are sent through authenticated REST calls. Wi-Fi is not required for the local alarm.
3. **Backend:** Express validates medicine input, exposes dashboard and ESP32 endpoints, handles heartbeat status, and records device events.
4. **Database:** SQLite stores patient, medicine, schedule, reminder log, device, and device event records with foreign keys and a uniqueness guard against duplicate medicine/date-time logs.
5. **Frontend:** a responsive HTML/CSS/JS dashboard uses real `fetch()` calls and polls every five seconds.

## Reminder state machine

`PENDING -> TRIGGERED -> TAKEN` or `PENDING -> MISSED`. The ESP32 sends `REMINDER_TRIGGERED`, `MEDICINE_TAKEN`, and `MEDICINE_MISSED` device events. The dashboard reads the persisted result from SQLite.

## Security and time

Device routes require `x-api-key`. The API key is environment configuration, not source code. Backend timestamps are ISO timestamps and the displayed project timezone is Asia/Kolkata. The RTC remains authoritative for physical triggering.
