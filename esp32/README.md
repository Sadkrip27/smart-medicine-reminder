# ESP32 firmware

Install **ESP32 by Espressif** in Arduino IDE, then install these libraries through Library Manager:

- RTClib by Adafruit
- ArduinoJson by Benoit Blanchon

Copy `config.h.example` to `config.h`, replace Wi-Fi, backend URL (the computer's LAN IP), and API key, then upload `smart_medicine.ino`.

The DS3231 is always the alarm clock. Wi-Fi only refreshes schedules, sends heartbeats, and uploads logs. `Preferences` stores unsent event payloads when Wi-Fi/backend access is unavailable and retries them after reconnecting. The firmware deduplicates a medicine by date so the same schedule is not triggered repeatedly during its minute.

For a buzzer that draws more than the ESP32 GPIO's safe current, do **not** connect it directly. Use an NPN transistor (e.g. 2N2222), 1kΩ base resistor, common ground, and a flyback diode for magnetic buzzers. A small 3.3V active piezo buzzer within its datasheet current may be driven directly.

Open Serial Monitor at 115200 baud. Startup and runtime messages show Wi-Fi, RTC, LED, buzzer, button, schedule refresh, alarm, confirmation, timeout, and queue events.
