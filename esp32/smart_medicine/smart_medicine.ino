#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <RTClib.h>
#include <Preferences.h>
#include <time.h>
#include "config.h"

#define LED_PIN 25
#define BUTTON_PIN 26
#define BUZZER_PIN 27
#define SDA_PIN 21
#define SCL_PIN 22
#define SET_RTC_ON_EVERY_BOOT false


const unsigned long SCHEDULE_REFRESH_MS = 60000;
const unsigned long HEARTBEAT_MS = 30000;
const unsigned long WIFI_RETRY_MS = 15000;
const unsigned long DEBOUNCE_MS = 60;
const unsigned long REMINDER_TIMEOUT_MS = 5UL * 60UL * 1000UL;

RTC_DS3231 rtc; Preferences prefs;
struct MedicineSchedule { int id; String name; String dosage; String time; String frequency; } schedules[20];
int scheduleCount=0; bool rtcOk=false, alarmActive=false; int activeMedicine=-1; String activeScheduledTime=""; unsigned long alarmStarted=0,lastRefresh=0,lastHeartbeat=0,lastWifiAttempt=0,lastButtonChange=0; bool lastButtonState=false;

void logEvent(String message){ DateTime n=rtc.now(); char stamp[10]; snprintf(stamp,sizeof(stamp),"%02d:%02d:%02d",n.hour(),n.minute(),n.second()); Serial.printf("[%s] %s\n",stamp,message.c_str()); }
String isoNow(){DateTime n=rtc.now();char b[25];snprintf(b,sizeof(b),"%04d-%02d-%02dT%02d:%02d:%02d",n.year(),n.month(),n.day(),n.hour(),n.minute(),n.second());return String(b);}
String dateKey(){DateTime n=rtc.now();char b[11];snprintf(b,sizeof(b),"%04d-%02d-%02d",n.year(),n.month(),n.day());return String(b);}
void outputs(bool on){digitalWrite(LED_PIN,on?HIGH:LOW);digitalWrite(BUZZER_PIN,on?HIGH:LOW);}
void connectWiFi(){if(WiFi.status()==WL_CONNECTED)return;if(millis()-lastWifiAttempt<WIFI_RETRY_MS)return;lastWifiAttempt=millis();Serial.print("WiFi: connecting");WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);unsigned long start=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-start<8000){delay(250);Serial.print(".");}Serial.println(WiFi.status()==WL_CONNECTED?" Connected":" unavailable");}
String apiUrl(String path){return String(BACKEND_URL)+path;}
String getRequest(String path){if(WiFi.status()!=WL_CONNECTED)return "";HTTPClient http;http.begin(apiUrl(path));http.addHeader("x-api-key",ESP32_API_KEY);http.addHeader("x-device-id",DEVICE_ID);int code=http.GET();String body=code==200?http.getString():"";http.end();return body;}
void postJson(String path,String payload){if(WiFi.status()!=WL_CONNECTED){String pending=prefs.getString("pending","[]");DynamicJsonDocument doc(2048);deserializeJson(doc,pending);JsonArray a=doc.as<JsonArray>();JsonObject o=a.createNestedObject();o["path"]=path;o["body"]=payload;prefs.putString("pending",doc.as<String>());logEvent("Event queued offline");return;}HTTPClient http;http.begin(apiUrl(path));http.addHeader("Content-Type","application/json");http.addHeader("x-api-key",ESP32_API_KEY);int code=http.POST(payload);Serial.printf("Backend HTTP status: %d\n", code);
Serial.println(http.getString( ));
logEvent(code >= 200 && code < 300 ? "Event sent to backend" : "Backend rejected event");http.end();}
void flushPending(){if(WiFi.status()!=WL_CONNECTED)return;String pending=prefs.getString("pending","[]");DynamicJsonDocument doc(4096);if(deserializeJson(doc,pending))return;JsonArray a=doc.as<JsonArray>();if(a.size()==0)return;DynamicJsonDocument remain(4096);JsonArray keep=remain.to<JsonArray>();for(JsonObject e:a){HTTPClient http;http.begin(apiUrl((const char*)e["path"]));http.addHeader("Content-Type","application/json");http.addHeader("x-api-key",ESP32_API_KEY);int code=http.POST((const char*)e["body"]);http.end();if(code<200||code>=300){JsonObject k=keep.createNestedObject();k["path"]=e["path"];k["body"]=e["body"];}}prefs.putString("pending",remain.as<String>());}
void sendHeartbeat(){if(WiFi.status()!=WL_CONNECTED)return;DynamicJsonDocument d(256);d["deviceId"]=DEVICE_ID;d["wifiRssi"]=WiFi.RSSI();d["rtcStatus"]=rtcOk?"SYNCED":"ERROR";d["firmwareVersion"]=FIRMWARE_VERSION;String body;serializeJson(d,body);postJson("/api/esp32/heartbeat",body);}
void refreshSchedules(){String body=getRequest("/api/esp32/schedule");if(body=="")return;DynamicJsonDocument d(6144);if(deserializeJson(d,body)){logEvent("Invalid schedule response");return;}scheduleCount=0;for(JsonObject s:d["schedules"].as<JsonArray>()){if(scheduleCount>=20)break;schedules[scheduleCount].id=s["medicineId"];schedules[scheduleCount].name=(const char*)s["name"];schedules[scheduleCount].dosage=(const char*)s["dosage"];schedules[scheduleCount].time=(const char*)s["time"];schedules[scheduleCount].frequency=(const char*)s["frequency"];scheduleCount++;}if(!alarmActive){for(JsonObject t:d["testReminders"].as<JsonArray>()){String testKey="test_"+String((int)t["medicineId"]);String testTime=(const char*)t["scheduledTime"];if(prefs.getString(testKey.c_str(),"")==testTime)continue;for(int i=0;i<scheduleCount;i++){if(schedules[i].id==(int)t["medicineId"]){activeMedicine=schedules[i].id;activeScheduledTime=testTime;alarmActive=true;alarmStarted=millis();outputs(true);prefs.putString(testKey.c_str(),testTime);logEvent("TEST MODE reminder received: "+schedules[i].name);sendMedicineEvent("REMINDER_TRIGGERED",activeMedicine,activeScheduledTime);break;}}if(alarmActive)break;}}logEvent("Schedules refreshed");}
void sendMedicineEvent(String type,int medicineId,String scheduled){DynamicJsonDocument d(512);d["deviceId"]=DEVICE_ID;d["eventType"]=type;d["eventTime"]=isoNow();d["medicineId"]=medicineId;d["scheduledTime"]=scheduled;String body;serializeJson(d,body);postJson("/api/esp32/events",body);}
void triggerReminder(int i){activeMedicine=schedules[i].id;activeScheduledTime=dateKey()+"T"+schedules[i].time+":00";alarmActive=true;alarmStarted=millis();outputs(true);String key="trigger_"+String(activeMedicine);prefs.putString(key.c_str(),dateKey());logEvent("Reminder triggered: "+schedules[i].name);sendMedicineEvent("REMINDER_TRIGGERED",activeMedicine,activeScheduledTime);}
void checkSchedules(){if(alarmActive)return;DateTime n=rtc.now();char current[6];snprintf(current,sizeof(current),"%02d:%02d",n.hour(),n.minute());for(int i=0;i<scheduleCount;i++){if(schedules[i].time!=String(current))continue;String key="trigger_"+String(schedules[i].id);if(prefs.getString(key.c_str(),"")==dateKey())continue;triggerReminder(i);break;}}
void checkButton(){bool state=digitalRead(BUTTON_PIN)==HIGH;if(state!=lastButtonState&&millis()-lastButtonChange>DEBOUNCE_MS){lastButtonChange=millis();lastButtonState=state;if(state&&alarmActive){outputs(false);alarmActive=false;logEvent("Button pressed; reminder confirmed");sendMedicineEvent("MEDICINE_TAKEN",activeMedicine,activeScheduledTime);activeMedicine=-1;activeScheduledTime="";}}}
void syncRtcFromInternet() {
  if (!rtcOk || WiFi.status() != WL_CONNECTED) {
    Serial.println("NTP sync skipped");
    return;
  }

  // India Standard Time: UTC + 5 hours 30 minutes
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");

  struct tm timeInfo;

  if (getLocalTime(&timeInfo, 15000)) {
    DateTime internetTime(
      timeInfo.tm_year + 1900,
      timeInfo.tm_mon + 1,
      timeInfo.tm_mday,
      timeInfo.tm_hour,
      timeInfo.tm_min,
      timeInfo.tm_sec
    );

    rtc.adjust(internetTime);

    Serial.printf(
      "RTC synchronized: %04d-%02d-%02d %02d:%02d:%02d\n",
      internetTime.year(),
      internetTime.month(),
      internetTime.day(),
      internetTime.hour(),
      internetTime.minute(),
      internetTime.second()
    );
  } else {
    Serial.println("NTP synchronization failed; using DS3231 time");
  }
}
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT);

  outputs(false);

  Wire.begin(SDA_PIN, SCL_PIN);
  rtcOk = rtc.begin();

  if (rtcOk) {
    if (SET_RTC_ON_EVERY_BOOT || rtc.lostPower()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      Serial.println("RTC time set from firmware compile time");
    }

    Serial.println("RTC: OK");
  } else {
    Serial.println("RTC: ERROR - alarm timing unavailable");
  }

  prefs.begin("medicine", false);

  connectWiFi();

if (WiFi.status() == WL_CONNECTED) {
  Serial.println("WiFi: Connected");
  syncRtcFromInternet();
} else {
  Serial.println("WiFi: Offline mode");
}

refreshSchedules();
  sendHeartbeat();

  Serial.println("LED: OK");
  Serial.println("Buzzer: OK");
  Serial.println("Button: OK");
}

void loop(){connectWiFi();if(rtcOk){checkButton();checkSchedules();}if(alarmActive&&millis()-alarmStarted>REMINDER_TIMEOUT_MS){outputs(false);alarmActive=false;logEvent("Reminder timeout; marked missed");sendMedicineEvent("MEDICINE_MISSED",activeMedicine,activeScheduledTime);activeMedicine=-1;activeScheduledTime="";}if(millis()-lastRefresh>SCHEDULE_REFRESH_MS){lastRefresh=millis();refreshSchedules();flushPending();}if(millis()-lastHeartbeat>HEARTBEAT_MS){lastHeartbeat=millis();sendHeartbeat();}delay(20);}
