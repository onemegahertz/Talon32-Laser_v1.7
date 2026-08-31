import { SectionHead, Reveal } from "../ui";
import { TG_COMMANDS, DEMO_DATES } from "../data/site";

function ChatMsg({ who, children, file }: { who: "bot" | "me"; children?: React.ReactNode; file?: { name: string; size: string } }) {
  const mine = who === "me";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${mine ? "border-ice/40 bg-[#0f2431] text-snow" : "border-line bg-panel2 text-snow"}`}>
        {children}
        {file && (
          <div className="mt-2 flex items-center gap-2.5 border border-line bg-ink px-3 py-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ce08f" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            <div>
              <div className="font-mono text-[11.5px] font-bold text-phos">{file.name}</div>
              <div className="text-[10px] text-fog">{file.size} · CSV</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Comms() {
  return (
    <section id="telegram" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHead
        index="05"
        kicker="Уведомления"
        tone="ice"
        title={<>Telegram-бот и письмо<br />на почту администратора</>}
        lead="Терминал сам рассказывает, что происходит: одна строка в конце каждого периода, CSV-файл по команде и автоматический суточный отчёт на e-mail. Адрес почты меняется из админ-панели без перепрошивки."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* чат */}
        <Reveal dir="left">
          <div className="border border-line bg-panel">
            <div className="flex items-center gap-3 border-b border-line bg-panel2 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ice/50 bg-[#0f2431] font-mono text-xs font-bold text-ice">T32</div>
              <div>
                <div className="text-sm font-bold text-snow">Талон-32 Бот</div>
                <div className="font-mono text-[10px] text-phos">online · опрос каждые 5 с</div>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <ChatMsg who="bot">
                <span className="text-fog">[ТАЛОН-32 · СТОЛОВАЯ]</span> ЗАВТРАК (08:30–11:30) завершён: посещений <b className="text-phos">34</b>, гостей <b className="text-phos">29</b>, отказов 3, нарушений луча 1
              </ChatMsg>
              <ChatMsg who="me">/report {DEMO_DATES.yesterday} {DEMO_DATES.today}</ChatMsg>
              <ChatMsg who="bot" file={{ name: "talon32_" + DEMO_DATES.yesterday + "_" + DEMO_DATES.today + ".csv", size: "6,2 КБ · 33 записи" }}>
                Отчёт за период — файлом:
              </ChatMsg>
              <ChatMsg who="bot">
                <span className="text-fog">[ТАЛОН-32 · СТОЛОВАЯ]</span> Итог дня {DEMO_DATES.today}: посещений <b className="text-phos">15</b>, гостей <b className="text-phos">8</b>, отказов 3, нарушений 1. CSV приложен.
              </ChatMsg>
              <ChatMsg who="bot" file={{ name: "talon32_" + DEMO_DATES.today + ".csv", size: "3,1 КБ · суточный" }}>
                <span className="text-amber">+ HTML-версия отправлена на admin@hotel.local ✉</span>
              </ChatMsg>
            </div>
          </div>
        </Reveal>

        {/* команды + почта */}
        <div className="space-y-6">
          <Reveal dir="right">
            <div className="border border-line bg-panel">
              <div className="border-b border-line2 bg-panel2 px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-fog">Команды бота</div>
              {TG_COMMANDS.map((c) => (
                <div key={c.cmd} className="flex items-baseline justify-between gap-4 border-b border-line/60 px-4 py-2.5 last:border-0 hover:bg-panel2/70">
                  <span className="font-mono text-[12.5px] font-bold text-ice">{c.cmd}</span>
                  <span className="text-right text-[12px] text-fog">{c.desc}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal dir="right" delay={100}>
            <div className="border border-line bg-panel p-5">
              <h3 className="font-display text-sm font-bold text-snow">Автоматика без участия человека</h3>
              <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-fog">
                <li className="flex gap-3">
                  <span className="mt-0.5 font-mono text-phos">11:30</span>
                  <span>закрылся завтрак — бот шлёт <b className="text-snow">одну общую строку</b>: сколько посещений и гостей за период</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 font-mono text-phos">15:30 / 20:00</span>
                  <span>аналогично по обеду и ужину — всегда одной строкой, без спама</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 font-mono text-amber">21:00</span>
                  <span>суточный CSV — в Telegram, развёрнутый HTML-отчёт «кто, когда и куда» — <b className="text-snow">на почту администратору</b> (SMTP2GO)</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 font-mono text-ice">24/7</span>
                  <span>команды /status, /today и /report — отчёт за любую дату или период прямо в мессенджер</span>
                </li>
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-fog/80">
                Время суточного отчёта, токен бота, Chat ID, SMTP-ключ и адрес получателя — всё редактируется во вкладке
                «Telegram и почта» админ-панели и хранится в энергонезависимой памяти.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
