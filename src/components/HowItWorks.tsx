import { SectionHead, Reveal } from "../ui";
import { SCHEDULE } from "../data/site";

const STEPS = [
  {
    n: "01",
    t: "Заселение — выдача карты",
    d: "Гость получает карту Mifare на ресепшен. Админ вводит терминал в режим регистрации (кнопка или админ-карта) и подносит карту: прошивка выдаёт сквозной номер 1, 2, 3… Номер — лишь метка гостя. Защита «одно место за период» строится на уникальном UID карты, поэтому двойной проход исключён независимо от нумерации.",
    tag: "RC522 · NVS",
  },
  {
    n: "02",
    t: "Касание у входа в зал",
    d: "Гость прикладывает карту к валидатору. Терминал считывает UID, находит карту в реестре, проверяет время по RTC DS3231 и определяет текущий период: завтрак, обед или ужин.",
    tag: "DS3231 · LCD",
  },
  {
    n: "03",
    t: "Правило «одно место за период»",
    d: "Терминал смотрит локальный журнал дня И опрашивает второй терминал по HTTP (сверка по ключу). Если гость уже отметился в любом зале в этом периоде — красная лампа, звуковой сигнал, вход запрещён.",
    tag: "HTTP-сверка",
  },
  {
    n: "04",
    t: "Зелёный свет и снятие луча",
    d: "Первое посещение за период: зелёная лампа, короткий гудок, визит пишется в журнал. Лазерный рубеж снимается с охраны на время прохода — максимум 20 секунд.",
    tag: "GRACE 20 c",
  },
  {
    n: "05",
    t: "Проход через луч",
    d: "Гость пересекает луч — система фиксирует проход и мгновенно возвращает рубеж на охрану. Не прошёл за 20 секунд — рубеж встаёт на охрану сам. Пересечение без карты: оранжевая лампа, тревожный сигнал, запись «нарушение» в журнале.",
    tag: "Лазер KY-008",
  },
  {
    n: "06",
    t: "Отчёты и уведомления",
    d: "Всё пишется в LittleFS по дням (JSONL). Админ строит отчёт за период в HTML/CSV/TXT из панели по паролю. Telegram-бот шлёт итог каждой строкой в конце периода, в 21:00 — CSV за день и HTML-отчёт на почту.",
    tag: "LittleFS · Telegram",
  },
];

export default function HowItWorks() {
  return (
    <section id="logic" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHead
        index="01"
        kicker="Логика допуска"
        title={<>Один гость — одно место<br />за каждый период</>}
        lead="Сценарий отработан до мелочей: вердикт выносится только после полного цикла проверок, лазерный рубеж страхует от прохода «без касания», а два терминала сверяются между собой, чтобы правило работало на оба зала сразу."
      />

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        {/* таймлайн шагов */}
        <ol className="relative space-y-2">
          <span className="absolute bottom-6 left-[27px] top-6 w-px bg-line2" aria-hidden />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 60} className="relative">
              <div className="card-lift group flex gap-5 border border-line bg-panel p-5">
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center border border-line2 bg-ink font-mono text-sm font-bold text-phos">
                  {s.n}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-[15px] font-bold text-snow">{s.t}</h3>
                    <span className="border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-fog">{s.tag}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-fog">{s.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>

        {/* правая колонка: сутки + правила */}
        <div className="space-y-6">
          <Reveal dir="right">
            <div className="border border-line bg-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-snow">Окна посещения</h3>
                <span className="font-mono text-[10px] uppercase tracking-widest text-fog">08:00 — 21:00</span>
              </div>
              <div className="relative h-24 border border-line bg-panel2">
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((h) => (
                  <div key={h} className="absolute bottom-0 top-0 border-l border-line/70" style={{ left: `${((h - 8) / 13) * 100}%` }}>
                    <span className="absolute bottom-1 left-1 font-mono text-[9px] text-fog/60">{h}</span>
                  </div>
                ))}
                {SCHEDULE.map((p) => (
                  <div
                    key={p.key}
                    className="absolute top-3 h-12 border"
                    style={{
                      left: `${((p.fromMin - 480) / 780) * 100}%`,
                      width: `${((p.toMin - p.fromMin) / 780) * 100}%`,
                      borderColor: p.color,
                      background: p.color + "22",
                    }}
                    title={p.name + " " + p.from + "–" + p.to}
                  >
                    <span className="absolute inset-0 flex flex-col items-center justify-center font-mono text-[10px] leading-tight" style={{ color: p.color }}>
                      <b className="uppercase">{p.name}</b>
                      {p.from}–{p.to}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fog">
                Между окнами валидатор отвечает «ВНЕ РАСПИСАНИЯ» (красная лампа). Окна редактируются в админ-панели без перепрошивки.
              </p>
            </div>
          </Reveal>

          <Reveal dir="right" delay={100}>
            <div className="border border-amber/40 bg-[#241a0c] p-5">
              <h3 className="font-display text-sm font-bold text-amber">Лазерный рубеж · 20 секунд</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-fog">
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-phos" />Карта принята → луч выключается до прохода гостя, но не более чем на 20 секунд.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ice" />Луч пересечён в окно прохода → система мгновенно возвращается на охрану.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />21-я секунда без прохода → рубеж встаёт на охрану автоматически.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-alarm" />Пересечение под охраной без карты → оранжевая лампа + звуковой сигнал + запись в журнал.</li>
              </ul>
            </div>
          </Reveal>

          <Reveal dir="right" delay={180}>
            <div className="border border-line bg-panel p-5">
              <h3 className="font-display text-sm font-bold text-snow">Сквозная нумерация и контроль по UID</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="border border-line bg-panel2 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-phos">Номер карты</div>
                  <div className="mt-2 text-snow">1 · 2 · 3 · 4 · 5 …</div>
                  <div className="mt-1 text-fog/70">id = ++счётчик (сквозной)</div>
                </div>
                <div className="border border-line bg-panel2 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-ice">Контроль прохода</div>
                  <div className="mt-2 text-snow">по UID карты</div>
                  <div className="mt-1 text-fog/70">уникален у каждой карты</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fog">
                Номер — сквозной и не привязан к залу (так удобнее оператору). А правило «одно место за период»
                проверяется по физическому UID карты, который неповторим, — значит двойной проход невозможен
                при любой нумерации.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
