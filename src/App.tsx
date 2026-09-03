import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOCS, type DocMeta } from "./data/documents";

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
  open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
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
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  select: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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

/* Акценты документов */
const ACCENT = {
  amber: { text: "text-amber", border: "border-amber/50", bg: "bg-amber", glow: "rgba(255,179,71,0.35)" },
  cyan: { text: "text-cyan", border: "border-cyan/50", bg: "bg-cyan", glow: "rgba(86,215,232,0.35)" },
  red: { text: "text-red", border: "border-red/50", bg: "bg-red", glow: "rgba(255,107,107,0.35)" },
} as const;

/* ------------------------------------------------------------------ */
/*  Утилиты                                                             */
/* ------------------------------------------------------------------ */
function downloadText(filename: string, content: string) {
  // BOM, чтобы Windows-блокнот открывал кириллицу корректно
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* в песочнице предпросмотра download может блокироваться —
       на этот случай есть «Открыть» с копированием */
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
/*  Появление при монтировании: контент видим ВСЕГДА,                   */
/*  анимация — только украшение (никаких скрытых блоков)                */
/* ------------------------------------------------------------------ */
function FadeIn({ delay = 0, className = "", children }: { delay?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={"fade-in " + className} style={{ animationDelay: delay + "ms" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Кнопки                                                              */
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
      {on ? "Файл сохранён" : compact ? "Скачать" : "Скачать " + file}
    </button>
  );
}

function OpenButton({ onOpen, compact = false }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={
        "group inline-flex items-center gap-2 border border-cyan/70 bg-cyan/10 font-mono font-semibold text-cyan transition-all duration-200 hover:bg-cyan hover:text-ink hover:shadow-[0_0_24px_rgba(86,215,232,0.35)] " +
        (compact ? "px-3 py-1.5 text-[11px]" : "px-5 py-2.5 text-[13px]")
      }
      title="Открыть полный текст — надёжный способ забрать файл, если скачивание заблокировано"
    >
      <span className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">{Icon.open}</span>
      Открыть текст
    </button>
  );
}

function CopyButton({ text, compact = false }: { text: string; compact?: boolean }) {
  const { on, fire } = useFlash();
  return (
    <button
      onClick={async () => {
        if (await copyText(text)) fire();
      }}
      className={
        "inline-flex items-center gap-2 border border-line2 font-mono font-medium transition-colors duration-200 " +
        (compact ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-[12px] ") +
        (on ? "border-green/70 bg-green/10 text-green" : "text-fog hover:border-cyan/60 hover:text-cyan")
      }
      title="Скопировать весь текст в буфер обмена"
    >
      {on ? Icon.check : Icon.copy}
      {on ? "Скопировано" : "Копировать"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Предпросмотр документа                                              */
/* ------------------------------------------------------------------ */
function Preview({ doc, onOpen }: { doc: DocMeta; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => textStats(doc.text), [doc]);
  const a = ACCENT[doc.accent];

  return (
    <div className={"overflow-hidden border bg-deep/80 " + a.border}>
      {/* шапка терминала */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green/80 animate-pulse-soft" />
        </div>
        <span className={"font-mono text-[12px] font-semibold " + a.text}>{doc.file}</span>
        <span className="ml-auto hidden items-center gap-3 font-mono text-[10.5px] uppercase tracking-wider text-mist sm:flex">
          <span>{stats.lines} строк</span>
          <span className="text-line2">·</span>
          <span>~{stats.kb} КБ</span>
          <span className="text-line2">·</span>
          <span>UTF-8</span>
        </span>
      </div>

      {/* тело: контент в DOM всегда, скрытие невозможно */}
      <div className="relative">
        <pre
          className={
            "doc-scroll overflow-auto whitespace-pre bg-ink/70 px-4 py-4 font-mono text-[11.5px] leading-[1.65] text-fog " +
            (expanded ? "max-h-[70vh]" : "max-h-[380px]")
          }
        >
          {doc.text || "!! текст документа пуст — пересоберите проект !!"}
        </pre>
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink to-transparent" />
        )}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={"h-10 w-full opacity-[0.05] animate-scan " + a.bg} />
        </div>
      </div>

      {/* действия */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel/80 px-4 py-3">
        <DownloadButton file={doc.file} text={doc.text} compact />
        <OpenButton onOpen={onOpen} compact />
        <CopyButton text={doc.text} compact />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex items-center gap-2 border border-line2 px-3 py-1.5 font-mono text-[11px] font-medium text-fog transition-colors duration-200 hover:text-snow"
        >
          <span className={expanded ? "rotate-90 transition-transform" : "transition-transform"}>{Icon.expand}</span>
          {expanded ? "Свернуть" : "Развернуть"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Полноэкранное окно с текстом (гарантированный способ забрать файл)  */
/* ------------------------------------------------------------------ */
function DocModal({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { on, fire } = useFlash(2200);
  const a = ACCENT[doc.accent];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const selectAll = () => {
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={"Текст файла " + doc.file}>
      <div className="absolute inset-0 bg-ink/90 backdrop-blur-sm" onClick={onClose} />
      <div className={"fade-in relative flex h-full w-full max-w-4xl flex-col border-2 bg-deep shadow-[0_30px_90px_rgba(0,0,0,0.7)] " + a.border}>
        {/* шапка */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel/80 px-4 py-3">
          <span className={"font-display text-sm font-bold " + a.text}>{doc.file}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-mist">полный текст · только чтение</span>
          <button
            onClick={onClose}
            className="ml-auto inline-flex items-center gap-2 border border-line2 px-3 py-1.5 font-mono text-[11px] text-fog transition-colors hover:border-red/60 hover:text-red"
            title="Закрыть (Esc)"
          >
            {Icon.close}
            Закрыть · Esc
          </button>
        </div>

        {/* текст */}
        <textarea
          ref={taRef}
          readOnly
          spellCheck={false}
          value={doc.text}
          onFocus={(e) => e.currentTarget.select()}
          className="doc-scroll min-h-0 flex-1 resize-none bg-ink px-4 py-4 font-mono text-[12px] leading-[1.6] text-snow outline-none"
        />

        {/* действия */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel/80 px-4 py-3">
          <button
            onClick={selectAll}
            className="inline-flex items-center gap-2 border border-line2 px-3 py-2 font-mono text-[12px] font-medium text-fog transition-colors hover:border-cyan/60 hover:text-cyan"
          >
            {Icon.select}
            Выделить всё
          </button>
          <button
            onClick={async () => {
              if (await copyText(doc.text)) fire();
            }}
            className={
              "inline-flex items-center gap-2 border px-4 py-2 font-mono text-[12px] font-semibold transition-all " +
              (on ? "border-green/70 bg-green/15 text-green" : "border-cyan/70 bg-cyan/10 text-cyan hover:bg-cyan hover:text-ink")
            }
          >
            {on ? Icon.check : Icon.copy}
            {on ? "Скопировано — вставьте в редактор" : "Скопировать всё"}
          </button>
          <div className="ml-auto">
            <DownloadButton file={doc.file} text={doc.text} compact />
          </div>
        </div>

        <div className="border-t border-line bg-deep px-4 py-2 font-mono text-[10.5px] leading-relaxed text-mist">
          Если скачивание не сработало: «Скопировать всё» → вставьте в Блокнот (.txt) или Arduino IDE (.ino) → Сохранить как…
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Секция документа                                                    */
/* ------------------------------------------------------------------ */
function DocSection({ doc, index, delay, onOpen }: { doc: DocMeta; index: number; delay: number; onOpen: () => void }) {
  const a = ACCENT[doc.accent];
  return (
    <FadeIn delay={delay}>
      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className={"font-display text-4xl font-black leading-none sm:text-5xl " + a.text}>
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
      <Preview doc={doc} onOpen={onOpen} />
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Чертёжный штамп                                                     */
/* ------------------------------------------------------------------ */
function TitleBlock() {
  const today = useMemo(() => new Date().toLocaleDateString("ru-RU"), []);
  const cell = "border-line px-3 py-2";
  const label = "font-mono text-[9px] uppercase tracking-[0.14em] text-mist";
  const value = "font-mono text-[12px] font-semibold text-snow";
  return (
    <div className="border-2 border-line2 bg-panel/70 shadow-[0_18px_50px_rgba(3,8,20,0.55)] backdrop-blur-sm">
      <div className="grid grid-cols-[1.4fr_1fr] border-b border-line">
        <div className={cell + " border-r"}>
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
  ["Проверить", "диагностическим скетчем через Монитор порта"],
  ["Прошить", "Talon32.ino и назначить роль: ресепшен / столовая / ресторан"],
];

function FlowStrip() {
  return (
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
  );
}

/* ------------------------------------------------------------------ */
/*  Приложение                                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const [modal, setModal] = useState<DocMeta | null>(null);

  const downloadAll = () => {
    DOCS.forEach((d, i) => {
      setTimeout(() => downloadText(d.file, d.text), i * 400);
    });
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
            onClick={downloadAll}
            className="inline-flex items-center gap-2 border border-cyan/70 bg-cyan/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-cyan transition-all duration-200 hover:bg-cyan hover:text-ink hover:shadow-[0_0_24px_rgba(86,215,232,0.35)]"
          >
            {Icon.download}
            <span className="hidden sm:inline">Все 3 файла</span>
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24">
        {/* открытие: чертёжный штамп */}
        <div className="grid gap-10 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <FadeIn>
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
              Три готовых файла: что купить (ведомость комплектующих с пересчётом на 3 рабочих места), как соединить
              (монтажная схема с таблицей GPIO) и чем проверить (диагностический скетч для Монитора порта).
              Скачивайте, печатайте, держите на верстаке.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {DOCS.map((d, i) => (
                <FadeIn key={d.key} delay={120 + i * 90}>
                  <DownloadButton file={d.file} text={d.text} />
                </FadeIn>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-wider text-mist">
              <span><span className="text-green">●</span> 18 позиций</span>
              <span><span className="text-amber">●</span> 18 GPIO</span>
              <span><span className="text-cyan">●</span> 6 тестов узлов</span>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <TitleBlock />
          </FadeIn>
        </div>

        {/* подсказка, если скачивание блокируется средой */}
        <FadeIn delay={220} className="mt-12">
          <div className="flex flex-col gap-3 border border-amber/40 bg-amber/[0.06] px-5 py-4 sm:flex-row sm:items-center">
            <span className="flex-none text-amber">{Icon.alert}</span>
            <p className="text-[13px] leading-relaxed text-fog">
              <span className="font-semibold text-amber">Файл не скачивается?</span> Такое бывает в окне предпросмотра —
              браузер молча блокирует загрузку. Нажмите у документа{" "}
              <span className="font-mono text-cyan">«Открыть текст»</span> →{" "}
              <span className="font-mono text-cyan">«Скопировать всё»</span> → вставьте в Блокнот или Arduino IDE и
              сохраните под нужным именем. Текст в предпросмотре ниже — полный и точный.
            </p>
          </div>
        </FadeIn>

        {/* документы */}
        <div className="mt-16 space-y-16">
          {DOCS.map((d, i) => (
            <DocSection key={d.key} doc={d} index={i + 1} delay={80} onOpen={() => setModal(d)} />
          ))}
        </div>

        {/* порядок сборки */}
        <FadeIn delay={80} className="mt-20">
          <FlowStrip />
        </FadeIn>
      </main>

      <footer className="relative border-t border-line bg-deep/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6">
          <span className="font-mono text-[11px] text-mist">
            Талон-32 v1.7 · RFID-учёт посетителей · {DOCS.map((d) => d.file).join(" + ")}
          </span>
          <span className="ml-auto font-mono text-[11px] text-mist">
            Arduino Core 3.x · ESP32 + RC522 + W5500
          </span>
        </div>
      </footer>

      {modal && <DocModal doc={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
