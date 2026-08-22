// Полный исходник прошивки «Талон-32 v1.7» для ESP32 Dev Module (Arduino Core 3.x).
// Строка экспортируется как есть (String.raw) для отображения, копирования и скачивания .ino.

export const FIRMWARE_FILE = "Talon32.ino";
export const FIRMWARE_VERSION = "1.7";

export const FIRMWARE_CODE = String.raw`/*
 * ============================================================
 *  ТАЛОН-32  v1.7  —  RFID-учёт посетителей столовой/ресторана
 *  Платформа : ESP32 Dev Module, Arduino Core 3.x (Espressif)
 *  Периферия : RC522 (SPI), LCD1602 I2C, RTC DS3231, лазерный
 *              рубеж (KY-008 + фотоприёмник), LED x3, buzzer,
 *              кнопка регистрации карт.
 *  Связь     : Wi-Fi STA (автопереподключение) -> резерв AP
 *              "Talon32-Setup", веб админ-панель (пароль),
 *              SNTP, Telegram-бот (CSV-отчёты), SMTP2GO e-mail.
 *  Хранение  : NVS (настройки) + LittleFS (журнал по дням).
 *
 *  БИБЛИОТЕКИ (Library Manager):
 *    1) MFRC522            (miguelbalboa)
 *    2) LiquidCrystal I2C  (marcoschwartz)
 *    3) RTClib             (Adafruit)
 *    4) ArduinoJson        (Benoit Blanchon, v7)
 *
 *  ВАЖНО ДЛЯ CORE 3.x: SPI и I2C инициализируются ЯВНО
 *  (SPI.begin(18,19,23), Wire.begin(21,22)) — в Core 3.x
 *  сменились SPI-пины по умолчанию, без этого RC522 молчит.
 * ============================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <time.h>
#include <SPI.h>
#include <Wire.h>
#include <vector>
#include <MFRC522.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>
#include <ArduinoJson.h>

// ====================== КОНФИГУРАЦИЯ =========================
static const char* FW_VERSION   = "1.7";
static const char* DEVICE_NAME  = "ТАЛОН-32";
static const char* AP_SSID      = "Talon32-Setup";   // резервная точка доступа
static const char* DEFAULT_PASS = "admin";           // пароль админ-панели при первом входе
static const char* DEFAULT_PEER_KEY = "talon-peer-key"; // ключ межтерминального обмена

// --- Пины (ESP32 Dev Module) ---
static const int PIN_RFID_SS   = 5;
static const int PIN_RFID_RST  = 4;
static const int PIN_SPI_SCK   = 18;
static const int PIN_SPI_MISO  = 19;
static const int PIN_SPI_MOSI  = 23;
static const int PIN_I2C_SDA   = 21;
static const int PIN_I2C_SCL   = 22;
static const int LCD_I2C_ADDR  = 0x27;   // если экран молчит — поставьте 0x3F
static const int PIN_LASER_TX  = 25;     // питание лазерного излучателя
static const int PIN_LASER_RX  = 32;     // DO фотоприёмника (компаратор LM393)
static const int PIN_LED_GREEN = 26;
static const int PIN_LED_RED   = 27;
static const int PIN_LED_AMBER = 14;
static const int PIN_BUZZER    = 13;     // АКТИВНЫЙ buzzer (сам звучит)
static const int PIN_BTN_REG   = 33;     // кнопка: режим регистрации карт

// --- Тайминги ---
static const uint32_t LASER_GRACE_MS = 20000; // луч выключен после прохода карты, не более 20 с
static const uint32_t LASER_ALARM_MS = 5000;  // длительность тревоги при нарушении
static const uint32_t ANTI_REPEAT_MS = 3000;  // окно антиповтора (только гостевые карты)
static const uint32_t REG_MODE_MS    = 30000; // сервисный режим регистрации карты
static const uint32_t SESSION_MS     = 8UL * 3600UL * 1000UL; // сессия админки 8 ч

// ======================= ГЛОБАЛЬНЫЕ ==========================
Preferences   prefs;
RTC_DS3231    rtc;
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, 16, 2);
MFRC522       rfid(PIN_RFID_SS, PIN_RFID_RST);
WebServer     server(80);
DNSServer     dns;

// --- Настройки (NVS) ---
String   g_ssid, g_pass;                 // Wi-Fi
String   g_adminPass  = DEFAULT_PASS;
String   g_tgToken, g_tgChat;            // Telegram
String   g_smtpKey, g_senderEmail, g_emailTo; // e-mail (SMTP2GO)
String   g_peerIp;                       // IP второго терминала
String   g_peerKey  = DEFAULT_PEER_KEY;
int      g_tzMin    = 180;               // часовой пояс, мин (МСК = +180)
uint8_t  g_terminal = 0;                 // 0 = СТОЛОВАЯ, 1 = РЕСТОРАН
bool     g_laserInvert = false;          // true, если приёмник инверсный
uint16_t g_sched[3][2] = { {510, 690}, {810, 930}, {1080, 1200} }; // ЗАВТРАК/ОБЕД/УЖИН
uint16_t g_dayReportMin = 1260;          // суточный отчёт в 21:00

static const char* PLACE_NAMES[2]  = { "СТОЛОВАЯ", "РЕСТОРАН" };
static const char* PERIOD_NAMES[3] = { "ЗАВТРАК", "ОБЕД", "УЖИН" };
static const char* WEEKDAYS_RU[7]  = { "ВС","ПН","ВТ","СР","ЧТ","ПТ","СБ" };

// --- Карты (реестр в LittleFS + копия в RAM) ---
struct CardRec { String uid; uint32_t id; String name; bool admin; };
std::vector<CardRec> g_cards;

// --- Кэш посещений за сегодня (RAM, перестраивается из файла дня) ---
struct VisitRec { String uid; uint32_t id; uint8_t period; };
std::vector<VisitRec> g_today;
std::vector<uint32_t> g_todayIds;        // уникальные гости
uint16_t g_tVisits = 0, g_tDenied = 0, g_tBreach = 0;
uint16_t g_tDeniedP[3] = {0, 0, 0};

// --- Время ---
bool     g_rtcOk = false;
uint32_t g_now = 0;                      // локальный unixtime
String   g_dateStr = "1970-01-01";
int      g_minuteOfDay = -1;
bool     g_sentDaily = false;
uint32_t g_lastRtcSync = 0;

// --- Сеть ---
enum NetMode { NET_STA_TRY, NET_STA_ON, NET_AP };
NetMode  g_net = NET_STA_TRY;
uint32_t g_netT0 = 0, g_netNext = 0, g_apBackoff = 15000;
bool     g_sntpOk = false;
bool     g_peerSeen = false;
uint32_t g_netRestartAt = 0, g_rebootAt = 0;

// --- RFID антиповтор ---
String   g_lastUid;
uint32_t g_lastTap = 0;

// --- Сервисный режим регистрации ---
uint32_t g_regUntil = 0;

// --- Лазерный рубеж ---
enum LaserState { LS_ARMED, LS_GRACE, LS_ALARM };
LaserState g_laser = LS_ARMED;
uint32_t g_graceEnd = 0, g_alarmEnd = 0;
bool     g_beamStable = false, g_beamRawPrev = false;
uint32_t g_beamChg = 0;

// --- Сессия админ-панели ---
String   g_token;
uint32_t g_tokenExp = 0;
long     g_tgOffset = 0;

// --- опережающие объявления (порядок секций) ---
void syncRtcFromNet(bool force);
String buildReport(const String& fromS, const String& toS, const String& fmt);
bool beamBlocked();

// ================== НЕБЛОКИРУЮЩИЙ ЗВУК =======================
/* Паттерны: пары (вкл, выкл) в мс. Явные паузы гарантируют,
 * что ДВА гудка не сольются в один (исправлено в v1.7).      */
static const uint16_t BEEP_OK[]    = { 250 };
static const uint16_t BEEP_ERR[]   = { 160, 110, 160, 110, 420 };
static const uint16_t BEEP_WARN[]  = { 350, 150, 350 };
static const uint16_t BEEP_REGOK[] = { 180, 120, 180 };        // два РАЗДЕЛЬНЫХ гудка
static const uint16_t BEEP_ALARM[] = { 600, 200, 600, 200, 600 };
static const uint16_t BEEP_BOOT[]  = { 120, 90, 120, 90, 240 };

struct Beeper {
  const uint16_t* pat = nullptr;
  uint8_t len = 0, idx = 0;
  uint32_t tNext = 0;
  void play(const uint16_t* p, uint8_t n) {
    pat = p; len = n; idx = 0; tNext = millis(); step();
  }
  void step() {
    if (!pat || idx >= len) { digitalWrite(PIN_BUZZER, LOW); pat = nullptr; return; }
    digitalWrite(PIN_BUZZER, (idx % 2 == 0) ? HIGH : LOW); // чётные позиции — звук
    uint32_t dur = pat[idx]; idx++;
    tNext = millis() + dur;
  }
  void tick() {
    if (!pat) return;
    if ((int32_t)(millis() - tNext) >= 0) step();   // overflow-safe (интервалы << 24 сут)
  }
} beeper;

void beep(const uint16_t* p, uint8_t n) { beeper.play(p, n); }

// =================== ЛАМПЫ (без delay) =======================
uint32_t g_lampOff[3] = {0, 0, 0};
static const int LAMP_PIN[3] = { PIN_LED_GREEN, PIN_LED_RED, PIN_LED_AMBER };

void lampOn(uint8_t i, uint32_t ms) {
  digitalWrite(LAMP_PIN[i], HIGH);
  g_lampOff[i] = millis() + ms;
}
void lampsTick() {
  for (uint8_t i = 0; i < 3; i++) {
    if (g_lampOff[i] && (int32_t)(millis() - g_lampOff[i]) >= 0) {
      digitalWrite(LAMP_PIN[i], LOW);
      g_lampOff[i] = 0;
    }
  }
}

// ========================= ВРЕМЯ =============================
uint32_t nowLocal() {
  if (g_rtcOk) return rtc.now().unixtime();               // RTC хранит ЛОКАЛЬНОЕ время
  time_t t = time(nullptr);
  if (t > 1700000000) return (uint32_t)t + (uint32_t)(g_tzMin * 60);
  return 0;                                               // времени нет вообще
}
String dateStrOf(uint32_t e) {
  DateTime dt(e); char b[12];
  snprintf(b, sizeof(b), "%04d-%02d-%02d", dt.year(), dt.month(), dt.day());
  return String(b);
}
String timeStrOf(uint32_t e) {
  DateTime dt(e); char b[10];
  snprintf(b, sizeof(b), "%02d:%02d:%02d", dt.hour(), dt.minute(), dt.second());
  return String(b);
}
String minToStr(uint16_t m) {
  char b[6]; snprintf(b, sizeof(b), "%02d:%02d", m / 60, m % 60);
  return String(b);
}
int periodOf(uint32_t e) {
  DateTime dt(e); int m = dt.hour() * 60 + dt.minute();
  for (int p = 0; p < 3; p++)
    if (m >= (int)g_sched[p][0] && m < (int)g_sched[p][1]) return p;
  return -1;
}

// =================== РАБОТА С ФАЙЛАМИ ========================
bool appendLine(const String& path, const String& line) {
  File f = LittleFS.open(path, "a");
  if (!f) return false;
  f.println(line);
  f.close();
  return true;
}
bool writeFileAll(const String& path, const String& data) {
  File f = LittleFS.open(path, "w");
  if (!f) return false;
  f.print(data);
  f.close();
  return true;
}
String readFileAll(const String& path) {
  File f = LittleFS.open(path, "r");
  if (!f) return String();
  String s = f.readString();
  f.close();
  return s;
}

// ===================== ЖУРНАЛ СОБЫТИЙ ========================
void logEvent(const char* ev, const String& uid, uint32_t id,
              const String& name, int8_t periodIdx) {
  JsonDocument doc;
  doc["ts"]     = g_now;
  doc["event"]  = ev;
  doc["uid"]    = uid;
  doc["id"]     = id;
  doc["name"]   = name;
  doc["place"]  = PLACE_NAMES[g_terminal ? 1 : 0];
  doc["period"] = (periodIdx >= 0 && periodIdx < 3) ? PERIOD_NAMES[periodIdx] : "";
  String line; serializeJson(doc, line);
  String d = g_now ? dateStrOf(g_now) : String("1970-01-01");
  appendLine("/log/" + d + ".jsonl", line);

  if (strcmp(ev, "VISIT") == 0) {
    VisitRec v; v.uid = uid; v.id = id; v.period = (uint8_t)periodIdx;
    g_today.push_back(v);
    bool seen = false;
    for (size_t i = 0; i < g_todayIds.size(); i++) if (g_todayIds[i] == id) { seen = true; break; }
    if (!seen) g_todayIds.push_back(id);
    g_tVisits++;
  } else if (strncmp(ev, "DENIED", 6) == 0) {
    g_tDenied++;
    if (periodIdx >= 0 && periodIdx < 3) g_tDeniedP[periodIdx]++;
  } else if (strcmp(ev, "BREACH") == 0) {
    g_tBreach++;
  }
}

void rebuildTodayCache() {
  g_today.clear(); g_todayIds.clear();
  g_tVisits = g_tDenied = g_tBreach = 0;
  g_tDeniedP[0] = g_tDeniedP[1] = g_tDeniedP[2] = 0;
  if (!g_now) return;
  File f = LittleFS.open("/log/" + dateStrOf(g_now) + ".jsonl", "r");
  if (!f) return;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() < 4) continue;
    JsonDocument d;
    if (deserializeJson(d, line)) continue;
    String ev = d["event"] | "";
    if (ev == "VISIT") {
      VisitRec v;
      v.uid = String(d["uid"] | "");
      v.id = d["id"] | 0;
      String pn = d["period"] | "";
      v.period = (pn == "ОБЕД") ? 1 : (pn == "УЖИН") ? 2 : 0;
      g_today.push_back(v);
      bool seen = false;
      for (size_t i = 0; i < g_todayIds.size(); i++) if (g_todayIds[i] == v.id) { seen = true; break; }
      if (!seen) g_todayIds.push_back(v.id);
      g_tVisits++;
    } else if (ev.startsWith("DENIED")) {
      g_tDenied++;
      String pn = d["period"] | "";
      if (pn == "ЗАВТРАК") g_tDeniedP[0]++;
      else if (pn == "ОБЕД") g_tDeniedP[1]++;
      else if (pn == "УЖИН") g_tDeniedP[2]++;
    } else if (ev == "BREACH") g_tBreach++;
  }
  f.close();
}

bool localVisited(const String& uid, int p) {
  for (size_t i = 0; i < g_today.size(); i++)
    if (g_today[i].uid == uid && g_today[i].period == (uint8_t)p) return true;
  return false;
}

// ============== МЕЖТЕРМИНАЛЬНАЯ СВЕРКА (HTTP) ================
/* Второй терминал опрашивается ДО вынесения вердикта: гость не
 * сможет «обмануть» систему, сходив сначала в столовую.        */
bool peerVisited(const String& uid, int p, const String& dateStr) {
  if (g_peerIp.length() < 7 || g_net != NET_STA_ON) return false;
  WiFiClient c;
  if (!c.connect(g_peerIp.c_str(), 80)) { g_peerSeen = false; return false; }
  g_peerSeen = true;
  String req = String("GET /api/check?uid=") + uid + "&date=" + dateStr +
               "&period=" + p + " HTTP/1.0\r\nHost: " + g_peerIp +
               "\r\nX-Peer-Key: " + g_peerKey + "\r\nConnection: close\r\n\r\n";
  c.print(req);
  String resp;
  uint32_t t0 = millis();
  while ((uint32_t)(millis() - t0) < 900) {
    while (c.available()) {
      resp += (char)c.read();
      if (resp.length() > 2000) break;
    }
    if (resp.length() > 2000) break;
    if (!c.connected() && resp.length() > 0) break;
    yield();
  }
  c.stop();
  return resp.indexOf("\"visited\":true") >= 0;
}

// ==================== РЕЕСТР КАРТ ============================
bool loadCards() {
  g_cards.clear();
  String s = readFileAll("/cards.json");
  if (s.length() < 2) return false;
  JsonDocument doc;
  if (deserializeJson(doc, s)) return false;
  JsonArray arr = doc.as<JsonArray>();
  for (JsonObject o : arr) {
    CardRec c;
    c.uid   = String(o["uid"] | "");
    c.id    = o["id"] | 0;
    c.name  = String(o["name"] | "");
    c.admin = (o["adm"] | 0) == 1;
    if (c.uid.length()) g_cards.push_back(c);
  }
  return true;
}
bool saveCards() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (size_t i = 0; i < g_cards.size(); i++) {
    JsonObject o = arr.add<JsonObject>();
    o["uid"]  = g_cards[i].uid;
    o["id"]   = g_cards[i].id;
    o["name"] = g_cards[i].name;
    o["adm"]  = g_cards[i].admin ? 1 : 0;
  }
  String s; serializeJson(doc, s);
  return writeFileAll("/cards.json", s);
}
CardRec* findCard(const String& uid) {
  for (size_t i = 0; i < g_cards.size(); i++)
    if (g_cards[i].uid == uid) return &g_cards[i];
  return nullptr;
}

/* ИДЕЯ НЕПЕРЕСЕКАЮЩИХСЯ ID (v1.7):
 * счётчики в каждом терминале НЕЗАВИСИМЫ и стартуют с 1,
 * но выдаваемый номер = счётчик*2 + чётность_терминала.
 * СТОЛОВАЯ  -> чётные:  2, 4, 6, 8 ...
 * РЕСТОРАН  -> нечётные: 3, 5, 7, 9 ...
 * Коллизия между залами невозможна математически.             */
uint32_t issueNextId() {
  uint32_t cnt = prefs.getUInt("idcnt", 0) + 1;
  prefs.putUInt("idcnt", cnt);
  return cnt * 2 + (g_terminal == 0 ? 0 : 1);
}

// ==================== НАСТРОЙКИ NVS ==========================
void loadSettings() {
  prefs.begin("talon32", false);
  g_ssid        = prefs.getString("ssid", "");
  g_pass        = prefs.getString("pass", "");
  g_adminPass   = prefs.getString("adminpass", DEFAULT_PASS);
  g_tgToken     = prefs.getString("tgtoken", "");
  g_tgChat      = prefs.getString("tgchat", "");
  g_smtpKey     = prefs.getString("smtpkey", "");
  g_senderEmail = prefs.getString("sender", "talon32@notify.local");
  g_emailTo     = prefs.getString("mailto", "");
  g_peerIp      = prefs.getString("peerip", "");
  g_peerKey     = prefs.getString("peerkey", DEFAULT_PEER_KEY);
  g_tzMin       = prefs.getInt("tz", 180);
  g_terminal    = prefs.getUChar("terminal", 0) ? 1 : 0;
  g_laserInvert = prefs.getUChar("laserinv", 0) != 0;
  g_dayReportMin= prefs.getUShort("dayrep", 1260);
  String sc     = prefs.getString("sched", "510,690,810,930,1080,1200");
  int v[6]; int n = sscanf(sc.c_str(), "%d,%d,%d,%d,%d,%d",
                           &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]);
  if (n == 6) {
    bool ok = true;
    for (int p = 0; p < 3; p++) {
      if (v[p*2] < 0 || v[p*2] > 1439 || v[p*2+1] <= v[p*2]) ok = false;
    }
    if (ok) for (int p = 0; p < 3; p++) { g_sched[p][0] = v[p*2]; g_sched[p][1] = v[p*2+1]; }
  }
}
void saveSched() {
  String s;
  for (int p = 0; p < 3; p++) {
    if (p) s += ",";
    s += String(g_sched[p][0]) + "," + String(g_sched[p][1]);
  }
  prefs.putString("sched", s);
}

// ========================= LCD ================================
String g_lcdOvr1, g_lcdOvr2;
uint32_t g_lcdOvrUntil = 0;
uint32_t g_lcdNext = 0;
uint8_t  g_lcdScreen = 0;

void lcdShow(const String& l1, const String& l2, uint32_t ms) {
  g_lcdOvr1 = l1.substring(0, 16);
  g_lcdOvr2 = l2.substring(0, 16);
  g_lcdOvrUntil = millis() + ms;
}
void lcdDraw() {
  String a, b;
  if (g_lcdOvrUntil && (int32_t)(millis() - g_lcdOvrUntil) < 0) {
    a = g_lcdOvr1; b = g_lcdOvr2;
  } else {
    g_lcdOvrUntil = 0;
    switch (g_lcdScreen) {
      case 0: {
        if (g_now) {
          DateTime dt(g_now); char l[17];
          snprintf(l, sizeof(l), "%02d.%02d.%04d %s", dt.day(), dt.month(), dt.year(),
                   WEEKDAYS_RU[dt.dayOfTheWeek() % 7]);
          a = l;
          snprintf(l, sizeof(l), "%02d:%02d:%02d %s", dt.hour(), dt.minute(), dt.second(),
                   g_net == NET_STA_ON ? "STA:OK" : (g_net == NET_AP ? "AP" : "..."));
          b = l;
        } else { a = "НЕТ ВРЕМЕНИ"; b = g_rtcOk ? "RTC OK" : "ЖДЁМ СИНХРОН"; }
        break;
      }
      case 1:
        if (g_net == NET_STA_ON) {
          a = "IP:" + WiFi.localIP().toString();
          b = "NET:" + (g_ssid.length() ? g_ssid.substring(0, 12) : String("?"));
        } else if (g_net == NET_AP) {
          a = "ТОЧКА:" + String(AP_SSID).substring(0, 10);
          b = "IP:192.168.4.1";
        } else { a = "ПОДКЛЮЧЕНИЕ"; b = "К WI-FI..."; }
        break;
      case 2: {
        int p = g_now ? periodOf(g_now) : -1;
        a = (p >= 0) ? (String(PERIOD_NAMES[p]) + " " + minToStr(g_sched[p][0]))
                     : String("ВНЕ ПЕРИОДА");
        b = "СЕГОДНЯ:" + String(g_tVisits) + "/" + String(g_todayIds.size()) + "Г";
        break;
      }
      default:
        a = String("ЗАЛ:") + PLACE_NAMES[g_terminal ? 1 : 0];
        b = String("ЛУЧ:") + (g_laser == LS_ARMED ? "ОХРАНА" :
                             g_laser == LS_GRACE ? "ПРОХОД" : "ТРЕВОГА");
        break;
    }
  }
  // перерисовка ТОЛЬКО при смене контента — иначе мерцание
  static String prevA = "\x01", prevB;
  static uint32_t prevOvr = 0;
  if (a == prevA && b == prevB && g_lcdOvrUntil == prevOvr) return;
  prevA = a; prevB = b; prevOvr = g_lcdOvrUntil;
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(a.substring(0, 16));
  lcd.setCursor(0, 1); lcd.print(b.substring(0, 16));
}
void lcdTick() {
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 250) return;
  last = millis();
  static uint32_t rot = 0;
  if (!g_lcdOvrUntil && (uint32_t)(millis() - rot) >= 4000) {
    rot = millis();
    g_lcdScreen = (g_lcdScreen + 1) % 4;
  }
  lcdDraw();
}

// ========================= WI-FI ==============================
void startSTA() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(g_ssid.c_str(), g_pass.c_str());
  g_net = NET_STA_TRY;
  g_netT0 = millis();
}
void startAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, "");
  dns.start(53, "*", WiFi.softAPIP());
  g_net = NET_AP;
  g_netNext = millis() + g_apBackoff;
  g_apBackoff = min(g_apBackoff * 2, 300000UL);   // экспоненциальный повтор, до 5 мин
  lcdShow("НЕТ WI-FI: ТОЧКА", String(AP_SSID).substring(0, 16), 6000);
}
void wifiTick() {
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 400) return;
  last = millis();

  if (g_netRestartAt && (int32_t)(millis() - g_netRestartAt) >= 0) {
    g_netRestartAt = 0;
    startSTA();
    return;
  }
  switch (g_net) {
    case NET_STA_TRY:
      if (WiFi.status() == WL_CONNECTED) {
        g_net = NET_STA_ON;
        g_sntpOk = false;
        g_apBackoff = 15000;         // удачное подключение — сброс экспоненты
        configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
        lcdShow("WI-FI: ПОДКЛЮЧЕН", WiFi.localIP().toString(), 5000);
        logEvent("SYS_WIFI_OK", "", 0, "", -1);
      } else if ((uint32_t)(millis() - g_netT0) > 15000) {
        startAP();                               // нет сети — поднимаем свою
      }
      break;
    case NET_STA_ON:
      if (WiFi.status() != WL_CONNECTED) startSTA();   // автопереподключение
      break;
    case NET_AP:
      dns.processNextRequest();
      if ((int32_t)(millis() - g_netNext) >= 0) {      // периодически пробуем STA снова
        if (g_ssid.length()) startSTA();
        else g_netNext = millis() + 60000;
      }
      break;
  }
  if (g_net == NET_AP) dns.processNextRequest();
}
void sntpTick() {
  if (g_net != NET_STA_ON || g_sntpOk) {
    // периодическая сверка RTC с интернетом (раз в 6 часов)
    if (g_sntpOk && g_rtcOk && (uint32_t)(millis() - g_lastRtcSync) > 6UL*3600UL*1000UL)
      syncRtcFromNet(true);
    return;
  }
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 2000) return;
  last = millis();
  if (time(nullptr) > 1700000000) {
    g_sntpOk = true;
    syncRtcFromNet(false);
  }
}
void syncRtcFromNet(bool force) {
  time_t t = time(nullptr);
  if (t < 1700000000) return;
  uint32_t loc = (uint32_t)t + (uint32_t)(g_tzMin * 60);
  if (!force && g_rtcOk) {
    int32_t diff = (int32_t)(loc - rtc.now().unixtime());
    if (abs(diff) < 5) { g_lastRtcSync = millis(); return; }  // не дёргаем без нужды
  }
  rtc.adjust(DateTime(loc));
  g_rtcOk = true;
  g_lastRtcSync = millis();
  lcdShow("ВРЕМЯ СИНХРОН", timeStrOf(loc), 3500);
}

// ================== ЛАЗЕРНЫЙ РУБЕЖ ===========================
bool beamBlocked() {
  bool raw = digitalRead(PIN_LASER_RX) == (g_laserInvert ? LOW : HIGH);
  return raw;
}
void laserGrace() {          // включается ПОСЛЕ успешного прохода карты
  g_laser = LS_GRACE;
  g_graceEnd = millis() + LASER_GRACE_MS;
}
void laserTick() {
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 25) return;
  last = millis();

  bool raw = beamBlocked();
  if (raw != g_beamRawPrev) { g_beamRawPrev = raw; g_beamChg = millis(); }
  if ((uint32_t)(millis() - g_beamChg) > 40) g_beamStable = g_beamRawPrev; // антидребезг

  switch (g_laser) {
    case LS_ARMED:
      if (g_beamStable) {                       // луч пересечён БЕЗ карты
        g_laser = LS_ALARM;
        g_alarmEnd = millis() + LASER_ALARM_MS;
        lampOn(2, LASER_ALARM_MS);              // ОРАНЖЕВАЯ лампа
        beep(BEEP_ALARM, 5);
        lcdShow("НАРУШЕНИЕ ЛУЧА", "БЕЗ КАРТЫ!", 5000);
        logEvent("BREACH", "", 0, "", g_now ? (int8_t)periodOf(g_now) : -1);
      }
      break;
    case LS_GRACE:
      if (g_beamStable) {                       // гость прошёл — сразу на охрану
        g_laser = LS_ARMED;
        logEvent("PASS", "", 0, "", -1);
      } else if ((int32_t)(millis() - g_graceEnd) >= 0) {
        g_laser = LS_ARMED;                     // 20 секунд истекли — на охрану
        logEvent("GRACE_TIMEOUT", "", 0, "", -1);
      }
      break;
    case LS_ALARM:
      if ((int32_t)(millis() - g_alarmEnd) >= 0) g_laser = LS_ARMED;
      break;
  }
}
const char* laserName() {
  return g_laser == LS_ARMED ? "ОХРАНА" : g_laser == LS_GRACE ? "ПРОХОД" : "ТРЕВОГА";
}

// =================== ОБРАБОТКА КАРТ ==========================
String uidToHex(const byte* b, byte n) {
  String s; char h[3];
  for (byte i = 0; i < n; i++) { snprintf(h, sizeof(h), "%02X", b[i]); s += h; }
  return s;
}
void enterRegMode() {
  g_regUntil = millis() + REG_MODE_MS;
  beep(BEEP_REGOK, 3);
  lampOn(0, 2500);
  lcdShow("РЕГИСТРАЦИЯ 30С", "ПРИЛОЖИ КАРТУ", 30000);
}
void regTick() {
  if (g_regUntil && (int32_t)(millis() - g_regUntil) >= 0) {
    g_regUntil = 0;
    lcdShow("РЕЖИМ ЗАВЕРШЁН", "", 2000);
  }
}
bool antiRepeat(const String& uid) {
  /* Окно 3 с; НЕ глушит сервисные режимы и админ-карты,
   * т.к. вызывается ТОЛЬКО на гостевой ветке (фикс v1.7). */
  if (uid == g_lastUid && (uint32_t)(millis() - g_lastTap) < ANTI_REPEAT_MS) return true;
  g_lastUid = uid;
  g_lastTap = millis();
  return false;
}

void denyVerdict(const String& lcd1, const char* ev, const String& uid,
                 uint32_t id, const String& name, int8_t p) {
  /* Вердикт выносится ПОСЛЕ всех проверок (фикс v1.7):
   * зелёная лампа при ошибке больше не загорится.            */
  lampOn(1, 3000);                    // КРАСНАЯ
  beep(BEEP_ERR, 5);
  lcdShow(lcd1, PLACE_NAMES[g_terminal ? 1 : 0], 3500);
  logEvent(ev, uid, id, name, p);
}

void processReg(const String& uid) {
  if (CardRec* c = findCard(uid)) {
    if (c->admin) { g_regUntil = 0; lcdShow("СЕРВИС: ВЫХОД", "", 2000); beep(BEEP_OK, 1); return; }
    lcdShow("УЖЕ В БАЗЕ", "ID " + String(c->id), 2500);
    beep(BEEP_WARN, 3);
    return;
  }
  uint32_t id = issueNextId();
  CardRec c; c.uid = uid; c.id = id;
  c.name = String("Гость ") + String(id);
  c.admin = false;
  g_cards.push_back(c);
  saveCards();
  lampOn(0, 3000);
  beep(BEEP_REGOK, 3);               // два чётких гудка с паузой
  lcdShow("КАРТА ЗАПИСАНА", "ID " + String(id) + (g_terminal ? " НЕЧЁТ" : " ЧЁТН"), 4000);
  logEvent("CARD_REG", uid, id, c.name, -1);
}

void handleCard(const String& uid) {
  if (g_regUntil) { processReg(uid); return; }        // сервисный режим

  CardRec* c = findCard(uid);
  if (c && c->admin) { enterRegMode(); return; }      // админ-карта: сервис без антиповтора

  if (antiRepeat(uid)) return;                        // только гостевая ветка

  if (!c) { denyVerdict("ОТКАЗ: НЕТ КАРТЫ", "DENIED_UNKNOWN", uid, 0, "",
                        g_now ? (int8_t)periodOf(g_now) : -1); return; }

  if (!g_now) { denyVerdict("НЕТ ВРЕМЕНИ!", "NO_TIME", uid, c->id, c->name, -1); return; }

  int p = periodOf(g_now);
  if (p < 0) { denyVerdict("ВНЕ РАСПИСАНИЯ", "DENIED_HOURS", uid, c->id, c->name, -1); return; }

  String d = dateStrOf(g_now);
  bool visited = localVisited(uid, p) || peerVisited(uid, p, d);
  if (visited) { denyVerdict("ОТКАЗ: УЖЕ БЫЛ", "DENIED_DUP", uid, c->id, c->name, (int8_t)p); return; }

  // --- УСПЕХ: все проверки пройдены, теперь вердикт ---
  logEvent("VISIT", uid, c->id, c->name, (int8_t)p);
  lampOn(0, 3000);                                    // ЗЕЛЁНАЯ
  beep(BEEP_OK, 1);
  laserGrace();                                       // луч снят на проход (<= 20 с)
  lcdShow("ДОСТУП РАЗРЕШЁН", String(PERIOD_NAMES[p]) + " " + c->name.substring(0, 7), 4000);
}

void rfidTick() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;
  String uid = uidToHex(rfid.uid.uidByte, rfid.uid.size);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  handleCard(uid);
}

// ==================== КНОПКА РЕГИСТРАЦИИ =====================
void buttonTick() {
  static bool prev = false;
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 40) return;
  last = millis();
  bool nowDown = digitalRead(PIN_BTN_REG) == LOW;
  if (nowDown && !prev) enterRegMode();
  prev = nowDown;
}

// ===================== TELEGRAM-БОТ ==========================
bool tgRequest(const String& url, const String& body, String& resp, const String& ctype) {
  if (g_net != NET_STA_ON || !g_tgToken.length()) return false;
  WiFiClientSecure cli;
  cli.setInsecure();
  if (!cli.connect("api.telegram.org", 443)) return false;
  if (body.length()) {
    cli.println("POST " + url + " HTTP/1.1");
    cli.println("Host: api.telegram.org");
    cli.println("Content-Type: " + ctype);
    cli.println("Content-Length: " + String(body.length()));
    cli.println("Connection: close");
    cli.println();
    cli.print(body);
  } else {
    cli.println("GET " + url + " HTTP/1.1");
    cli.println("Host: api.telegram.org");
    cli.println("Connection: close");
    cli.println();
  }
  uint32_t t0 = millis();
  while ((uint32_t)(millis() - t0) < 6000) {
    while (cli.available()) { resp += (char)cli.read(); if (resp.length() > 30000) break; }
    if (!cli.connected()) break;
    yield();
  }
  cli.stop();
  return resp.indexOf("\"ok\":true") >= 0;
}
bool tgSend(const String& text) {
  JsonDocument doc;
  doc["chat_id"] = g_tgChat;
  doc["text"] = text;
  String body; serializeJson(doc, body);
  String resp;
  return tgRequest("/bot" + g_tgToken + "/sendMessage", body, resp, "application/json");
}
bool tgSendDoc(const String& filename, const String& content, const String& caption) {
  String B = "talon32boundary";
  String body = "--" + B + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" +
                g_tgChat + "\r\n--" + B +
                "\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n" +
                caption + "\r\n--" + B +
                "\r\nContent-Disposition: form-data; name=\"document\"; filename=\"" +
                filename + "\"\r\nContent-Type: text/csv\r\n\r\n" +
                content + "\r\n--" + B + "--\r\n";
  String resp;
  return tgRequest("/bot" + g_tgToken + "/sendDocument", body, resp,
                   "multipart/form-data; boundary=" + B);
}

void tgHandleCommand(const String& text) {
  int sp = text.indexOf(' ');
  String cmd = sp < 0 ? text : text.substring(0, sp);
  cmd.trim();

  if (cmd == "/start" || cmd == "/help") {
    tgSend(String(DEVICE_NAME) + " v" + FW_VERSION +
           "\nКоманды:\n/status - состояние\n/today - итоги дня"
           "\n/report [ГГГГ-ММ-ДД [ГГГГ-ММ-ДД]] - CSV-отчёт");
  } else if (cmd == "/status") {
    String s = String(DEVICE_NAME) + " · " + PLACE_NAMES[g_terminal ? 1 : 0] +
               "\nВремя: " + (g_now ? dateStrOf(g_now) + " " + timeStrOf(g_now) : String("нет")) +
               "\nWi-Fi: " + (g_net == NET_STA_ON ? ("STA " + WiFi.localIP().toString()) : String("AP-режим")) +
               "\nЛазер: " + laserName() +
               "\nСегодня: посещений " + String(g_tVisits) + ", гостей " + String(g_todayIds.size()) +
               ", отказов " + String(g_tDenied) + ", нарушений " + String(g_tBreach);
    tgSend(s);
  } else if (cmd == "/today") {
    tgSend("Сегодня (" + dateStrOf(g_now) + "): посещений " + String(g_tVisits) +
           ", гостей " + String(g_todayIds.size()) + ", отказов " + String(g_tDenied) +
           ", нарушений луча " + String(g_tBreach));
  } else if (cmd == "/report") {
    String d1 = g_dateStr, d2 = g_dateStr;
    if (sp >= 0) {
      String rest = text.substring(sp + 1);
      rest.trim();
      int sp2 = rest.indexOf(' ');
      if (sp2 > 0) { d1 = rest.substring(0, sp2); d2 = rest.substring(sp2 + 1); d2.trim(); }
      else if (rest.length() >= 10) d1 = rest.substring(0, 10);
    }
    String csv = buildReport(d1, d2, "csv");
    tgSendDoc("talon32_" + d1 + "_" + d2 + ".csv", csv,
              "Отчёт " + d1 + " — " + d2 + " (" + PLACE_NAMES[g_terminal ? 1 : 0] + ")");
  }
}
void tgTick() {
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 5000) return;   // реже опрос — меньше пауз в loop()
  last = millis();
  if (g_net != NET_STA_ON || !g_tgToken.length()) return;
  String resp;
  if (!tgRequest("/bot" + g_tgToken + "/getUpdates?offset=" + String(g_tgOffset + 1) +
                 "&timeout=0&limit=10", "", resp, "")) return;
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return;
  JsonArray arr = doc["result"];
  for (JsonObject u : arr) {
    long updId = u["update_id"] | 0;
    if (updId > g_tgOffset) g_tgOffset = updId;
    JsonObject msg = u["message"];
    if (msg.isNull()) continue;
    String chat = String((long)(msg["chat"]["id"] | 0));
    if (g_tgChat.length() && chat != g_tgChat) continue;   // только от админа
    String text = msg["text"] | "";
    if (text.startsWith("/")) tgHandleCommand(text);
  }
}

// ======================= E-MAIL ==============================
bool mailSend(const String& subject, const String& html, const String& text) {
  if (g_net != NET_STA_ON || !g_smtpKey.length() || !g_emailTo.length()) return false;
  JsonDocument doc;
  doc["api_key"] = g_smtpKey;
  doc["to"].add(g_emailTo);
  doc["sender"] = g_senderEmail;
  doc["subject"] = subject;
  doc["html_body"] = html;
  doc["text_body"] = text;
  String body; serializeJson(doc, body);
  String resp;
  WiFiClientSecure cli;
  cli.setInsecure();
  if (!cli.connect("api.smtp2go.com", 443)) return false;
  cli.println("POST /v3/email/send HTTP/1.1");
  cli.println("Host: api.smtp2go.com");
  cli.println("Content-Type: application/json");
  cli.println("Content-Length: " + String(body.length()));
  cli.println("Connection: close");
  cli.println();
  cli.print(body);
  uint32_t t0 = millis();
  while ((uint32_t)(millis() - t0) < 8000) {
    while (cli.available()) { resp += (char)cli.read(); if (resp.length() > 20000) break; }
    if (!cli.connected()) break;
    yield();
  }
  cli.stop();
  return resp.indexOf("\"succeeded\"") >= 0;
}

// ======================= ОТЧЁТЫ ==============================
String buildReport(const String& fromS, const String& toS, const String& fmt) {
  int y, m, d;
  String f1 = fromS, f2 = toS;
  if (f1.length() < 10) f1 = g_dateStr;
  if (f2.length() < 10) f2 = f1;
  if (sscanf(f1.c_str(), "%d-%d-%d", &y, &m, &d) != 3) f1 = g_dateStr;
  if (sscanf(f2.c_str(), "%d-%d-%d", &y, &m, &d) != 3) f2 = f1;
  uint32_t e1 = DateTime((uint16_t)atoi(f1.substring(0,4).c_str()),
                         (uint8_t)atoi(f1.substring(5,7).c_str()),
                         (uint8_t)atoi(f1.substring(8,10).c_str())).unixtime();
  uint32_t e2 = DateTime((uint16_t)atoi(f2.substring(0,4).c_str()),
                         (uint8_t)atoi(f2.substring(5,7).c_str()),
                         (uint8_t)atoi(f2.substring(8,10).c_str())).unixtime();
  if (e2 < e1) { uint32_t t = e1; e1 = e2; e2 = t; }
  if ((e2 - e1) > 62UL*86400UL) e2 = e1 + 62UL*86400UL;   // защита диапазона

  struct Row { String date, tm, uid, name, place, period, event; uint32_t id; };
  std::vector<Row> rows;

  for (uint32_t e = e1; e <= e2; e += 86400) {
    DateTime dt(e);
    char nm[12]; snprintf(nm, sizeof(nm), "%04d-%02d-%02d", dt.year(), dt.month(), dt.day());
    String path = String("/log/") + nm + ".jsonl";
    if (!LittleFS.exists(path)) continue;
    File f = LittleFS.open(path, "r");
    if (!f) continue;
    while (f.available()) {
      String line = f.readStringUntil('\n');
      line.trim();
      if (line.length() < 4) continue;
      JsonDocument jd;
      if (deserializeJson(jd, line)) continue;
      Row r;
      r.date = nm;
      uint32_t ts = jd["ts"] | 0;
      r.tm = ts ? timeStrOf(ts) : String("--:--:--");
      r.uid = jd["uid"] | "";
      r.id = jd["id"] | 0;
      r.name = jd["name"] | "";
      r.place = jd["place"] | "";
      r.period = jd["period"] | "";
      r.event = jd["event"] | "";
      rows.push_back(r);
    }
    f.close();
  }

  String place = PLACE_NAMES[g_terminal ? 1 : 0];

  if (fmt == "csv") {
    String s = "\xEF\xBB\xBF";   // BOM для Excel
    s += "Дата;Время;Место;ID;UID;Имя;Период;Событие\r\n";
    for (size_t i = 0; i < rows.size(); i++) {
      s += rows[i].date + ";" + rows[i].tm + ";" + rows[i].place + ";" +
           String(rows[i].id) + ";" + rows[i].uid + ";" + rows[i].name + ";" +
           rows[i].period + ";" + rows[i].event + "\r\n";
    }
    return s;
  }
  if (fmt == "txt") {
    String s = "ТАЛОН-32 v" + String(FW_VERSION) + " · " + place +
               "\nОтчёт за период: " + f1 + " — " + f2 +
               "\nЗаписей: " + String(rows.size()) +
               "\n------------------------------------------------------------\n";
    for (size_t i = 0; i < rows.size(); i++) {
      s += rows[i].date + " " + rows[i].tm + "  ID " + String(rows[i].id) +
           "  " + rows[i].name + "  " + rows[i].period + "  " + rows[i].event + "\n";
    }
    return s;
  }
  // HTML
  String s = "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'>"
             "<title>Талон-32 · Отчёт</title><style>"
             "body{font-family:'Segoe UI',Arial,sans-serif;background:#0e151c;color:#dce7f0;margin:0;padding:32px}"
             "h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px;color:#4ce08f}"
             ".sub{color:#8fa5b8;font-size:13px;margin-bottom:22px}"
             "table{border-collapse:collapse;width:100%;font-size:13px}"
             "th{background:#16222d;text-align:left;padding:8px 10px;border-bottom:2px solid #2a3d4e}"
             "td{padding:7px 10px;border-bottom:1px solid #1e2c39}"
             "tr:hover td{background:#131d27}.ok{color:#4ce08f}.bad{color:#ff6262}.wr{color:#ffb347}"
             "</style></head><body>";
  s += "<h1>ТАЛОН-32 v" + String(FW_VERSION) + " — отчёт по посещениям</h1>";
  s += "<div class='sub'>Терминал: " + place + " · Период: " + f1 + " — " + f2 +
       " · Сформирован: " + (g_now ? dateStrOf(g_now) + " " + timeStrOf(g_now) : String("-")) + "</div>";

  // сводка по гостям
  struct GuestSum { uint32_t id; String name; int visits; String periods; String last; };
  std::vector<GuestSum> gs;
  for (size_t i = 0; i < rows.size(); i++) {
    if (rows[i].event != "VISIT") continue;
    GuestSum* g = nullptr;
    for (size_t k = 0; k < gs.size(); k++) if (gs[k].id == rows[i].id) { g = &gs[k]; break; }
    if (!g) { GuestSum n; n.id = rows[i].id; n.name = rows[i].name; n.visits = 0; gs.push_back(n); g = &gs.back(); }
    g->visits++;
    if (g->periods.indexOf(rows[i].period) < 0) {
      if (g->periods.length()) g->periods += ", ";
      g->periods += rows[i].period + " (" + rows[i].date + ")";
    }
    g->last = rows[i].date + " " + rows[i].tm;
  }
  s += "<h2>Кто и когда посещал</h2><table><tr><th>ID</th><th>Гость</th><th>Посещений</th>"
       "<th>Периоды (дата)</th><th>Последний визит</th></tr>";
  for (size_t i = 0; i < gs.size(); i++) {
    s += "<tr><td>" + String(gs[i].id) + "</td><td>" + gs[i].name + "</td><td>" +
         String(gs[i].visits) + "</td><td>" + gs[i].periods + "</td><td>" + gs[i].last + "</td></tr>";
  }
  s += "</table><h2>Полный журнал</h2><table><tr><th>Дата</th><th>Время</th><th>ID</th>"
       "<th>Гость</th><th>UID</th><th>Период</th><th>Событие</th></tr>";
  for (size_t i = 0; i < rows.size(); i++) {
    String cls = rows[i].event == "VISIT" ? "ok" :
                 (rows[i].event == "BREACH" ? "wr" :
                  (rows[i].event.startsWith("DENIED") ? "bad" : ""));
    s += "<tr><td>" + rows[i].date + "</td><td>" + rows[i].tm + "</td><td>" +
         String(rows[i].id) + "</td><td>" + rows[i].name + "</td><td>" + rows[i].uid +
         "</td><td>" + rows[i].period + "</td><td class='" + cls + "'>" + rows[i].event + "</td></tr>";
  }
  s += "</table></body></html>";
  return s;
}

// =========== ИТОГИ ПЕРИОДОВ И ДНЯ (TELEGRAM/MAIL) ============
String periodLine(int p) {
  uint16_t visits = 0;
  std::vector<uint32_t> ids;
  for (size_t i = 0; i < g_today.size(); i++) {
    if (g_today[i].period != (uint8_t)p) continue;
    visits++;
    bool seen = false;
    for (size_t k = 0; k < ids.size(); k++) if (ids[k] == g_today[i].id) { seen = true; break; }
    if (!seen) ids.push_back(g_today[i].id);
  }
  return String("[") + DEVICE_NAME + " · " + PLACE_NAMES[g_terminal ? 1 : 0] + "] " +
         PERIOD_NAMES[p] + " (" + minToStr(g_sched[p][0]) + "-" + minToStr(g_sched[p][1]) +
         ") завершён: посещений " + String(visits) + ", гостей " + String(ids.size()) +
         ", отказов " + String(g_tDeniedP[p]) + ", нарушений луча " + String(g_tBreach);
}
void sendPeriodSummary(int p) {
  String line = periodLine(p);
  tgSend(line);                      // ОДНА общая строка за период
  logEvent("SYS_PERIOD_SUM", "", 0, line, (int8_t)p);
}
void sendDailyReport() {
  String d = g_dateStr;
  String csv = buildReport(d, d, "csv");
  String html = buildReport(d, d, "html");
  String head = String("[") + DEVICE_NAME + " · " + PLACE_NAMES[g_terminal ? 1 : 0] +
                "] Итог дня " + d + ": посещений " + String(g_tVisits) + ", гостей " +
                String(g_todayIds.size()) + ", отказов " + String(g_tDenied) +
                ", нарушений " + String(g_tBreach) + ". CSV приложен.";
  tgSend(head);
  tgSendDoc("talon32_" + d + ".csv", csv, "Суточный отчёт " + d);
  mailSend("Талон-32 · Отчёт за " + d + " (" + PLACE_NAMES[g_terminal ? 1 : 0] + ")",
           html, head);
  logEvent("REPORT_SENT", "", 0, head, -1);
}

// ==================== ТИК ВРЕМЕНИ/ДНЯ ========================
void timeTick() {
  static uint32_t last = 0;
  if ((uint32_t)(millis() - last) < 1000) return;
  last = millis();

  uint32_t e = nowLocal();
  g_now = e;
  if (!e) return;

  String d = dateStrOf(e);
  if (d != g_dateStr) {                      // сменились сутки
    g_dateStr = d;
    LittleFS.mkdir("/log");
    g_sentDaily = false;
    rebuildTodayCache();
  }
  DateTime dt(e);
  int m = dt.hour() * 60 + dt.minute();
  if (m != g_minuteOfDay) {
    int prev = g_minuteOfDay;
    g_minuteOfDay = m;
    if (prev >= 0 && m > prev) {             // без срабатываний на полуночном скачке
      for (int p = 0; p < 3; p++) {
        if (prev < (int)g_sched[p][1] && m >= (int)g_sched[p][1])
          sendPeriodSummary(p);              // период только что закрылся
      }
      if (m >= (int)g_dayReportMin && !g_sentDaily) {
        g_sentDaily = true;
        sendDailyReport();
      }
    }
  }
}

// ==================== АДМИН-ПАНЕЛЬ (WEB) =====================
static const char WEBUI[] PROGMEM = R"talonwebui(<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Талон-32 · Админ-панель</title>
<style>
:root{--bg:#0d141b;--p:#121b24;--p2:#0f171f;--ln:#1f2d3a;--tx:#dce7f0;--mut:#8fa5b8;
--g:#4ce08f;--a:#ffb347;--r:#ff6262;--c:#62c8f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);
font:14px/1.5 'Segoe UI',Arial,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:18px}
.hd{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--ln);margin-bottom:16px}
.hd b{font-size:18px}.hd .v{color:var(--g);font-family:Consolas,monospace}
.hd .sp{flex:1}
.chip{padding:3px 10px;border:1px solid var(--ln);border-radius:99px;font-size:12px;color:var(--mut)}
.chip.on{color:var(--g);border-color:var(--g)}
.card{background:var(--p);border:1px solid var(--ln);border-radius:10px;padding:14px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}
.vv{font-size:20px;font-weight:700;font-family:Consolas,monospace}
.vv.g{color:var(--g)}.vv.a{color:var(--a)}.vv.r{color:var(--r)}.vv.c{color:var(--c)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tabs button{background:var(--p2);color:var(--mut);border:1px solid var(--ln);border-radius:8px;
padding:8px 14px;cursor:pointer;font-size:13px}
.tabs button.act{color:var(--g);border-color:var(--g);background:#10201a}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--mut);font-size:11px;text-transform:uppercase;padding:8px;
border-bottom:2px solid var(--ln)}
td{padding:7px 8px;border-bottom:1px solid var(--ln)}
.badge{padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.b-ok{background:#123524;color:var(--g)}.b-no{background:#3a1418;color:var(--r)}
.b-wr{background:#3a2a10;color:var(--a)}.b-in{background:#12283a;color:var(--c)}
input,select{background:var(--p2);border:1px solid var(--ln);color:var(--tx);border-radius:8px;
padding:8px 10px;font-size:14px;width:100%}
label{display:block;font-size:12px;color:var(--mut);margin:10px 0 4px}
.btn{background:#123524;color:var(--g);border:1px solid var(--g);border-radius:8px;
padding:9px 16px;cursor:pointer;font-size:14px;font-weight:600;margin-top:12px}
.btn:hover{background:#1a4a32}.btn.red{background:#3a1418;color:var(--r);border-color:var(--r)}
.btn.blue{background:#12283a;color:var(--c);border-color:var(--c)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#login{max-width:340px;margin:12vh auto}
.hide{display:none}
.mut{color:var(--mut);font-size:12px}
</style></head><body><div class="wrap">

<div id="login" class="card">
 <div style="font-size:20px;font-weight:700;margin-bottom:2px">ТАЛОН-32 <span style="color:var(--g);font-family:Consolas,monospace">v1.7</span></div>
 <div class="mut" style="margin-bottom:14px">Админ-панель терминала. Доступ только по паролю.</div>
 <label>Пароль администратора</label>
 <input type="password" id="lpass" autocomplete="current-password">
 <button class="btn" style="width:100%" id="lbtn">Войти</button>
 <div class="mut" id="lerr" style="color:var(--r);margin-top:8px"></div>
</div>

<div id="app" class="hide">
 <div class="hd">
  <b>ТАЛОН-32</b><span class="v">v1.7</span>
  <span class="chip" id="hPlace">—</span>
  <span class="chip on" id="hTime">--:--:--</span>
  <span class="chip" id="hWifi">Wi-Fi</span>
  <span class="chip" id="hLaser">Лазер</span>
  <span class="sp"></span>
  <button class="btn blue" style="margin:0;padding:6px 12px" id="lout">Выход</button>
 </div>

 <div class="tabs" id="tabs">
  <button data-t="dash" class="act">Дашборд</button>
  <button data-t="log">Журнал и отчёты</button>
  <button data-t="cards">Карты</button>
  <button data-t="sched">Расписание</button>
  <button data-t="net">Сеть</button>
  <button data-t="notify">Telegram и почта</button>
  <button data-t="sys">Система</button>
 </div>

 <div class="card" id="t-dash">
  <div class="grid">
   <div><div class="k">Период сейчас</div><div class="vv c" id="dPeriod">—</div></div>
   <div><div class="k">Посещений сегодня</div><div class="vv g" id="dVisits">0</div></div>
   <div><div class="k">Гостей сегодня</div><div class="vv g" id="dGuests">0</div></div>
   <div><div class="k">Отказов</div><div class="vv r" id="dDenied">0</div></div>
   <div><div class="k">Нарушений луча</div><div class="vv a" id="dBreach">0</div></div>
   <div><div class="k">Аптайм</div><div class="vv" id="dUp">—</div></div>
   <div><div class="k">IP-адрес</div><div class="vv c" id="dIp">—</div></div>
   <div><div class="k">Свободно ОЗУ</div><div class="vv" id="dHeap">—</div></div>
  </div>
  <p class="mut" id="dPeer" style="margin:12px 0 0"></p>
 </div>

 <div class="card hide" id="t-log">
  <div class="row">
   <div><label>Дата журнала</label><input type="date" id="lgDate"></div>
   <div><label>Отчёт: с … по …</label>
    <div class="row"><input type="date" id="rpFrom"><input type="date" id="rpTo"></div>
   </div>
  </div>
  <button class="btn" id="lgBtn">Показать журнал</button>
  <button class="btn blue" id="rpHtml">Отчёт HTML</button>
  <button class="btn blue" id="rpCsv">Отчёт CSV</button>
  <button class="btn blue" id="rpTxt">Отчёт TXT</button>
  <div style="overflow-x:auto;margin-top:12px"><table id="lgTab">
   <tr><th>Время</th><th>ID</th><th>Гость</th><th>UID</th><th>Период</th><th>Событие</th></tr>
  </table></div>
 </div>

 <div class="card hide" id="t-cards">
  <button class="btn" id="regBtn">Режим регистрации карты (30 с)</button>
  <span class="mut" id="regInfo" style="margin-left:12px"></span>
  <p class="mut">Поднесите новую карту к считывателю терминала — номер будет выдан автоматически
  (СТОЛОВАЯ = чётные, РЕСТОРАН = нечётные).</p>
  <div class="row" style="margin-top:8px">
   <div><label>UID вручную (HEX, например 04A1B2C3)</label><input id="cUid"></div>
   <div><label>Имя гостя</label><input id="cName"></div>
  </div>
  <button class="btn" id="cAdd">Добавить карту</button>
  <div style="overflow-x:auto;margin-top:12px"><table id="cTab">
   <tr><th>ID</th><th>UID</th><th>Имя</th><th>Роль</th><th></th></tr>
  </table></div>
 </div>

 <div class="card hide" id="t-sched">
  <p class="mut">Окна посещения. Гость может посетить только ОДНО место в каждом окне.</p>
  <div class="row"><div><label>Завтрак: с</label><input type="time" id="s0a">
   <label>по</label><input type="time" id="s0b"></div>
  <div><label>Обед: с</label><input type="time" id="s1a"><label>по</label><input type="time" id="s1b"></div></div>
  <div class="row"><div><label>Ужин: с</label><input type="time" id="s2a"><label>по</label><input type="time" id="s2b"></div>
  <div><label>Суточный отчёт в</label><input type="time" id="sDay"></div></div>
  <button class="btn" id="sSave">Сохранить расписание</button>
 </div>

 <div class="card hide" id="t-net">
  <div class="row">
   <div><label>Имя сети Wi-Fi (SSID)</label><input id="wSsid"></div>
   <div><label>Пароль Wi-Fi</label><input id="wPass" type="password"></div>
  </div>
  <button class="btn" id="wSave">Сохранить и переподключиться</button>
  <div class="row" style="margin-top:10px">
   <div><label>IP второго терминала (сверка «одно место за период»)</label><input id="nPeer" placeholder="192.168.1.78"></div>
   <div><label>Часовой пояс, минут от UTC (МСК = 180)</label><input id="nTz" type="number"></div>
  </div>
  <div class="row">
   <div><label>Терминал</label><select id="nTerm"><option value="0">СТОЛОВАЯ (чётные ID)</option><option value="1">РЕСТОРАН (нечётные ID)</option></select></div>
   <div><label>Лазерный приёмник</label><select id="nLaser"><option value="0">Обычный (луч прерван = HIGH)</option><option value="1">Инверсный (луч прерван = LOW)</option></select></div>
  </div>
  <button class="btn" id="nSave">Сохранить параметры</button>
 </div>

 <div class="card hide" id="t-notify">
  <div class="row">
   <div><label>Токен Telegram-бота (@BotFather)</label><input id="gTok" placeholder="123456:ABC-..."></div>
   <div><label>Chat ID администратора</label><input id="gChat" placeholder="123456789"></div>
  </div>
  <button class="btn" id="gSave">Сохранить Telegram</button>
  <button class="btn blue" id="gTest">Тестовое сообщение</button>
  <p class="mut">В конце каждого периода бот шлёт одну строку с итогом; в 21:00 — CSV-файл за день.</p>
  <div class="row" style="margin-top:10px">
   <div><label>SMTP2GO API-ключ</label><input id="mKey"></div>
   <div><label>E-mail администратора (получатель)</label><input id="mTo" type="email"></div>
  </div>
  <div class="row">
   <div><label>Адрес отправителя</label><input id="mFrom" placeholder="talon32@ваш-домен.ru"></div>
   <div></div>
  </div>
  <button class="btn" id="mSave">Сохранить почту</button>
 </div>

 <div class="card hide" id="t-sys">
  <div class="row">
   <div><label>Старый пароль</label><input id="pOld" type="password"></div>
   <div><label>Новый пароль</label><input id="pNew" type="password"></div>
  </div>
  <button class="btn" id="pSave">Сменить пароль</button>
  <p class="mut" id="pMsg"></p>
  <button class="btn red" id="reboot">Перезагрузить терминал</button>
 </div>
</div>
</div>

<script>
var S = null;
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function api(p, m, body){
  var o = {method: m || 'GET', headers: {'Content-Type':'application/json'}};
  if (body) o.body = JSON.stringify(body);
  return fetch(p, o).then(function(r){
    if (r.status === 401) { showLogin(); throw new Error('401'); }
    return r.json();
  });
}
function showLogin(){ document.getElementById('app').className='hide';
  document.getElementById('login').className='card'; }
function showApp(){ document.getElementById('login').className='hide';
  document.getElementById('app').className=''; }

function refresh(){
  api('/api/status').then(function(j){
    S = j;
    document.getElementById('hPlace').textContent = j.place;
    document.getElementById('hTime').textContent = j.time || '--:--:--';
    document.getElementById('hWifi').textContent = j.wifiMode === 'STA' ? ('Wi-Fi: ' + j.ip) : 'Wi-Fi: точка доступа';
    document.getElementById('hLaser').textContent = 'Лазер: ' + j.laser;
    document.getElementById('dPeriod').textContent = j.periodName || 'вне периода';
    document.getElementById('dVisits').textContent = j.today.visits;
    document.getElementById('dGuests').textContent = j.today.guests;
    document.getElementById('dDenied').textContent = j.today.denied;
    document.getElementById('dBreach').textContent = j.today.breach;
    document.getElementById('dUp').textContent = j.uptime;
    document.getElementById('dIp').textContent = j.ip;
    document.getElementById('dHeap').textContent = j.heap;
    document.getElementById('dPeer').textContent = j.peerIp
      ? ('Второй терминал: ' + j.peerIp + ' — ' + (j.peerSeen ? 'НА СВЯЗИ' : 'НЕТ ОТВЕТА (решения по локальной базе)'))
      : 'Второй терминал не настроен (поле «IP второго терминала» во вкладке «Сеть»).';
    if (j.regLeft > 0) document.getElementById('regInfo').textContent = 'идёт регистрация: ' + j.regLeft + ' c';
    else document.getElementById('regInfo').textContent = '';
    var sc = j.sched;
    for (var p = 0; p < 3; p++) {
      document.getElementById('s' + p + 'a').value = m2t(sc[p][0]);
      document.getElementById('s' + p + 'b').value = m2t(sc[p][1]);
    }
    document.getElementById('sDay').value = m2t(j.dayReport);
    document.getElementById('nTerm').value = String(j.terminal);
    document.getElementById('nLaser').value = j.laserInvert ? '1' : '0';
    document.getElementById('nTz').value = String(j.tz);
    document.getElementById('nPeer').value = j.peerIp;
    document.getElementById('wSsid').value = j.ssid;
  }).catch(function(){});
}
function m2t(m){ var h = Math.floor(m/60), mm = m%60;
  return (h<10?'0':'')+h+':'+(mm<10?'0':'')+mm; }
function t2m(v){ if(!v) return -1; var a = v.split(':');
  return parseInt(a[0],10)*60 + parseInt(a[1],10); }

document.getElementById('lbtn').onclick = function(){
  var p = document.getElementById('lpass').value;
  fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({pass:p})}).then(function(r){ return r.json(); }).then(function(j){
    if (j.ok) { showApp(); refresh(); setInterval(refresh, 3000); loadCards(); }
    else document.getElementById('lerr').textContent = 'Неверный пароль';
  });
};
document.getElementById('lout').onclick = function(){
  fetch('/api/logout', {method:'POST'}).then(function(){ showLogin(); });
};

var tabs = document.querySelectorAll('#tabs button');
for (var i = 0; i < tabs.length; i++) tabs[i].onclick = function(){
  for (var k = 0; k < tabs.length; k++) tabs[k].className = '';
  this.className = 'act';
  var names = ['dash','log','cards','sched','net','notify','sys'];
  for (var k2 = 0; k2 < names.length; k2++)
    document.getElementById('t-' + names[k2]).className = (names[k2] === this.getAttribute('data-t')) ? 'card' : 'card hide';
};

function badge(ev){
  if (ev === 'VISIT') return '<span class="badge b-ok">посещение</span>';
  if (ev === 'BREACH') return '<span class="badge b-wr">нарушение луча</span>';
  if (ev.indexOf('DENIED') === 0) return '<span class="badge b-no">отказ</span>';
  return '<span class="badge b-in">' + esc(ev) + '</span>';
}
document.getElementById('lgBtn').onclick = function(){
  var d = document.getElementById('lgDate').value;
  api('/api/log?date=' + encodeURIComponent(d)).then(function(j){
    var t = document.getElementById('lgTab');
    var h = '<tr><th>Время</th><th>ID</th><th>Гость</th><th>UID</th><th>Период</th><th>Событие</th></tr>';
    for (var i = 0; i < j.rows.length; i++) { var r = j.rows[i];
      h += '<tr><td>' + esc(r.tm) + '</td><td>' + esc(r.id) + '</td><td>' + esc(r.name) +
        '</td><td>' + esc(r.uid) + '</td><td>' + esc(r.period) + '</td><td>' + badge(r.event) + '</td></tr>'; }
    t.innerHTML = h;
  });
};
function repUrl(f){ var a = document.getElementById('rpFrom').value,
  b = document.getElementById('rpTo').value || a;
  return '/api/report?from=' + encodeURIComponent(a) + '&to=' + encodeURIComponent(b) + '&fmt=' + f; }
document.getElementById('rpHtml').onclick = function(){ window.location = repUrl('html'); };
document.getElementById('rpCsv').onclick  = function(){ window.location = repUrl('csv'); };
document.getElementById('rpTxt').onclick  = function(){ window.location = repUrl('txt'); };

function loadCards(){
  api('/api/cards').then(function(j){
    var t = document.getElementById('cTab');
    var h = '<tr><th>ID</th><th>UID</th><th>Имя</th><th>Роль</th><th></th></tr>';
    for (var i = 0; i < j.cards.length; i++) { var c = j.cards[i];
      h += '<tr><td>' + c.id + '</td><td>' + esc(c.uid) + '</td><td>' + esc(c.name) +
        '</td><td>' + (c.admin ? '<span class="badge b-wr">админ</span>' : '<span class="badge b-in">гость</span>') +
        '</td><td><button class="btn red" style="margin:0;padding:3px 10px" data-u="' + esc(c.uid) + '">удалить</button></td></tr>'; }
    t.innerHTML = h;
    var btns = t.querySelectorAll('button');
    for (var k = 0; k < btns.length; k++) btns[k].onclick = function(){
      var u = this.getAttribute('data-u');
      api('/api/cards?uid=' + encodeURIComponent(u), 'DELETE').then(loadCards);
    };
  });
}
document.getElementById('regBtn').onclick = function(){
  api('/api/cards/reg', 'POST', {}).then(function(){ refresh(); });
};
document.getElementById('cAdd').onclick = function(){
  api('/api/cards', 'POST', {uid: document.getElementById('cUid').value.trim().toUpperCase(),
    name: document.getElementById('cName').value.trim()}).then(function(j){
    if (j.ok) { document.getElementById('cUid').value=''; document.getElementById('cName').value=''; loadCards(); }
    else alert(j.error || 'Ошибка');
  });
};
document.getElementById('sSave').onclick = function(){
  var s = [];
  for (var p = 0; p < 3; p++) s.push([t2m(document.getElementById('s'+p+'a').value),
                                      t2m(document.getElementById('s'+p+'b').value)]);
  api('/api/schedule', 'POST', {s: s, day: t2m(document.getElementById('sDay').value)})
    .then(function(j){ alert(j.ok ? 'Расписание сохранено' : (j.error || 'Ошибка')); refresh(); });
};
document.getElementById('wSave').onclick = function(){
  api('/api/wifi', 'POST', {ssid: document.getElementById('wSsid').value.trim(),
    pass: document.getElementById('wPass').value}).then(function(j){
    alert(j.ok ? 'Сохранено. Идёт переподключение к новой сети...' : 'Ошибка'); });
};
document.getElementById('nSave').onclick = function(){
  api('/api/net', 'POST', {peer: document.getElementById('nPeer').value.trim(),
    tz: parseInt(document.getElementById('nTz').value, 10),
    terminal: parseInt(document.getElementById('nTerm').value, 10),
    invert: parseInt(document.getElementById('nLaser').value, 10)}).then(function(j){
    alert(j.ok ? 'Параметры сохранены' : 'Ошибка'); refresh(); });
};
document.getElementById('gSave').onclick = function(){
  api('/api/tg', 'POST', {token: document.getElementById('gTok').value.trim(),
    chat: document.getElementById('gChat').value.trim()}).then(function(j){
    alert(j.ok ? 'Telegram сохранён' : 'Ошибка'); });
};
document.getElementById('gTest').onclick = function(){
  api('/api/tg/test', 'POST', {}).then(function(j){
    alert(j.ok ? 'Отправлено' : ('Не отправлено: ' + (j.error || 'проверьте токен и chat id'))); });
};
document.getElementById('mSave').onclick = function(){
  api('/api/mail', 'POST', {key: document.getElementById('mKey').value.trim(),
    to: document.getElementById('mTo').value.trim(),
    from: document.getElementById('mFrom').value.trim()}).then(function(j){
    alert(j.ok ? 'Почта сохранена' : 'Ошибка'); });
};
document.getElementById('pSave').onclick = function(){
  api('/api/pass', 'POST', {old: document.getElementById('pOld').value,
    pass: document.getElementById('pNew').value}).then(function(j){
    document.getElementById('pMsg').textContent = j.ok ? 'Пароль изменён' : ('Ошибка: ' + (j.error||''));
  });
};
document.getElementById('reboot').onclick = function(){
  if (confirm('Перезагрузить терминал?')) api('/api/reboot', 'POST', {});
};
refresh();
</script></body></html>
)talonwebui";

// ---------- хелперы HTTP ----------
bool authed() {
  if (!g_token.length()) return false;
  if ((int32_t)(millis() - g_tokenExp) >= 0) { g_token = ""; return false; }
  if (!server.hasHeader("Cookie")) return false;
  return server.header("Cookie").indexOf("sid=" + g_token) >= 0;
}
void sendJ(JsonDocument& doc, int code = 200) {
  String s; serializeJson(doc, s);
  server.send(code, "application/json", s);
}
bool needAuth() {                 // true = доступ запрещён (ответ уже отправлен)
  if (authed()) return false;
  JsonDocument d; d["error"] = "unauthorized";
  sendJ(d, 401);
  return true;
}
String randToken() {
  static const char* hex = "0123456789abcdef";
  String s;
  for (int i = 0; i < 24; i++) s += hex[random(16)];
  return s;
}

void setupWeb() {
  const char* hdrs[] = { "Cookie", "X-Peer-Key" };
  server.collectHeaders(hdrs, 2);

  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", WEBUI); });

  server.on("/api/login", HTTP_POST, []() {
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    String pass = in["pass"] | "";
    JsonDocument out;
    if (pass.length() && pass == g_adminPass) {
      g_token = randToken();
      g_tokenExp = millis() + SESSION_MS;
      server.sendHeader("Set-Cookie", "sid=" + g_token + "; Path=/; HttpOnly");
      out["ok"] = true;
      logEvent("SYS_LOGIN_OK", "", 0, "", -1);
    } else {
      out["ok"] = false;
      logEvent("SYS_LOGIN_BAD", "", 0, "", -1);
    }
    sendJ(out);
  });
  server.on("/api/logout", HTTP_POST, []() {
    g_token = "";
    JsonDocument out; out["ok"] = true; sendJ(out);
  });

  server.on("/api/status", HTTP_GET, []() {
    if (needAuth()) return;
    JsonDocument j;
    j["v"] = FW_VERSION;
    j["place"] = PLACE_NAMES[g_terminal ? 1 : 0];
    j["terminal"] = g_terminal;
    j["time"] = g_now ? (dateStrOf(g_now) + " " + timeStrOf(g_now)) : "";
    j["wifiMode"] = g_net == NET_STA_ON ? "STA" : (g_net == NET_AP ? "AP" : "CONNECTING");
    j["ssid"] = g_ssid;
    j["ip"] = (g_net == NET_STA_ON) ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    j["rssi"] = (int32_t)WiFi.RSSI();
    j["laser"] = laserName();
    j["regLeft"] = g_regUntil ? max(0, (int32_t)(g_regUntil - millis()) / 1000) : 0;
    int p = g_now ? periodOf(g_now) : -1;
    j["periodName"] = (p >= 0) ? String(PERIOD_NAMES[p]) + " " + minToStr(g_sched[p][0]) +
                                   "-" + minToStr(g_sched[p][1]) : "";
    JsonObject td = j["today"].to<JsonObject>();
    td["visits"] = g_tVisits; td["guests"] = g_todayIds.size();
    td["denied"] = g_tDenied; td["breach"] = g_tBreach;
    JsonArray sc = j["sched"].to<JsonArray>();
    for (int k = 0; k < 3; k++) {
      JsonArray r = sc.add<JsonArray>();
      r.add(g_sched[k][0]); r.add(g_sched[k][1]);
    }
    j["dayReport"] = g_dayReportMin;
    j["tz"] = g_tzMin;
    j["laserInvert"] = g_laserInvert ? 1 : 0;
    j["peerIp"] = g_peerIp;
    j["peerSeen"] = g_peerSeen ? 1 : 0;
    j["heap"] = String(ESP.getFreeHeap() / 1024) + " КБ";
    uint32_t up = millis() / 1000;
    char ub[16]; snprintf(ub, sizeof(ub), "%02u:%02u:%02u",
                          (unsigned)(up / 3600), (unsigned)((up / 60) % 60), (unsigned)(up % 60));
    j["uptime"] = ub;
    sendJ(j);
  });

  server.on("/api/log", HTTP_GET, []() {
    if (needAuth()) return;
    String date = server.arg("date");
    if (date.length() < 10) date = g_dateStr;
    JsonDocument out;
    JsonArray rows = out["rows"].to<JsonArray>();
    File f = LittleFS.open("/log/" + date + ".jsonl", "r");
    if (f) {
      while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() < 4) continue;
        JsonDocument d;
        if (deserializeJson(d, line)) continue;
        JsonObject r = rows.add<JsonObject>();
        uint32_t ts = d["ts"] | 0;
        r["tm"] = ts ? timeStrOf(ts) : "";
        r["id"] = d["id"] | 0;
        r["uid"] = d["uid"] | "";
        r["name"] = d["name"] | "";
        r["period"] = d["period"] | "";
        r["event"] = d["event"] | "";
      }
      f.close();
    }
    sendJ(out);
  });

  server.on("/api/report", HTTP_GET, []() {
    if (needAuth()) return;
    String fmt = server.arg("fmt");
    String out = buildReport(server.arg("from"), server.arg("to"), fmt);
    String ct = "text/plain; charset=utf-8";
    String ext = "txt";
    if (fmt == "html") { ct = "text/html; charset=utf-8"; ext = "html"; }
    if (fmt == "csv")  { ct = "text/csv; charset=utf-8";  ext = "csv"; }
    server.sendHeader("Content-Disposition",
                      "attachment; filename=talon32_report." + ext);
    server.send(200, ct, out);
  });

  server.on("/api/schedule", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; JsonDocument out;
    if (deserializeJson(in, server.arg("plain"))) { out["ok"]=false; out["error"]="json"; sendJ(out); return; }
    JsonArray s = in["s"];
    if (s.size() != 3) { out["ok"]=false; out["error"]="нужно 3 периода"; sendJ(out); return; }
    uint16_t tmp[3][2];
    for (int p = 0; p < 3; p++) {
      long a = s[p][0] | -1; long b = s[p][1] | -1;
      if (a < 0 || b < 0 || a > 1439 || b > 1439 || b <= a) {
        out["ok"] = false; out["error"] = "период " + String(p+1) + ": время указано неверно";
        sendJ(out); return;
      }
      tmp[p][0] = (uint16_t)a; tmp[p][1] = (uint16_t)b;
    }
    for (int p = 0; p < 3; p++) { g_sched[p][0] = tmp[p][0]; g_sched[p][1] = tmp[p][1]; }
    long day = in["day"] | -1;
    if (day >= 0 && day <= 1439) { g_dayReportMin = (uint16_t)day; prefs.putUShort("dayrep", g_dayReportMin); }
    saveSched();
    out["ok"] = true;
    sendJ(out);
    lcdShow("РАСПИСАНИЕ", "ОБНОВЛЕНО", 3000);
  });

  server.on("/api/wifi", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    String ssid = in["ssid"] | "";
    String pass = in["pass"] | "";
    JsonDocument out;
    if (!ssid.length()) { out["ok"] = false; out["error"] = "SSID пуст"; sendJ(out); return; }
    g_ssid = ssid;
    prefs.putString("ssid", g_ssid);
    if (pass.length()) {            // пустое поле = «пароль не менять»
      g_pass = pass;
      prefs.putString("pass", g_pass);
    }
    out["ok"] = true;
    sendJ(out);
    g_netRestartAt = millis() + 900;          // ответ успеет уйти, затем реконнект
  });

  server.on("/api/net", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    JsonDocument out;
    if (!in["peer"].isNull()) { g_peerIp = String(in["peer"] | ""); prefs.putString("peerip", g_peerIp); }
    if (!in["tz"].isNull()) { g_tzMin = in["tz"] | 180; prefs.putInt("tz", g_tzMin); }
    if (!in["terminal"].isNull()) {
      g_terminal = (in["terminal"] | 0) ? 1 : 0;
      prefs.putUChar("terminal", g_terminal);
    }
    if (!in["invert"].isNull()) {
      g_laserInvert = (in["invert"] | 0) != 0;
      prefs.putUChar("laserinv", g_laserInvert ? 1 : 0);
    }
    out["ok"] = true;
    sendJ(out);
  });

  server.on("/api/tg", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    g_tgToken = in["token"] | "";
    g_tgChat = in["chat"] | "";
    prefs.putString("tgtoken", g_tgToken);
    prefs.putString("tgchat", g_tgChat);
    g_tgOffset = 0;
    JsonDocument out; out["ok"] = true; sendJ(out);
  });
  server.on("/api/tg/test", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument out;
    bool ok = tgSend(String(DEVICE_NAME) + " v" + FW_VERSION + " · тестовое сообщение. Терминал: " +
                     PLACE_NAMES[g_terminal ? 1 : 0]);
    out["ok"] = ok;
    if (!ok) out["error"] = "нет связи с Telegram";
    sendJ(out);
  });

  server.on("/api/mail", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    g_smtpKey = in["key"] | "";
    g_emailTo = in["to"] | "";
    g_senderEmail = in["from"] | "talon32@notify.local";
    prefs.putString("smtpkey", g_smtpKey);
    prefs.putString("mailto", g_emailTo);
    prefs.putString("sender", g_senderEmail);
    JsonDocument out; out["ok"] = true; sendJ(out);
  });

  server.on("/api/pass", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    JsonDocument out;
    String oldP = in["old"] | "";
    String newP = in["pass"] | "";
    if (oldP != g_adminPass) { out["ok"]=false; out["error"]="старый пароль неверен"; sendJ(out); return; }
    if (newP.length() < 4)   { out["ok"]=false; out["error"]="минимум 4 символа"; sendJ(out); return; }
    g_adminPass = newP;
    prefs.putString("adminpass", g_adminPass);
    out["ok"] = true; sendJ(out);
  });

  server.on("/api/cards", HTTP_GET, []() {
    if (needAuth()) return;
    JsonDocument out;
    JsonArray arr = out["cards"].to<JsonArray>();
    for (size_t i = 0; i < g_cards.size(); i++) {
      JsonObject o = arr.add<JsonObject>();
      o["uid"] = g_cards[i].uid; o["id"] = g_cards[i].id;
      o["name"] = g_cards[i].name; o["admin"] = g_cards[i].admin ? 1 : 0;
    }
    sendJ(out);
  });
  server.on("/api/cards", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument in; deserializeJson(in, server.arg("plain"));
    JsonDocument out;
    String uid = String(in["uid"] | ""); uid.toUpperCase();
    String name = in["name"] | "";
    if (uid.length() != 8 && uid.length() != 14 && uid.length() != 20) {
      out["ok"]=false; out["error"]="UID: 8/14/20 HEX-символов"; sendJ(out); return; }
    if (findCard(uid)) { out["ok"]=false; out["error"]="карта уже в базе"; sendJ(out); return; }
    CardRec c; c.uid = uid; c.name = name.length() ? name : String("Гость"); c.admin = false;
    c.id = issueNextId();
    g_cards.push_back(c); saveCards();
    out["ok"] = true; out["id"] = c.id;
    sendJ(out);
    logEvent("CARD_REG", uid, c.id, c.name, -1);
  });
  server.on("/api/cards", HTTP_DELETE, []() {
    if (needAuth()) return;
    String uid = server.arg("uid");
    JsonDocument out;
    for (size_t i = 0; i < g_cards.size(); i++) {
      if (g_cards[i].uid == uid) { g_cards.erase(g_cards.begin() + i); saveCards(); break; }
    }
    out["ok"] = true; sendJ(out);
  });
  server.on("/api/cards/reg", HTTP_POST, []() {
    if (needAuth()) return;
    enterRegMode();
    JsonDocument out; out["ok"] = true; sendJ(out);
  });

  server.on("/api/reboot", HTTP_POST, []() {
    if (needAuth()) return;
    JsonDocument out; out["ok"] = true; sendJ(out);
    g_rebootAt = millis() + 800;
  });

  // Межтерминальная сверка: ключ вместо сессии
  server.on("/api/check", HTTP_GET, []() {
    if (server.header("X-Peer-Key") != g_peerKey) {
      JsonDocument d; d["visited"] = false; d["error"] = "bad key";
      sendJ(d, 403); return;
    }
    String uid = server.arg("uid");
    String date = server.arg("date");
    int p = server.arg("period").toInt();
    bool found = false;
    if (date == g_dateStr) found = localVisited(uid, p);
    if (!found) {
      File f = LittleFS.open("/log/" + date + ".jsonl", "r");
      if (f) {
        while (f.available() && !found) {
          String line = f.readStringUntil('\n');
          if (line.indexOf("\"uid\":\"" + uid + "\"") < 0) continue;
          if (line.indexOf("\"event\":\"VISIT\"") < 0) continue;
          JsonDocument d;
          if (deserializeJson(d, line)) continue;
          String pn = d["period"] | "";
          int pi = (pn == "ЗАВТРАК") ? 0 : (pn == "ОБЕД") ? 1 : 2;
          if (pi == p) found = true;
        }
        f.close();
      }
    }
    JsonDocument out;
    out["visited"] = found;
    sendJ(out);
  });

  server.onNotFound([]() {
    String u = server.uri();
    if (u.startsWith("/api/")) {
      JsonDocument d; d["error"] = "not found"; sendJ(d, 404);
    } else {
      server.send_P(200, "text/html", WEBUI);
    }
  });

  server.begin();
}

// ========================= SETUP =============================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_AMBER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LASER_TX, OUTPUT);
  pinMode(PIN_LASER_RX, INPUT);
  pinMode(PIN_BTN_REG, INPUT_PULLUP);
  digitalWrite(PIN_LASER_TX, HIGH);      // излучатель работает постоянно
  randomSeed((uint32_t)((micros() * 2654435761u) ^
                        (uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFFu)));

  loadSettings();
  LittleFS.begin(true);
  LittleFS.mkdir("/log");

  // калибровка лазерного рубежа ПОСЛЕ загрузки настроек (учитывает инверсию)
  g_beamRawPrev = beamBlocked();
  g_beamStable = g_beamRawPrev;
  g_beamChg = millis();

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("ТАЛОН-32 v"); lcd.print(FW_VERSION);
  lcd.setCursor(0, 1); lcd.print("ЗАПУСК...");

  // Удержание кнопки при старте = смена зала (СТОЛОВАЯ <-> РЕСТОРАН)
  uint32_t bt0 = millis();
  bool held = true;
  while ((uint32_t)(millis() - bt0) < 1500) {
    if (digitalRead(PIN_BTN_REG) != LOW) { held = false; break; }
    delay(20);
  }
  if (held) {
    g_terminal = g_terminal ? 0 : 1;
    prefs.putUChar("terminal", g_terminal);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("ЗАЛ ИЗМЕНЁН:");
    lcd.setCursor(0, 1); lcd.print(PLACE_NAMES[g_terminal ? 1 : 0]);
    delay(1800);
  }

  // RTC DS3231
  if (rtc.begin()) {
    DateTime n = rtc.now();
    g_rtcOk = !rtc.lostPower() && n.year() >= 2024;
  } else {
    g_rtcOk = false;
  }

  // RC522 — SPI ЯВНО на пинах 18/19/23 (требование Core 3.x)
  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);
  rfid.PCD_Init();
  byte ver = rfid.PCD_ReadRegister(rfid.VersionReg);
  bool rfidOk = (ver != 0x00 && ver != 0xFF);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("САМОТЕСТ");
  lcd.setCursor(0, 1);
  lcd.print("RTC:"); lcd.print(g_rtcOk ? "OK" : "НЕТ");
  lcd.print(" RFID:"); lcd.print(rfidOk ? "OK" : "НЕТ");
  delay(1500);

  loadCards();
  if (g_now == 0) g_now = nowLocal();
  if (g_now) { g_dateStr = dateStrOf(g_now); g_minuteOfDay = -1; }
  rebuildTodayCache();

  if (g_ssid.length()) startSTA(); else startAP();
  setupWeb();
  beep(BEEP_BOOT, 5);
  lcdShow("ГОТОВ К РАБОТЕ", PLACE_NAMES[g_terminal ? 1 : 0], 3500);
  logEvent("SYS_BOOT", "", 0, String("v") + FW_VERSION, -1);
}

// ========================== LOOP =============================
void loop() {
  server.handleClient();
  wifiTick();
  sntpTick();
  timeTick();
  lcdTick();
  beeper.tick();
  lampsTick();
  laserTick();
  rfidTick();
  buttonTick();
  regTick();
  tgTick();

  if (g_rebootAt && (int32_t)(millis() - g_rebootAt) >= 0) {
    ESP.restart();
  }
}
`;
