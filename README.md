# Smart Medicine Reminder System

A college-level IoT project that connects an ESP32 + DS3231 physical reminder to a Node.js/Express REST API, SQLite database, and responsive caregiver dashboard.

## Architecture

```text
DS3231 RTC -> ESP32 -> LED / buzzer / push button
                 | Wi-Fi REST API
Frontend HTML/CSS/JS -> Express API -> SQLite
```

The DS3231 is the primary local timing source. The alarm still works during an internet outage; unsent events are queued in ESP32 `Preferences` and uploaded when connectivity returns.

## Required software

- Node.js 18+ and npm (Windows installer: https://nodejs.org)
- Arduino IDE 2.x and ESP32 board support
- A browser on the same LAN as the backend computer

## Windows setup

```bat
cd smart-medicine-reminder\backend
copy .env.example .env
npm install
npm start
```

Open `http://localhost:3000`. The backend serves the frontend as well, so a separate frontend server is not needed. For a second device on the LAN, use the computer's IPv4 address, such as `http://192.168.1.100:3000`.

`.env` settings:

- `PORT=3000`
- `DB_PATH=../database/medicine.db`
- `ESP32_API_KEY=change-this-key` (use the same value in `esp32/config.h`)
- `REMINDER_TIMEOUT_MINUTES=5`
- `TIMEZONE=Asia/Kolkata`

The SQLite database and demo patient/device are initialized automatically on first start.

## Hardware wiring

| Part | Connection |
|---|---|
| DS3231 VCC | ESP32 3.3V |
| DS3231 GND | ESP32 GND |
| DS3231 SDA | GPIO 21 |
| DS3231 SCL | GPIO 22 |
| LED anode | GPIO 25 through resistor |
| LED cathode | GND |
| Push button side 1 | 3.3V |
| Push button side 2 | GPIO 26 |
| 10kΩ resistor | GPIO 26 to GND (pull-down) |
| Buzzer positive | GPIO 27 only if within GPIO current rating |
| Buzzer negative | GND |

For a buzzer requiring more current, use an NPN transistor driver, base resistor, common ground, and a flyback diode for a magnetic buzzer. See `docs/hardware-wiring.md`.

## ESP32 setup

1. In Arduino IDE install **ESP32 by Espressif Systems**.
2. Install **RTClib** and **ArduinoJson** from Library Manager.
3. Copy `esp32/config.h.example` to `esp32/config.h`.
4. Set Wi-Fi, backend LAN URL, API key, and device ID.
5. Select the correct ESP32 board and serial port.
6. Upload `smart_medicine.ino`.
7. Open Serial Monitor at 115200 baud.

## Demo procedure

1. Start the backend.
2. Open `http://localhost:3000`.
3. Add `Demo Medicine`, dosage `1 tablet`, and any time.
4. Confirm the device is visible under Device status after a heartbeat.
5. Click **Trigger test reminder** (clearly labelled TEST MODE).
6. The backend creates a real `TRIGGERED` SQLite log. A connected ESP32 can receive schedules and act on its local RTC; for a direct physical demonstration, use a schedule matching the current DS3231 minute.
7. Press the physical button. The firmware turns off the LED/buzzer and posts `MEDICINE_TAKEN`.
8. Confirm TAKEN appears on Dashboard and History.

## Verification boundary

The backend, database, browser integration, REST authentication, and firmware source are software-verifiable in this sandbox. Actual LED, buzzer, DS3231, button electrical behavior, Wi-Fi RSSI, and Arduino compilation require the user's physical ESP32 and Arduino IDE.

## Troubleshooting

- **API unavailable:** check `npm start`, port 3000, and Windows Firewall.
- **ESP32 cannot connect:** use the computer LAN IP, not `localhost`; ensure both devices share Wi-Fi.
- **401 Invalid device API key:** match `.env` and `config.h` exactly.
- **RTC error:** check SDA/SCL, 3.3V/GND, and coin-cell seating.
- **Repeated alarms:** firmware stores one trigger key per medicine/date in Preferences; erase flash only when intentionally resetting state.
- **No buzzer:** verify polarity and current rating; use the transistor driver for larger buzzers.
- **Button always active:** confirm the 10kΩ pull-down is connected from GPIO 26 to GND.

See `docs/architecture.md`, `docs/api.md`, `docs/testing.md`, and `docs/hardware-wiring.md` for details.
