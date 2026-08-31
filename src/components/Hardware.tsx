import { useState } from "react";
import { SectionHead, Reveal } from "../ui";
import { PARTS, PINS } from "../data/site";

const GROUPS: Record<string, { color: string; wires: Array<{ y: number; side: "l" | "r"; bx: number; by: number; label: string }> }> = {
  SPI: {
    color: "#62c8f7",
    wires: [
      { y: 120, side: "r", bx: 700, by: 110, label: "GPIO5 · SDA" },
      { y: 150, side: "r", bx: 700, by: 132, label: "GPIO18 · SCK" },
      { y: 180, side: "r", bx: 700, by: 154, label: "GPIO23 · MOSI" },
      { y: 210, side: "r", bx: 700, by: 176, label: "GPIO19 · MISO" },
      { y: 240, side: "r", bx: 700, by: 198, label: "GPIO4 · RST" },
    ],
  },
  I2C: {
    color: "#4ce08f",
    wires: [
      { y: 120, side: "l", bx: 260, by: 118, label: "GPIO21 · SDA" },
      { y: 150, side: "l", bx: 260, by: 140, label: "GPIO22 · SCL" },
      { y: 180, side: "l", bx: 260, by: 162, label: "VIN · 5V" },
      { y: 250, side: "l", bx: 260, by: 290, label: "шина I2C → DS3231" },
    ],
  },
  Лазер: {
    color: "#ff6262",
    wires: [
      { y: 300, side: "r", bx: 700, by: 296, label: "GPIO25 · лазер S" },
      { y: 330, side: "r", bx: 700, by: 330, label: "GPIO32 · приёмник DO" },
    ],
  },
  Индикация: {
    color: "#ffb347",
    wires: [
      { y: 360, side: "r", bx: 700, by: 418, label: "GPIO26 · зелёный" },
      { y: 390, side: "r", bx: 700, by: 440, label: "GPIO27 · красный" },
      { y: 420, side: "r", bx: 700, by: 462, label: "GPIO14 · оранжевый" },
      { y: 450, side: "r", bx: 700, by: 484, label: "GPIO13 · buzzer" },
    ],
  },
  Управление: {
    color: "#8fa5b8",
    wires: [{ y: 330, side: "l", bx: 260, by: 420, label: "GPIO33 · кнопка → GND" }],
  },
  Ethernet: {
    color: "#c792ea",
    wires: [
      { y: 480, side: "l", bx: 260, by: 492, label: "GPIO15 · CS" },
      { y: 500, side: "l", bx: 260, by: 514, label: "GPIO17 · SCK" },
      { y: 520, side: "l", bx: 260, by: 536, label: "GPIO16 · MOSI" },
      { y: 540, side: "l", bx: 260, by: 558, label: "GPIO12 · MISO" },
    ],
  },
};

