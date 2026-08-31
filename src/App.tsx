import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOM_FILE, DOCS, WIRING_FILE, type DocMeta } from "./data/documents";

/* ------------------------------------------------------------------ */
/*  Иконки (inline SVG, без внешних библиотек)                          */
/* ------------------------------------------------------------------ */
const Icon = {
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Утилиты                                                             */
/* ------------------------------------------------------------------ */
function downloadText(filename: string, content: string) {
  // BOM, чтобы Windows-блокнот открывал кириллицу корректно
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function copyText(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = content;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function textStats(text: string) {
  const lines = text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  return { lines, kb: (bytes / 1024).toFixed(1) };
}

function useReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, shown };
}

function useFlash(ms = 1800) {
  const [on, setOn] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const fire = useCallback(() => {
    setOn(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return { on, fire };
}

/* ------------------------------------------------------------------ */
/*  Кнопка скачивания с обратной связью                                 */
/* ------------------------------------------------------------------ */
function DownloadButton({ file, text, compact = false }: { file: string; text: string; compact?: boolean }) {
  const { on, fire } = useFlash();
  return (
    <button
      onClick={() => {
        downloadText(file, text);
        fire();
      }}
      className={
        "group inline-flex items-center gap-2 border font-mono font-semibold transition-all duration-200 " +
        (compact ? "px-3 py-1.5 text-[11px] " : "px-5 py-2.5 text-[13px] ") +
        (on
          ? "border-green/70 bg-green/15 text-green"
          : "border-amber/70 bg-amber/10 text-amber hover:bg-amber hover:text-ink hover:shadow-[0_0_24px_rgba(255,179,71,0.35)]")
      }
    >
      <span className={on ? "" : "transition-transform duration-200 group-hover:translate-y-0.5"}>
        {on ? Icon.check : Icon.download}
      </span>
      {on ? "Файл сохранён" : compact ? "Скачать .txt" : "Скачать " + file}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const { on, fire } = useFlash();
  return (
    <button
      onClick={async () => {
        if (await copyText(text)) fire();
      }}
      className={
        "inline-flex items-center gap-2 border border-line2 px-3 py-2.5 font-mono text-[12px] font-medium transition-colors duration-200 " +
        (on ? "border-green/70 bg-green/10 text-green" : "text-fog hover:border-cyan/60 hover:text-cyan")
      }
      title="Скопировать текст в буфер обмена"
    >
      {on ? Icon.check : Icon.copy}
      {on ? "Скопировано" : "Копировать"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Предпросмотр документа                                              */
/* ------------------------------------------------------------------ */
function Preview({ doc }: { doc: DocMeta }) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => textStats(doc.text), [doc]);
  const accentText = doc.accent === "amber" ? "text-amber" : "text-cyan";
  const accentBorder = doc.accent === "amber" ? "border-amber/50" : "border-cyan/50";

  return (
    <div className={"overflow-hidden border bg-deep/80 " + accentBorder}>
      {/* шапка терминала */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green/80 animate-pulse-soft" />
        </div>
        <span className={"font-mono text-[12px] font-semibold " + accentText}>{doc.file}</span>
        <span className="ml-auto hidden items-center gap-3 font-mono text-[10.5px] uppercase tracking-wider text-mist sm:flex">
          <span>{stats.lines} строк</span>
          <span className="text-line2">·</span>
          <span>~{stats.kb} КБ</span>
          <span className="text-line2">·</span>
          <span>UTF-8</span>
        </span>
      </div>

      {/* тело */}
      <div className="relative">
        <pre
          className={
            "doc-scroll overflow-auto whitespace-pre bg-ink/70 px-4 py-4 font-mono text-[11.5px] leading-[1.65] text-fog " +
            (expanded ? "max-h-[70vh]" : "max-h-[380px]")
          }
        >
          {doc.text}
        </pre>
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink to-transparent" />
        )}
        {/* бегущая линия сканирования */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={"h-10 w-full opacity-[0.05] animate-scan " + (doc.accent === "amber" ? "bg-amber" : "bg-cyan")} />
        </div>
      </div>

      {/* действия */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel/80 px-4 py-3">
        <DownloadButton file={doc.file} text={doc.text} compact />
        <CopyButton text={doc.text} />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex items-center gap-2 border border-line2 px-3 py-2.5 font-mono text-[12px] font-medium text-fog transition-colors duration-200 hover:border-line2 hover:text-snow"
        >
          <span className={expanded ? "rotate-90 transition-transform" : "transition-transform"}>{Icon.expand}</span>
          {expanded ? "Свернуть" : "Развернуть"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Секция документа                                                    */
/* ------------------------------------------------------------------ */
function DocSection({ doc, index }: { doc: DocMeta; index: number }) {
  const { ref, shown } = useReveal<HTMLElement>();
  const accentText = doc.accent === "amber" ? "text-amber" : "text-cyan";

  return (
    <section ref={ref} className={"reveal " + (shown ? "is-shown" : "")}>
      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className={"font-display text-4xl font-black leading-none sm:text-5xl " + accentText}>
          {String(index).padStart(2, "0")}
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-snow sm:text-2xl">{doc.title}</h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-fog">{doc.subtitle}</p>
        </div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {doc.points.map((p) => (
            <span key={p} className="border border-line bg-panel/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-wider text-fog">
              {p}
            </span>
          ))}
        </div>
      </div>
      <Preview doc={doc} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Чертёжный штамп (рамка документа)                                   */
/* ------------------------------------------------------------------ */
function TitleBlock() {
  const today = useMemo(() => new Date().toLocaleDateString("ru-RU"), []);
  const cell = "border-line px-3 py-2";
  const label = "font-mono text-[9px] uppercase tracking-[0.14em] text-mist";
  const value = "font-mono text-[12px] font-semibold text-snow";
  return (
    <div className="border-2 border-line2 bg-panel/70 shadow-[0_18px_50px_rgba(3,8,20,0.55)] backdrop-blur-sm">
      <div className="grid grid-cols-[1.4fr_1fr] border-b border-line">
        <div className={"border-r " + cell}>
          <div className={label}>Обозначение</div>
          <div className={value}>ТАЛОН32.30.00.000</div>
        </div>
        <div className={cell}>
          <div className={label}>Формат</div>
          <div className={value}>A4</div>
        </div>
      </div>
      <div className="border-b border-line">
        <div className={cell}>
          <div className={label}>Наименование</div>
          <div className="font-body text-[13px] font-semibold leading-snug text-snow">
            Система RFID-учёта посетителей. Документация для сборки (3 терминала)
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3">
        {[
          ["Разраб.", "Гл. программист"],
          ["Пров.", "Независимый эксперт"],
          ["Утв.", "Заказчик"],
        ].map(([l, v]) => (
          <div key={l} className={cell + " border-r border-line last:border-r-0"}>
            <div className={label}>{l}</div>
            <div className={value}>{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 border-t border-line">
        <div className={cell + " border-r"}>
          <div className={label}>Литера</div>
          <div className={value}>О</div>
        </div>
        <div className={cell + " border-r"}>
          <div className={label}>Лист / Листов</div>
          <div className={value}>1 / 2</div>
        </div>
        <div className={cell}>
          <div className={label}>Дата</div>
          <div className={value}>{today}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Лента порядка сборки                                                */
/* ------------------------------------------------------------------ */
const STEPS = [
  ["Закупить", "по ведомости комплектующих, пересчёт ×3 уже сделан"],
  ["Собрать", "по монтажной схеме: SPI-шины раздельно, I2C одна"],
  ["Прошить", "скетчем Talon32.ino все три платы (Arduino Core 3.x)"],
  ["Назначить роль", "ресепшен / столовая / ресторан — кнопка 1,5 с или веб-панель"],
];

function FlowStrip() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={"reveal " + (shown ? "is-shown" : "")}>
      <div className="border border-line bg-panel/50 px-6 py-6 sm:px-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-px w-8 bg-amber" />
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-snow">Порядок сборки</h3>
        </div>
        <ol className="grid gap-y-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="relative pr-6 lg:pr-8">
              {i < STEPS.length - 1 && (
                <span className="absolute left-7 top-7 hidden h-px w-[calc(100%-3rem)] bg-gradient-to-r from-line2 to-transparent lg:block" />
              )}
              <div className="flex items-start gap-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center border border-amber/60 bg-amber/10 font-display text-sm font-black text-amber">
                  {i + 1}
                </span>
                <div>
                  <div className="font-body text-[14px] font-bold text-snow">{t}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-fog">{d}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Приложение                                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const bom = DOCS[0];
  const wiring = DOCS[1];
  const hero = useReveal<HTMLDivElement>(0.05);

  const downloadBoth = () => {
    downloadText(BOM_FILE, bom.text);
    setTimeout(() => downloadText(WIRING_FILE, wiring.text), 350);
  };

  return (
    <div className="blueprint-grid relative min-h-screen bg-ink text-snow">
      {/* фоновые свечения */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber/[0.07] blur-[120px]" />
        <div className="absolute -bottom-48 -right-40 h-[520px] w-[520px] rounded-full bg-cyan/[0.07] blur-[130px]" />
      </div>

      {/* верхняя панель */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green" />
            </span>
            <span className="font-display text-sm font-extrabold tracking-wide text-snow">
              ТАЛОН-32<span className="text-amber">·32</span>
            </span>
            <span className="border border-line bg-panel/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fog">v1.7</span>
          </div>
          <span className="ml-auto hidden font-mono text-[10.5px] uppercase tracking-wider text-mist md:block">
            Ресепшен · Столовая · Ресторан
          </span>
          <button
            onClick={downloadBoth}
            className="inline-flex items-center gap-2 border border-cyan/70 bg-cyan/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-cyan transition-all duration-200 hover:bg-cyan hover:text-ink hover:shadow-[0_0_24px_rgba(86,215,232,0.35)]"
          >
            {Icon.download}
            <span className="hidden sm:inline">Оба файла</span>
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24">
        {/* открытие: чертёжный штамп */}
        <div ref={hero.ref} className={"reveal grid gap-10 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center " + (hero.shown ? "is-shown" : "")}>
          <div>
            <div className="mb-5 inline-flex items-center gap-2 border border-line bg-panel/60 px-3 py-1.5">
              <span className="text-amber">{Icon.doc}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">Комплект документации для сборки</span>
            </div>
            <h1 className="font-display text-4xl font-black leading-[1.08] text-snow sm:text-5xl">
              Собрать
              <br />
              <span className="text-amber">три терминала</span>
              <br />
              без ошибок.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fog">
              Два готовых текстовых файла: что купить (ведомость комплектующих с пересчётом на 3 рабочих места) и как
              соединить (монтажная схема с таблицей GPIO). Скачивайте, печатайте, держите на верстаке.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <DownloadButton file={BOM_FILE} text={bom.text} />
              <DownloadButton file={WIRING_FILE} text={wiring.text} />
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-wider text-mist">
              <span><span className="text-green">●</span> 18 позиций</span>
              <span><span className="text-amber">●</span> 18 GPIO</span>
              <span><span className="text-cyan">●</span> UTF-8 · BOM</span>
            </div>
          </div>
          <TitleBlock />
        </div>

        {/* документы */}
        <div className="mt-20 space-y-16">
          <DocSection doc={bom} index={1} />
          <DocSection doc={wiring} index={2} />
        </div>

        {/* порядок сборки */}
        <div className="mt-20">
          <FlowStrip />
        </div>
      </main>

      <footer className="relative border-t border-line bg-deep/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6">
          <span className="font-mono text-[11px] text-mist">
            Талон-32 v1.7 · RFID-учёт посетителей · {BOM_FILE} + {WIRING_FILE}
          </span>
          <span className="ml-auto font-mono text-[11px] text-mist">
            Arduino Core 3.x · ESP32 + RC522 + W5500
          </span>
        </div>
      </footer>
    </div>
  );
}
