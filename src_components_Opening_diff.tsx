--- src/components/Opening.tsx (原始)


+++ src/components/Opening.tsx (修改后)
import { useEffect, useMemo, useRef, useState } from "react";
import { SCHEDULE } from "../data/site";
import { useScramble, usePRM, Kicker } from "../ui";

type Verdict = "idle" | "green" | "red" | "amber";
interface DemoLogRow { time: string; text: string; kind: "ok" | "bad" | "warn" | "info"; }

function nowHM() {
  const d = new Date();
  return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
}
function pad2(x: number) { return x < 10 ? "0" + x : "" + x; }

export default function Opening({ onDownload }: { onDownload: () => void }) {
  const prm = usePRM();
  const title = useScramble("ТАЛОН-32");
  const [clock, setClock] = useState(nowHM());
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [lcd, setLcd] = useState<{ a: string; b: string; ovr: boolean }>({ a: "", b: "", ovr: false });
  const [screen, setScreen] = useState(0);
  const [laser, setLaser] = useState<"armed" | "grace" | "alarm">("armed");
  const [graceLeft, setGraceLeft] = useState(0);
  const [log, setLog] = useState<DemoLogRow[]>([]);
  const [tapping, setTapping] = useState(false);
  const [counter, setCounter] = useState(0);
  const visited = useRef<Set<string>>(new Set());
  const ovrTimer = useRef<number | null>(null);
  const verdictTimer = useRef<number | null>(null);

  const period = useMemo(() => {
    const m = clock.h * 60 + clock.m;
    const idx = SCHEDULE.findIndex((p) => m >= p.fromMin && m < p.toMin);
    return idx >= 0 ? SCHEDULE[idx] : null;
  }, [clock.h, clock.m]);

  // часы
  useEffect(() => {
    const t = window.setInterval(() => setClock(nowHM()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ротация экранов LCD (как в прошивке: 4 экрана по 4 с)
  useEffect(() => {
    const t = window.setInterval(() => setScreen((s) => (s + 1) % 4), 4000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const { h, m, s } = clock;
    const t = pad2(h) + ":" + pad2(m) + ":" + pad2(s);
    const d = new Date();
    const date = pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear();
    let a = "", b = "";
    switch (screen) {
      case 0: a = date; b = t + " STA:OK"; break;
      case 1: a = "IP:192.168.1.77"; b = "NET:Hotel_Guest"; break;
      case 2:
        a = period ? period.name.toUpperCase().slice(0, 7) + " " + period.from : "ВНЕ ПЕРИОДА";
        b = "СЕГОДНЯ:" + log.filter((l) => l.kind === "ok").length + "Г";
        break;
      default: a = "ЗАЛ:СТОЛОВАЯ"; b = "ЛУЧ:" + (laser === "armed" ? "ОХРАНА" : laser === "grace" ? "ПРОХОД " + graceLeft + "С" : "ТРЕВОГА");
    }
    setLcd((prev) => (prev.ovr ? prev : { a: a.slice(0, 16), b: b.slice(0, 16), ovr: false }));
  }, [screen, clock, laser, graceLeft, period, log]);

  function showLcd(a: string, b: string, ms = 3500) {
    setLcd({ a: a.slice(0, 16), b: b.slice(0, 16), ovr: true });
    if (ovrTimer.current) window.clearTimeout(ovrTimer.current);
    ovrTimer.current = window.setTimeout(() => setLcd((p) => ({ ...p, ovr: false })), ms);
  }
  function pushLog(text: string, kind: DemoLogRow["kind"]) {
    const { h, m, s } = nowHM();
    setLog((l) => [{ time: pad2(h) + ":" + pad2(m) + ":" + pad2(s), text, kind }, ...l].slice(0, 6));
  }
  function flashVerdict(v: Verdict, ms = 2600) {
    setVerdict(v);
    if (verdictTimer.current) window.clearTimeout(verdictTimer.current);
    verdictTimer.current = window.setTimeout(() => setVerdict("idle"), ms);
  }

  // обратный отсчёт снятия луча (20 с, как в прошивке)
  useEffect(() => {
    if (laser !== "grace") return;
    if (graceLeft <= 0) {
      setLaser("armed");
      pushLog("Луч снова на охране (20 с истекли)", "info");
      return;
    }
    const t = window.setTimeout(() => setGraceLeft((g) => g - 1), 1000);
    return () => window.clearTimeout(t);
  }, [laser, graceLeft]);

  function tapCard() {
    if (tapping) return;
    setTapping(true);
    window.setTimeout(() => setTapping(false), 380);

    if (!period) {
      flashVerdict("red");
      showLcd("ВНЕ РАСПИСАНИЯ", "ЗАВТРАК 08:30");
      pushLog("Отказ: вне периода посещения", "bad");
      return;
    }
    const key = period.key;
    if (visited.current.has(key)) {
      flashVerdict("red");
      showLcd("ОТКАЗ: УЖЕ БЫЛ", period.name.slice(0, 7) + " ЗАНЯТ");
      pushLog("Отказ: гость уже посещал «" + period.name + "»", "bad");
      return;
    }
    const next = counter + 1;
    setCounter(next);
    const id = next * 2; // чётные — столовая (логика прошивки v1.7)
    visited.current.add(key);
    flashVerdict("green");
    showLcd("ДОСТУП РАЗРЕШЁН", period.name.slice(0, 7) + " ID " + id);
    pushLog("ID " + id + " · " + period.name + " · посещение разрешено", "ok");
    setLaser("grace");
    setGraceLeft(20);
  }

  function crossBeam() {
    if (laser === "grace") {
      setLaser("armed");
      setGraceLeft(0);
      pushLog("Гость прошёл — рубеж снова на охране", "info");
      showLcd("ПРОХОД ОК", "ЛУЧ:ОХРАНА");
    } else if (laser === "armed") {
      setLaser("alarm");
      flashVerdict("amber", 5000);
      showLcd("НАРУШЕНИЕ ЛУЧА", "БЕЗ КАРТЫ!", 5000);
      pushLog("Нарушение: пересечение луча без карты", "warn");
      window.setTimeout(() => setLaser((l) => (l === "alarm" ? "armed" : l)), 5000);
    }
  }

  function resetDemo() {
    visited.current.clear();
    setCounter(0);
    setLog([]);
    setLaser("armed");
    setGraceLeft(0);
    flashVerdict("idle", 0);
    showLcd("ДЕМО СБРОШЕНО", "ПРИЛОЖИ КАРТУ", 2500);
  }

  const ledG = verdict === "green";
  const ledR = verdict === "red";
  const ledA = verdict === "amber" || laser === "alarm";

  return (
    <section id="terminal" className="relative mx-auto max-w-7xl px-5 pt-28 pb-16 sm:px-8 lg:pt-36">
      <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_1fr]">
        {/* ------- левая колонка: паспорт системы ------- */}
        <div>
          <Kicker>ESP32 Dev Module · RC522 · DS3231 · лазерный рубеж</Kicker>
          <h1 className="mt-6 font-display text-[42px] font-black leading-[0.98] tracking-tight text-snow sm:text-6xl lg:text-[76px]">
            <span ref={title.ref}>{title.out || "ТАЛОН-32"}</span>
            <span className="align-top font-mono text-lg font-bold text-phos sm:text-2xl lg:text-3xl"> v1.7</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fog sm:text-lg">
            Учёт посетителей <b className="text-snow">столовой и ресторана</b> отеля: RFID-валидатор на входе,
            правило «одно место за период», лазерный контроль прохода, веб-админка с паролем,
            отчёты <span className="font-mono text-phos">HTML / CSV / TXT</span>, Telegram-бот и e-mail администратору.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={onDownload}
              className="btn-phos border border-phos bg-[#123524] px-6 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-phos"
            >
              ↓ Скачать Talon32.ino
            </button>
            <a
              href="#flash"
              className="btn-phos border border-line2 px-6 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-snow hover:border-fog"
            >
              Инструкция по прошивке
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {[
              { k: "Периодов в день", v: "3" },
              { k: "Охрана луча", v: "20 c" },
              { k: "Терминалов", v: "2 зала" },
              { k: "Arduino Core", v: "3.x" },
            ].map((s) => (
              <div key={s.k} className="bg-panel px-4 py-3.5">
                <div className="font-mono text-xl font-bold text-snow">{s.v}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-fog">{s.k}</div>
              </div>
            ))}
          </div>

          {/* расписание-мини */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            {SCHEDULE.map((p) => {
              const active = period?.key === p.key;
              return (
                <span
                  key={p.key}
                  className={`border px-3 py-1.5 font-mono text-xs ${active ? "border-phos text-phos" : "border-line text-fog"}`}
                  style={active ? { boxShadow: "0 0 16px rgba(76,224,143,0.18)" } : undefined}
                >
                  {p.name}: {p.from}–{p.to} {active && "· сейчас"}
                </span>
              );
            })}
          </div>
        </div>

        {/* ------- правая колонка: живой терминал ------- */}
        <div className="relative border border-line bg-panel p-5 sm:p-6" style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`led ${ledG ? "led-on-g led-pulse" : "led-off-g"}`} />
              <span className={`led ${ledR ? "led-on-r led-pulse" : "led-off-r"}`} />
              <span className={`led ${ledA ? "led-on-a led-pulse" : "led-off-a"}`} />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog">терминал · столовая</span>
          </div>

          {/* LCD 1602 */}
          <div className={`lcd mx-auto w-full max-w-[420px] px-5 py-4 ${prm ? "" : "lcd-flicker"}`}>
            <div className="relative z-10 text-center">
              <div className="whitespace-pre text-lg font-bold tracking-[0.18em] sm:text-xl">{lcd.a.padEnd(16, " ")}</div>
              <div className="mt-1 whitespace-pre text-lg font-bold tracking-[0.18em] sm:text-xl">
                {lcd.b.padEnd(16, " ")}
                <span className={`lcd-cursor ${prm ? "hidden" : ""}`} />
              </div>
            </div>
          </div>

          {/* легенда LED */}
          <div className="mx-auto mt-3 grid max-w-[420px] grid-cols-3 gap-2 text-center font-mono text-[10px] uppercase tracking-wider text-fog">
            <div className={ledG ? "text-phos" : ""}>● вход разрешён</div>
            <div className={ledR ? "text-alarm" : ""}>● отказ</div>
            <div className={ledA ? "text-amber" : ""}>● нарушение луча</div>
          </div>

          {/* RFID + лазер */}
          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
            <button
              onClick={tapCard}
              className="group relative border border-line2 bg-panel2 px-5 py-5 text-left transition-colors hover:border-phos"
              aria-label="Приложить карту к считывателю"
            >
              <div className="flex items-center gap-4">
                <div className={`tap-card flex h-14 w-20 shrink-0 flex-col justify-between border border-ice/50 bg-[#12283a] p-2 ${tapping ? "tapping" : ""}`}>
                  <span className="h-2 w-6 bg-ice/40" />
                  <span className="font-mono text-[9px] tracking-widest text-ice/80">MIFARE 1K</span>
                  <span className="h-1.5 w-full bg-ice/20" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-snow">ПРИЛОЖИТЬ КАРТУ</div>
                  <div className="mt-1 text-xs text-fog">RFID-считыватель RC522 · клик = касание карты</div>
                </div>
              </div>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-phos transition-transform duration-300 group-hover:scale-x-100" />
            </button>
            <button
              onClick={crossBeam}
              className="border border-line2 bg-panel2 px-5 py-5 text-left transition-colors hover:border-amber"
              aria-label="Пересечь лазерный луч"
            >
              <div className="font-display text-sm font-bold text-snow">ЛУЧ / ДВЕРЬ</div>
              <div className="mt-1 text-xs text-fog">
                {laser === "armed" && "на охране — пересечь без карты"}
                {laser === "grace" && `снят: проход за ${graceLeft} с`}
                {laser === "alarm" && "ТРЕВОГА!"}
              </div>
            </button>
          </div>

          {/* лазерная линия */}
          <div className="relative mt-5 h-8 border border-line bg-[#0a0f14]">
            <div className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 border border-fog/40 bg-panel2" title="излучатель" />
            <div className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 border border-fog/40 bg-panel2" title="приёмник" />
            {laser !== "grace" && <div className={`laser-beam absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 ${prm ? "!animate-none" : ""}`} />}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-ink/80 px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-fog">
                {laser === "armed" && "рубеж на охране"}
                {laser === "grace" && `проход разрешён · ${graceLeft} с`}
                {laser === "alarm" && "пересечение без карты!"}
              </span>
            </div>
          </div>

          {/* журнал демо */}
          <div className="mt-5 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog">журнал событий (демо)</span>
            <button onClick={resetDemo} className="font-mono text-[11px] uppercase tracking-wider text-fog underline-offset-4 hover:text-snow hover:underline">
              сбросить
            </button>
          </div>
          <div className="mt-2 space-y-1.5 border border-line bg-panel2/70 p-3 font-mono text-xs">
            {log.length === 0 && <div className="text-fog/70">— событий пока нет: приложите карту —</div>}
            {log.map((r, i) => (
              <div key={r.time + i} className={`flex gap-3 ${prm ? "" : "tick-in"}`}>
                <span className="text-fog/60">{r.time}</span>
                <span className={r.kind === "ok" ? "text-phos" : r.kind === "bad" ? "text-alarm" : r.kind === "warn" ? "text-amber" : "text-ice"}>
                  {r.text}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-fog/70">
            Интерактивная модель логики прошивки: первое касание в период — зелёная лампа и снятие луча на 20 с,
            повторное в тот же период — красный со звуком, пересечение луча без карты — оранжевая тревога.
          </p>
        </div>
      </div>
    </section>
  );
}
