import { useMemo, useRef, useState } from "react";
import { FIRMWARE_CODE, FIRMWARE_FILE, FIRMWARE_VERSION } from "../data/firmware";
import { FIXES } from "../data/site";
import { SectionHead, Reveal, Kicker } from "../ui";
import { copyText, downloadText, type DownloadResult } from "../utils/download";

const KEYWORDS =
  /\b(void|bool|int|uint8_t|uint16_t|uint32_t|int8_t|int32_t|long|char|byte|float|String|const|static|struct|if|else|for|while|return|true|false|size_t|enum|case|switch|break|continue|class|new|delete|this|unsigned)\b/g;

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** лёгкая подсветка C++: комментарии, строки, препроцессор, ключевые слова */
function highlightLine(raw: string, inBlock: { v: boolean }): string {
  let line = raw;
  if (inBlock.v) {
    const end = line.indexOf("*/");
    if (end >= 0) {
      inBlock.v = false;
      return `<span class="text-[#5d7d68]">${escHtml(line.slice(0, end + 2))}</span>` + highlightLine(line.slice(end + 2), inBlock);
    }
    return `<span class="text-[#5d7d68]">${escHtml(line)}</span>`;
  }
  const bstart = line.indexOf("/*");
  if (bstart >= 0 && line.indexOf("*/", bstart) < 0) {
    inBlock.v = true;
    return highlightLine(line.slice(0, bstart), { v: false }) + `<span class="text-[#5d7d68]">${escHtml(line.slice(bstart))}</span>`;
  }
  // строки и // — один проход
  let out = "";
  let i = 0;
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out += escHtml(buf).replace(KEYWORDS, `<span class="text-[#7fc4e8]">$1</span>`);
    buf = "";
  };
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      flush();
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== "\\")) j++;
      out += `<span class="text-[#e8c07f]">${escHtml(line.slice(i, Math.min(j + 1, line.length)))}</span>`;
      i = j + 1;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") {
      flush();
      out += `<span class="text-[#5d7d68]">${escHtml(line.slice(i))}</span>`;
      return out;
    }
    buf += c;
    i++;
  }
  flush();
  if (/^\s*#/.test(line)) {
    return `<span class="text-[#c792ea99]">${out}</span>`;
  }
  return out;
}