function Wire({ w, color, active, dim }: { w: { y: number; side: "l" | "r"; bx: number; by: number; label: string }; color: string; active: boolean; dim: boolean }) {
  const mid = w.side === "r" ? 636 : 324;
  const bx0 = w.side === "r" ? 570 : 390;
  const d = `M ${bx0} ${w.y} L ${mid} ${w.y} L ${mid} ${w.by} L ${w.bx} ${w.by}`;
  return (
    <g style={{ opacity: dim ? 0.16 : 1, transition: "opacity .25s ease" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={active ? 3.4 : 2} style={{ filter: active ? `drop-shadow(0 0 6px ${color})` : undefined, transition: "stroke-width .2s ease" }} />
      <circle cx={bx0} cy={w.y} r="4" fill={color} />
      <circle cx={w.bx} cy={w.by} r="4" fill={color} />
      {active && (
        <text x={w.side === "r" ? 578 : 382} y={w.y - 8} textAnchor={w.side === "r" ? "start" : "end"} fontSize="11" fill={color} fontFamily="JetBrains Mono, monospace">
          {w.label}
        </text>
      )}
    </g>
  );
}

function Box({ x, y, w, h, title, lines, color, active, onHover }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; color: string; active: boolean; onHover: (g: string | null) => void }) {
  return (
    <g
      onMouseEnter={() => onHover(active ? null : title)}
      style={{ cursor: "pointer" }}
      opacity={1}
    >
      <rect x={x} y={y} width={w} height={h} fill="#0f171f" stroke={active ? color : "#2a3d4e"} strokeWidth={active ? 2 : 1.2} rx="4" style={{ filter: active ? `drop-shadow(0 0 10px ${color}55)` : undefined }} />
      <text x={x + 12} y={y + 24} fontSize="13" fontWeight="700" fill={color} fontFamily="IBM Plex Sans, sans-serif">{title}</text>
      {lines.map((l, i) => (
        <text key={l} x={x + 12} y={y + 44 + i * 16} fontSize="10.5" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">{l}</text>
      ))}
    </g>
  );
}

export default function Hardware() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <section id="parts" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHead
        index="02"
        kicker="Комплектующие"
        tone="ice"
        title={<>Всё железо — на одном столе</>}
        lead="Тринадцать позиций на оба терминала, всё есть в любом магазине Arduino-модулей. Ориентировочная стоимость комплекта — 2 900–3 900 ₽. Наведите курсор на строку таблицы — схема подсветит соответствующие провода. Новое в rev W5500: модуль Ethernet на отдельной шине HSPI — существующая разводка не изменена ни на одном пине."
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        {/* таблица комплектующих */}
        <Reveal dir="left">
          <div className="border border-line bg-panel">
            <div className="grid grid-cols-[36px_1fr_76px] items-center gap-3 border-b border-line2 bg-panel2 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-fog sm:grid-cols-[36px_1fr_76px_220px]">
              <span>№</span><span>Компонент</span><span>Кол-во</span>
              <span className="hidden sm:block">Назначение</span>
            </div>
            {PARTS.map((p) => (
              <div
                key={p.n}
                className="group grid grid-cols-[36px_1fr_76px] items-center gap-3 border-b border-line/60 px-4 py-3 transition-colors last:border-0 hover:bg-panel2 sm:grid-cols-[36px_1fr_76px_220px]"
                title={p.note}
              >
                <span className="font-mono text-xs text-fog/60">{String(p.n).padStart(2, "0")}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-snow group-hover:text-phos">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-fog/80 sm:hidden">{p.purpose}</div>
                  <div className="mt-0.5 hidden text-[11px] text-fog/80 sm:block">{p.note}</div>
                </div>
                <span className="font-mono text-xs text-amber">{p.qty}</span>
                <span className="hidden text-[11.5px] leading-snug text-fog sm:block">{p.purpose}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-fog/70">
            * RC522 и W5500 питаются строго от 3,3 В — подача 5 В выводит модули из строя.<br />
            ** W5500 в момент передачи потребляет до ~130 мА: блок питания 5 В берите с запасом (2–3 А).
          </p>
        </Reveal>

        {/* схема */}
        <div id="wiring">
          <Reveal dir="right">
            <div className="border border-line bg-panel p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <h3 className="font-display text-sm font-bold text-snow">Схема подключения</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GROUPS).map(([g, v]) => (
                    <button
                      key={g}
                      onMouseEnter={() => setActive(g)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => setActive(active === g ? null : g)}
                      className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${active === g ? "" : "border-line text-fog hover:text-snow"}`}
                      style={active === g ? { borderColor: v.color, color: v.color } : undefined}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <svg viewBox="0 0 960 640" className="w-full" role="img" aria-label="Схема подключения ESP32, RC522, W5500, LCD, DS3231, лазерного рубежа и индикации">
                {/* плата */}
                <rect x="390" y="70" width="180" height="500" rx="8" fill="#121b24" stroke="#2a3d4e" strokeWidth="1.5" />
                <rect x="440" y="48" width="80" height="30" rx="3" fill="#0f171f" stroke="#2a3d4e" />
                <text x="480" y="68" textAnchor="middle" fontSize="10" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">micro-USB 5V</text>
                <text x="480" y="120" textAnchor="middle" fontSize="15" fontWeight="700" fill="#dfeaf3" fontFamily="Unbounded, sans-serif">ESP32</text>
                <text x="480" y="140" textAnchor="middle" fontSize="11" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">DevKit V1</text>
                <rect x="430" y="160" width="100" height="60" rx="4" fill="#0e161e" stroke="#1e2c39" />
                <text x="480" y="195" textAnchor="middle" fontSize="10" fill="#4ce08f" fontFamily="JetBrains Mono, monospace">ТАЛОН-32</text>
                <text x="480" y="250" textAnchor="middle" fontSize="10" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">3V3 · GND</text>
                <text x="480" y="268" textAnchor="middle" fontSize="10" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">общие шины питания</text>
                {[120, 150, 180, 210, 240, 300, 330, 360, 390, 420, 450, 480, 500, 520, 540].map((y) => (
                  <g key={"p" + y}>
                    <rect x="384" y={y - 4} width="10" height="8" fill="#223140" />
                    <rect x="566" y={y - 4} width="10" height="8" fill="#223140" />
                  </g>
                ))}

                {/* провода */}
                {Object.entries(GROUPS).map(([g, grp]) =>
                  grp.wires.map((w, i) => (
                    <Wire key={g + i} w={w} color={grp.color} active={active === g} dim={active !== null && active !== g} />
                  ))
                )}

                {/* периферия */}
                <Box x={700} y={84} w={230} h={130} title="RFID RC522" color={GROUPS.SPI.color} active={active === "SPI"} onHover={(g) => setActive(g ?? null)}
                  lines={["SDA → GPIO5   SCK → GPIO18", "MOSI → GPIO23 MISO → GPIO19", "RST → GPIO4", "3.3V + GND (не 5В!)"]} />
                <Box x={700} y={268} w={230} h={86} title="Лазерный рубеж" color={GROUPS.Лазер.color} active={active === "Лазер"} onHover={(g) => setActive(g ?? null)}
                  lines={["KY-008: S → GPIO25 (+5V, GND)", "Фотоприёмник: DO → GPIO32"]} />
                <Box x={700} y={392} w={230} h={112} title="Индикация + звук" color={GROUPS.Индикация.color} active={active === "Индикация"} onHover={(g) => setActive(g ?? null)}
                  lines={["LED зел → 26 · красн → 27", "LED оранж → 14 (через 220 Ом)", "Buzzer активный → GPIO13"]} />
                <Box x={30} y={84} w={230} h={110} title="LCD 1602 (I2C)" color={GROUPS.I2C.color} active={active === "I2C"} onHover={(g) => setActive(g ?? null)}
                  lines={["SDA → GPIO21 · SCL → GPIO22", "VCC → VIN · GND → GND", "адрес определит hd44780 сама"]} />
                <Box x={30} y={250} w={230} h={86} title="RTC DS3231" color={GROUPS.I2C.color} active={active === "I2C"} onHover={(g) => setActive(g ?? null)}
                  lines={["SDA/SCL — та же шина I2C", "VCC → 3V3 · GND + батарейка"]} />
                <Box x={30} y={392} w={230} h={66} title="Кнопка регистрации" color={GROUPS.Управление.color} active={active === "Управление"} onHover={(g) => setActive(g ?? null)}
                  lines={["GPIO33 → кнопка → GND", "режим выдачи карт 30 с"]} />
                <Box x={30} y={470} w={230} h={110} title="Ethernet W5500 (новое)" color={GROUPS.Ethernet.color} active={active === "Ethernet"} onHover={(g) => setActive(g ?? null)}
                  lines={["SCK → GPIO17 · MOSI → GPIO16", "MISO → GPIO12 · CS → GPIO15", "3.3V + GND · RJ-45 → роутер", "RST/INT не нужны (бортовой сброс)"]} />

                <text x="480" y="606" textAnchor="middle" fontSize="10.5" fill="#8fa5b8" fontFamily="JetBrains Mono, monospace">
                  LCD и DS3231 — одна шина I2C (21/22), адреса не конфликтуют
                </text>
                <text x="480" y="624" textAnchor="middle" fontSize="10.5" fill="#c792ea" fontFamily="JetBrains Mono, monospace">
                  W5500 — отдельная шина HSPI (SPI2_HOST): с VSPI-шиной RC522 (18/19/23) не пересекается
                </text>
              </svg>
            </div>
          </Reveal>

          {/* таблица пинов */}
          <Reveal dir="right" delay={120}>
            <div className="mt-6 border border-line bg-panel">
              <div className="border-b border-line2 bg-panel2 px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-fog">Паспорт GPIO</div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {PINS.map((p) => (
                  <div
                    key={p.dev}
                    className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2 transition-colors hover:bg-panel2"
                    onMouseEnter={() => setActive(p.group)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <span className="text-xs text-fog">{p.dev}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      <span className="font-mono text-xs font-bold text-snow">{p.pin}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
