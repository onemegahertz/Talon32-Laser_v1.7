import { useState } from "react";
import { SectionHead, Reveal, Kicker } from "../ui";
import { FLASH_STEPS, AUDIT, FAQ } from "../data/site";

export default function Docs() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <>
      {/* ================= ИНСТРУКЦИЯ ================= */}
      <section id="flash" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <SectionHead
          index="06"
          kicker="Запуск проекта"
          title={<>От нуля до работающего терминала<br />за 8 шагов</>}
          lead="Прошивка ставится из Arduino IDE 2.x как обычный скетч. Все настройки — Wi-Fi, расписание, Telegram, почта, зал — делаются уже после прошивки, из админ-панели."
        />
        <ol className="grid gap-4 md:grid-cols-2">
          {FLASH_STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={(i % 2) * 80}>
              <div className="card-lift group flex h-full gap-4 border border-line bg-panel p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-line2 bg-ink font-mono text-sm font-bold text-amber">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-display text-[14.5px] font-bold text-snow group-hover:text-amber">{s.t}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-fog">{s.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
        <Reveal delay={120} className="mt-6">
          <div className="border border-line bg-panel2/60 px-5 py-4 font-mono text-[12px] leading-relaxed text-fog">
            <span className="text-amber">Совет:</span> зарезервируйте за терминалами статические IP в роутере (например .77 и .78) —
            либо задайте статику прямо на терминалах (вкладка «Сеть» → Ethernet W5500). Так сверка залов и закладки
            админ-панели не «поедут» после перезагрузки роутера.
          </div>
        </Reveal>
      </section>

      {/* ================= ЭКСПЕРТИЗА ================= */}
      <section id="audit" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <SectionHead
          index="07"
          kicker="Независимая проверка"
          tone="alarm"
          title={<>Аудит кода и безопасности</>}
          lead="Финальная ревизия прошивки v1.7: порядок вердиктов, время, блокировки, доступ, валидация. Вердикты — по каждой зоне."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {AUDIT.map((a, i) => (
            <Reveal key={a.area} delay={(i % 2) * 60}>
              <div className="card-lift flex h-full items-start gap-4 border border-line bg-panel p-5">
                <span
                  className={`stamp mt-1 shrink-0 px-2.5 py-1 font-mono text-[11px] font-bold ${a.verdict === "PASS" ? "text-phos" : "text-amber"}`}
                >
                  {a.verdict === "PASS" ? "✓ PASS" : "! NOTE"}
                </span>
                <div>
                  <h3 className="font-display text-[14px] font-bold text-snow">{a.area}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-fog">{a.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={100} className="mt-8">
          <div className="flex flex-col items-start gap-4 border border-phos/40 bg-[#0d1710] px-6 py-5 sm:flex-row sm:items-center">
            <span className="stamp shrink-0 px-4 py-2 font-mono text-sm font-bold text-phos">ДОПУЩЕНО К ПРОШИВКЕ</span>
            <p className="text-[13.5px] leading-relaxed text-fog">
              Блокирующих замечаний нет. Три NOTE — осознанные ограничения платформы Arduino-класса с рекомендациями по
              эксплуатации (изоляция LAN, смена штатного пароля, ограничение физического доступа к плате).
            </p>
          </div>
        </Reveal>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="relative mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-24">
        <SectionHead index="08" kicker="Troubleshooting" tone="ice" title={<>Если что-то пошло не так</>} />
        <div className="space-y-2.5">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="faq group border border-line bg-panel" open={open === i} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setOpen(i)}>
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className="text-[14px] font-semibold text-snow group-open:text-ice">{f.q}</span>
                  <span className="faq-chev shrink-0 font-mono text-lg text-ice">+</span>
                </summary>
                <div className="border-t border-line/60 px-5 py-4 text-[13px] leading-relaxed text-fog">{f.a}</div>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="relative border-t border-line bg-panel2/50">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
            <div>
              <div className="font-display text-xl font-black text-snow">
                ТАЛОН-32 <span className="font-mono text-sm font-bold text-phos">v1.7</span>
              </div>
              <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-fog">
                RFID-учёт посетителей: 3 рабочих места (ресепшен · столовая · ресторан) на ESP32 Dev Module ·
                RC522 · Ethernet W5500 · LCD 1602 (hd44780) · DS3231 · лазерный рубеж · Arduino Core 3.x.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Arduino Core 3.x", "Ethernet W5500", "hd44780", "LittleFS", "ArduinoJson v7", "SNTP", "SMTP2GO", "Telegram Bot API"].map((t) => (
                  <span key={t} className="border border-line px-2 py-1 font-mono text-[10px] text-fog">{t}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-10 font-mono text-[12px]">
              <div>
                <Kicker>Разделы</Kicker>
                <ul className="mt-4 space-y-2">
                  {[["#terminal", "Терминал"], ["#logic", "Логика"], ["#parts", "Комплектующие"], ["#firmware", "Прошивка"]].map(([h, t]) => (
                    <li key={h}><a href={h} className="text-fog transition-colors hover:text-phos">{t}</a></li>
                  ))}
                </ul>
              </div>
              <div>
                <Kicker tone="amber">Эксплуатация</Kicker>
                <ul className="mt-4 space-y-2">
                  {[["#admin", "Админ-панель"], ["#telegram", "Telegram"], ["#flash", "Прошивка IDE"], ["#faq", "FAQ"]].map(([h, t]) => (
                    <li key={h}><a href={h} className="text-fog transition-colors hover:text-amber">{t}</a></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 font-mono text-[11px] text-fog/70 sm:flex-row">
            <span>© 2026 · Талон-32 · прошивка Talon32.ino · схема и код — в свободном использовании</span>
            <span>завтрак 08:30–11:30 · обед 13:30–15:30 · ужин 18:00–20:00</span>
          </div>
        </div>
      </footer>
    </>
  );
}