function CodeView() {
  const lines = useMemo(() => FIRMWARE_CODE.replace(/^\n/, "").split("\n"), []);
  const state = useRef({ v: false });
  const html = useMemo(() => {
    state.current.v = false;
    return lines.map((l) => highlightLine(l, state.current));
  }, [lines]);

  return (
    <div className="code-scroll max-h-[74vh] overflow-auto border border-line bg-[#0a0f14]">
      <table className="w-full border-collapse font-mono text-[11.5px] leading-[1.55]">
        <tbody>
          {html.map((h, i) => (
            <tr key={i} className="hover:bg-[#101a23]">
              <td className="w-12 select-none border-r border-line/70 px-3 text-right align-top text-fog/35">{i + 1}</td>
              <td className="whitespace-pre px-4 text-[#c8d6e2]" dangerouslySetInnerHTML={{ __html: h || " " }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Скачивание прошивки с защитой от «тихой» блокировки: если страница
// открыта в окне-превью (iframe), браузер молча не сохраняет файл —
// тогда утилита дополнительно копирует код в буфер и возвращает "copied",
// чтобы интерфейс честно сказал пользователю, что произошло.
export function useDownloadFirmware() {
  return () => downloadText(FIRMWARE_FILE, FIRMWARE_CODE, "text/plain;charset=utf-8");
}

export default function FirmwareSection() {
  const download = useDownloadFirmware();
  const [copied, setCopied] = useState(false);
  const [dlState, setDlState] = useState<DownloadResult | "">("");
  const lineCount = useMemo(() => FIRMWARE_CODE.split("\n").length, []);
  const kb = useMemo(() => Math.round(new Blob([FIRMWARE_CODE]).size / 1024), []);

  async function onDownload() {
    const r = await download();
    if (r === "cancelled") return;        // пользователь отменил диалог «Сохранить как»
    setDlState(r);
    setTimeout(() => setDlState(""), 6000);
  }

  async function copy() {
    await copyText(FIRMWARE_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const dlLabel =
    dlState === "saved" ? "✓ Файл сохранён"
    : dlState === "started" ? "✓ Скачивание запущено"
    : dlState === "copied" ? "⧉ Скопировано (см. ниже)"
    : "↓ Скачать .ino";

  return (
    <section id="firmware" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHead
        index="03"
        kicker="Прошивка · Arduino Core 3.x"
        title={<>Talon32.ino — берите и прошивайте</>}
        lead="Полный исходник одним файлом: без «допиливания», заглушек и псевдокода. Проверен по чек-листу независимого аудита — ниже. Совместимость с Core 3.x обеспечена явной инициализацией шин и API ArduinoJson v7."
      />

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        {/* sticky-колонка */}
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Reveal dir="left">
            <div className="border border-phos/50 bg-panel p-5" style={{ boxShadow: "0 0 40px rgba(76,224,143,0.07)" }}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-snow">{FIRMWARE_FILE}</span>
                <span className="border border-phos/50 px-2 py-0.5 font-mono text-[10px] text-phos">v{FIRMWARE_VERSION}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { k: "строк", v: String(lineCount) },
                  { k: "размер", v: kb + " КБ" },
                  { k: "язык", v: "C++" },
                ].map((s) => (
                  <div key={s.k} className="border border-line bg-panel2 py-2">
                    <div className="font-mono text-sm font-bold text-snow">{s.v}</div>
                    <div className="text-[9px] uppercase tracking-widest text-fog">{s.k}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={onDownload}
                className={`btn-phos mt-4 w-full border py-3 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                  dlState ? "border-ice bg-[#12283a] text-ice" : "border-phos bg-[#123524] text-phos"
                }`}
              >
                {dlLabel}
              </button>
              <button
                onClick={copy}
                className="btn-phos mt-2 w-full border border-line2 py-3 font-mono text-xs font-bold uppercase tracking-widest text-snow hover:border-fog"
              >
                {copied ? "✓ Скопировано" : "Копировать в буфер"}
              </button>
              {dlState === "copied" && (
                <p className="mt-2 border border-ice/40 bg-ice/[0.07] px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-ice">
                  Страница открыта в окне-превью — браузер заблокировал сохранение файла.
                  Код уже в буфере обмена: в Arduino IDE создайте новый скетч (Ctrl+N),
                  вставьте (Ctrl+V) и сохраните как Talon32.ino. Либо откройте сайт в обычной
                  вкладке — там кнопка скачает файл напрямую.
                </p>
              )}
              {dlState === "saved" && (
                <p className="mt-2 border border-phos/40 bg-phos/[0.06] px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-phos">
                  Файл сохранён через системный диалог «Сохранить как». Откройте его в Arduino IDE.
                </p>
              )}
              <p className="mt-3 border border-amber/35 bg-amber/[0.06] px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-amber/90">
                Контроль чистоты артефакта: перед скачиванием из текста автоматически вырезаются
                обратные кавычки и служебные символы JS-шаблона — в Arduino IDE попадает только
                валидный C++. Для прошивки берите файл, скачанный этой кнопкой.
              </p>
            </div>
          </Reveal>

          <Reveal dir="left" delay={80}>
            <div className="border border-line bg-panel p-5">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-snow">Библиотеки (4 шт)</h3>
              <ul className="mt-3 space-y-2.5 text-[12.5px]">
                {[
                  ["MFRC522", "miguelbalboa · RFID-считыватель"],
                  ["hd44780", "Bill Perry · LCD1602 (I2C, авто-адрес)"],
                  ["RTClib", "Adafruit · DS3231"],
                  ["ArduinoJson", "B. Blanchon · v7"],
                ].map(([n, d]) => (
                  <li key={n} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                    <span className="font-mono text-[12px] font-bold text-ice">{n}</span>
                    <span className="text-right text-[11px] text-fog">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal dir="left" delay={140}>
            <div className="border border-line bg-panel p-5">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-snow">Совместимость Core 3.x</h3>
              <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-fog">
                <li><span className="text-phos">▪</span> SPI.begin(18, 19, 23) — явно: в 3.x сменились пины шины по умолчанию</li>
                <li><span className="text-phos">▪</span> Wire.begin(21, 22) — явно для LCD и DS3231</li>
                <li><span className="text-phos">▪</span> ETH.begin(ETH_PHY_W5500, …, SPI2_HOST, 17, 12, 16) — W5500 на HSPI, встроенная библиотека ETH</li>
                <li><span className="text-phos">▪</span> hd44780_I2Cexp: lcd.begin(16, 2) со статусом — lcd.init() из LiquidCrystal_I2C здесь не существует</li>
                <li><span className="text-phos">▪</span> LittleFS вместо SPIFFS (журнал по дням)</li>
                <li><span className="text-phos">▪</span> JsonDocument без размера — API ArduinoJson v7</li>
                <li><span className="text-phos">▪</span> без tone()/ledc — активный buzzer через планировщик</li>
                <li><span className="text-phos">▪</span> без max()/min() — regLeft и экспонента повтора AP на явных сравнениях</li>
              </ul>
            </div>
          </Reveal>

          <Reveal dir="left" delay={200}>
            <div className="border border-line bg-panel p-5">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-snow">Внутри прошивки</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Ethernet W5500 + фолбэк", "Web-панель (пароль)", "WPA2-точка Talon32-Setup", "DHCP / статический IP", "SNTP + DS3231", "HTTP-сверка залов", "Telegram getUpdates", "SMTP2GO e-mail", "JSONL-журнал", "отчёты HTML/CSV/TXT", "режим регистрации 30 с", "антиповтор 3 с"].map((t) => (
                  <span key={t} className="border border-line px-2 py-1 font-mono text-[10px] text-fog">{t}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* код */}
        <Reveal dir="right">
          <div>
            <div className="flex items-center justify-between border border-b-0 border-line bg-panel2 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-alarm/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-phos/70" />
                <span className="ml-3 font-mono text-xs text-fog">Talon32.ino — Arduino IDE 2.x · Плата: ESP32 Dev Module</span>
              </div>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-fog sm:block">скролл ↓</span>
            </div>
            <CodeView />
          </div>
        </Reveal>
      </div>

      {/* ======= Работа над ошибками ======= */}
      <div id="fixes" className="mt-24">
        <SectionHead
          index="03.1"
          kicker="Работа над ошибками"
          tone="alarm"
          title={<>Одиннадцать дефектов прошлых версий — закрыты</>}
          lead="Каждое замечание из ревизии превращено в конкретное решение в коде — включая новые: Ethernet-контур, «стирающиеся» поля ввода, regLeft без max(), пароль точки доступа и независимость от сборки библиотеки MFRC522. Ниже — «было / стало» по пунктам; те же комментарии вшиты прямо в прошивку."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {FIXES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 2) * 90}>
              <div className="card-lift flex h-full flex-col border border-line bg-panel p-5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-alarm">✕→✓</span>
                  <h3 className="font-display text-[15px] font-bold leading-snug text-snow">{f.title}</h3>
                </div>
                <div className="mt-3 border-l-2 border-alarm/60 bg-alarm/[0.06] px-3 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-alarm">Было</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fog">{f.problem}</p>
                </div>
                <div className="mt-2 border-l-2 border-phos/60 bg-phos/[0.05] px-3 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-phos">Стало</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fog">{f.solution}</p>
                </div>
                <div className="mt-4 grid gap-2 font-mono text-[11px] leading-relaxed">
                  <div className="overflow-x-auto whitespace-pre border border-alarm/30 bg-[#170d0f] px-3 py-2 text-alarm/90">{f.before}</div>
                  <div className="overflow-x-auto whitespace-pre border border-phos/30 bg-[#0d1710] px-3 py-2 text-phos/90">{f.after}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120} className="mt-8">
          <div className="flex flex-wrap items-center gap-4 border border-line bg-panel2/60 px-5 py-4">
            <Kicker tone="amber">дополнительно в v1.7 · rev W5500</Kicker>
            <p className="max-w-3xl text-[13px] leading-relaxed text-fog">
              LCD перерисовывается только при смене контента (без мерцания), Wi-Fi-переподключение с экспоненциальным
              интервалом до 5 минут, пароль сети не затирается пустым полем, лазер калибруется при старте,
              суточный отчёт уходит строго один раз в сутки. В сборке rev W5500: драйвер LCD hd44780 (адрес определяется
              автоматически, битый экран не вешает шину), точка доступа под WPA2-паролем из админ-панели,
              функции initEthernet()/checkEthernet()/getLocalIP(), режимы «Авто / Wi-Fi / Ethernet» с сохранением в NVS,
              фолбэк Ethernet → Wi-Fi → точка и валидация статических IP-адресов.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
