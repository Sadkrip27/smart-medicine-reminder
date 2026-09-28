# Hardware wiring

- DS3231 VCC -> 3.3V; GND -> GND; SDA -> GPIO21; SCL -> GPIO22.
- LED anode -> resistor -> GPIO25; LED cathode -> GND. Use a current-limiting resistor (typically 220–330Ω).
- Push button one terminal -> 3.3V; other terminal -> GPIO26. Connect the 10kΩ resistor from GPIO26 to GND. The firmware uses active-high input and debounce.
- Buzzer positive -> GPIO27 only for a small active piezo whose datasheet current is safe for an ESP32 output; negative -> GND.

## Safer buzzer alternative

For a larger or magnetic buzzer, GPIO27 should drive an NPN transistor through approximately a 1kΩ base resistor. Power the buzzer from its rated supply, connect emitter to GND, connect the buzzer negative to collector, and place a flyback diode across a magnetic buzzer. Tie grounds together. Never exceed the ESP32 GPIO voltage/current rating.

Disconnect power before changing wiring. Confirm the DS3231 board's voltage requirements and use a common ground.
