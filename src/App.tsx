import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLINK_CODES, DOCS, type DocMeta } from "./data/documents";
import { FIRMWARE_CODE, FIRMWARE_FILE } from "./data/firmware";

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
  green: { text: "text-green", border: "border-green/50", bg: "bg-green", glow: "rgba(76,224,143,0.35)" },
  blue: { text: "text-blue", border: "border-blue/50", bg: "bg-blue", glow: "rgba(110,168,255,0.35)" },
  lime: { text: "text-lime", border: "border-lime/50", bg: "bg-lime", glow: "rgba(183,224,90,0.35)" },
} as const;

/* Быстрый доступ к ключевым документам комплекта */
const GUIDE = DOCS.find((d) => d.key === "guide") as DocMeta;
const WIRING = DOCS.find((d) => d.key === "wiring") as DocMeta;

/* Основной скетч v2.0 — первый документ в комплекте */
const FIRMWARE_DOC: DocMeta = {
  key: "firmware",
  file: FIRMWARE_FILE,
  title: "Основная прошивка v2.0 «Рубеж»",
  subtitle:
    "Единый скетч для всех трёх терминалов: раздельный вход администратор/оператор, самотест с кодами миганий, " +
    "«ЗАПИСЬ: УДАЧА/НЕУДАЧА», «пип» при поднесении карты, Ethernet W5500 + Wi-Fi + WPA2-точка.",
  accent: "amber",
  text: FIRMWARE_CODE,
  points: ["Arduino Core 3.x", "самотест устройств", "2 роли доступа"],
};

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

/* Большая «прямая ссылка» на прошивку: настоящий <a download>, а не
   программный клик — такую ссылку видно, можно кликнуть, а можно
   «Сохранить ссылку как…». Blob создаётся один раз из проверенного
   исходника FIRMWARE_DOC.text (тот самый, что идёт в сборку).        */
function FirmwareDirectLink({ file, text }: { file: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(
    () => URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" })),
    [text]
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const stats = useMemo(() => textStats(text), [text]);
  return (
    <div className="group relative overflow-hidden border-2 border-amber/60 bg-panel/80">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-amber/50 bg-amber/10 text-amber">
          {Icon.download}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Прошивка · прямая ссылка</div>
          <div className="mt-1 truncate font-display text-lg font-bold text-snow">{file}</div>
          <div className="mt-0.5 font-mono text-[11px] text-mist">
            {stats.lines} строк · {stats.kb} КБ · Arduino Core 3.x · ESP32 Dev Module
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <a
            href={url}
            download={file}
            rel="noopener"
            className="inline-flex items-center justify-center gap-2 border border-amber bg-amber px-5 py-2.5 font-mono text-[13px] font-bold text-ink transition-all duration-200 hover:bg-transparent hover:text-amber hover:shadow-[0_0_28px_rgba(255,179,71,0.4)]"
          >
            {Icon.download}
            Скачать .ino
          </a>
          <button
            onClick={async () => {
              if (await copyText(text)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
            className={
              "inline-flex items-center justify-center gap-2 border px-5 py-2.5 font-mono text-[13px] font-semibold transition-all duration-200 " +
              (copied
                ? "border-green/70 bg-green/15 text-green"
                : "border-line text-fog hover:border-cyan hover:text-cyan")
            }
          >
            {copied ? Icon.check : Icon.copy}
            {copied ? "Скопировано" : "Копировать код"}
          </button>
        </div>
      </div>
    </div>
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
/*  Экранный шрифт: симулятор LCD с точными битмапами из прошивки       */
/* ------------------------------------------------------------------ */
type Glyph = number[];

/* 8 CGRAM-значков — ТЕ ЖЕ байты, что в прошивке (lcdInitChars) */
const CG: Record<string, Glyph> = {
  Л: [0x07, 0x05, 0x05, 0x05, 0x05, 0x11, 0x11, 0x00],
  И: [0x11, 0x13, 0x13, 0x15, 0x19, 0x19, 0x11, 0x11],
  Д: [0x0e, 0x0a, 0x0a, 0x0a, 0x0a, 0x1f, 0x11, 0x00],
  Я: [0x0f, 0x11, 0x11, 0x0f, 0x05, 0x11, 0x11, 0x00],
  Ч: [0x11, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x01, 0x00],
  Ш: [0x15, 0x15, 0x15, 0x15, 0x15, 0x1f, 0x00, 0x00],
  Ё: [0x0a, 0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  З: [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e, 0x00],
};

/* Кириллица -> латинские двойники (таблица прошивки lcdMapChar) */
const LCD_MAP: Record<string, string> = {
  А: "A", Б: "B", В: "B", Г: "G", Е: "E", Ж: "J", Й: "I", К: "K", М: "M", Н: "H",
  О: "O", П: "N", Р: "P", С: "C", Т: "T", У: "Y", Ф: "F", Х: "X", Ц: "C", Щ: "W",
  Ъ: '"', Ы: "Y", Ь: "'", Э: "E", Ю: "U",
  а: "A", б: "B", в: "B", г: "G", е: "E", ж: "J", й: "I", к: "K", м: "M", н: "H",
  о: "O", п: "N", р: "P", с: "C", т: "T", у: "Y", ф: "F", х: "X", ц: "C", щ: "W",
  ъ: '"', ы: "Y", ь: "'", э: "E", ю: "U", є: "E", і: "I", ї: "I",
};

/* Классический шрифт 5×7 для латиницы, цифр и знаков */
const F57: Record<string, Glyph> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11, 0], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e, 0],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e, 0], D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c, 0],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f, 0], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10, 0],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f, 0], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11, 0],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e, 0], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c, 0],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11, 0], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f, 0],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11, 0], N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e, 0], P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10, 0],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11, 0], S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e, 0],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0], U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e, 0],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04, 0], W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a, 0],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11, 0], Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04, 0],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f, 0],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e, 0], "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e, 0],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f, 0], "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e, 0],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02, 0], "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e, 0],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e, 0], "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08, 0],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e, 0], "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c, 0],
  " ": [0, 0, 0, 0, 0, 0, 0, 0], ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00, 0],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c, 0], "/": [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x00, 0],
  "-": [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, 0], "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04, 0], "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00, 0],
  '"': [0x0a, 0x0a, 0x14, 0x00, 0x00, 0x00, 0x00, 0],
};

/* Символ -> { значок CGRAM } | { латинский глиф } */
function lcdGlyph(ch: string): { cg: string } | { g: Glyph } {
  if (CG[ch]) return { cg: ch };
  const m = LCD_MAP[ch];
  const lat = m ?? ch;
  const g = F57[lat] ?? F57[lat.toUpperCase()] ?? F57["?"];
  return { g };
}

function DotMatrix({ g, on = "#7dffa8", off = "rgba(125,255,168,0.07)", size = 3, className = "" }: {
  g: Glyph; on?: string; off?: string; size?: number; className?: string;
}) {
  return (
    <div className={"grid grid-cols-5 " + className} style={{ gap: 1 }}>
      {g.flatMap((row, r) =>
        [4, 3, 2, 1, 0].map((bit) => {
          const lit = (row >> bit) & 1;
          return (
            <span
              key={r * 5 + bit}
              style={{ width: size, height: size, background: lit ? on : off, boxShadow: lit ? "0 0 4px " + on : "none" }}
            />
          );
        })
      )}
    </div>
  );
}

const LCD_PHRASES: { label: string; lines: [string, string] }[] = [
  { label: "Зал", lines: ["СТОЛОВАЯ", "ЛУЧ: ОХРАНА"] },
  { label: "Допуск", lines: ["ДОСТУП РАЗРЕШЁН", "ОБЕД Гость 12"] },
  { label: "Запись", lines: ["ЗАПИСЬ: УДАЧА", "ГОСТЬ ID 7"] },
  { label: "Дашборд", lines: ["СЕГОДНЯ: 12/8Г", "ЗАВТРАК 8:30"] },
  { label: "Ресепшен", lines: ["РЕСЕПШЕН", "КАРТ В БАЗЕ: 34"] },
];

function LcdFontSection() {
  const [pi, setPi] = useState(0);
  const [hoverCg, setHoverCg] = useState<string | null>(null);
  const phrase = LCD_PHRASES[pi];

  const cellFor = (ch: string, i: number) => {
    const r = lcdGlyph(ch);
    if ("cg" in r) {
      const active = hoverCg === ch;
      const dim = hoverCg !== null && !active;
      return (
        <div
          key={i}
          className={
            "flex items-center justify-center border transition-all duration-200 " +
            (active ? "border-amber bg-amber/10" : "border-transparent") +
            (dim ? " opacity-30" : "")
          }
        >
          <DotMatrix g={CG[ch]} on={active ? "#ffd27d" : "#7dffa8"} size={3} />
        </div>
      );
    }
    return (
      <div key={i} className={"flex items-center justify-center border border-transparent transition-opacity duration-200 " + (hoverCg ? "opacity-30" : "")}>
        <DotMatrix g={r.g} size={3} />
      </div>
    );
  };

  const row = (s: string) => {
    const chars = Array.from(s).slice(0, 16);
    while (chars.length < 16) chars.push(" ");
    return chars;
  };

  return (
    <FadeIn delay={80}>
      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className="font-display text-4xl font-black leading-none text-green sm:text-5xl">ЭШ</span>
        <div>
          <h2 className="font-display text-xl font-bold text-snow sm:text-2xl">Экранный шрифт · симулятор LCD</h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-fog">
            Точные битмапы из прошивки (эталон LCD_1602_RUS — тот же шрифтовой канон, что в профессиональных
            блоках-русификаторах). Наведите курсор на знак CGRAM — подсветятся его вхождения на экране.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* сам дисплей */}
        <div className="border-2 border-line2 bg-panel/70 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {LCD_PHRASES.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPi(i)}
                className={
                  "border px-3 py-1 font-mono text-[11px] font-semibold transition-all duration-200 " +
                  (i === pi
                    ? "border-green bg-green/15 text-green"
                    : "border-line text-fog hover:border-green/50 hover:text-green")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mx-auto max-w-[430px] border-[6px] border-[#1a2b33] bg-[#04140b] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.8),0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="space-y-1.5">
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(16, minmax(0,1fr))" }}>
                {row(phrase.lines[0]).map(cellFor)}
              </div>
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(16, minmax(0,1fr))" }}>
                {row(phrase.lines[1]).map(cellFor)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-center font-mono text-[10.5px] uppercase tracking-wider text-mist">
            Так текст выглядит на дисплее с латинским ROM · жёлтым — собственные знаки CGRAM
          </div>
        </div>

        {/* знаки CGRAM */}
        <div className="border border-line bg-panel/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-green" />
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-snow">8 знаков CGRAM</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(CG).map(([ch, g], i) => (
              <div
                key={ch}
                onMouseEnter={() => setHoverCg(ch)}
                onMouseLeave={() => setHoverCg(null)}
                className={
                  "cursor-crosshair border bg-[#04140b] px-2 py-3 text-center transition-all duration-200 " +
                  (hoverCg === ch ? "border-amber shadow-[0_0_18px_rgba(255,179,71,0.25)]" : "border-line hover:border-green/50")
                }
              >
                <div className="flex justify-center">
                  <DotMatrix g={g} on={hoverCg === ch ? "#ffd27d" : "#7dffa8"} size={4} />
                </div>
                <div className="mt-2 font-display text-sm font-bold text-snow">{ch}</div>
                <div className="font-mono text-[9.5px] text-mist">CGRAM {i}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-fog">
            Буквы-двойники <span className="font-mono text-green">А В Е К М Н О Р С Т У Х</span> выводятся латиницей —
            на глаз неотличимо. Редкие буквы читаются транслитом. Принцип тот же, что в блоке{" "}
            <span className="font-mono text-cyan">lcd_v2_18 (FLprog)</span>: до 8 уникальных знаков + латиница.
          </p>
        </div>
      </div>
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
            <div className={value}>ТЛН32-РУБЕЖ.20.00.000</div>
          </div>        <div className={cell}>
          <div className={label}>Формат</div>
          <div className={value}>A4</div>
        </div>
      </div>
      <div className="border-b border-line">
        <div className={cell}>
          <div className={label}>Наименование</div>
          <div className="font-body text-[13px] font-semibold leading-snug text-snow">
            Система RFID-учёта посетителей «Талон 32 v2.0 Рубеж». Комплект документации для сборки (3 терминала)
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
/*  Коды миганий самотеста (v2.0) — интерактивная таблица               */
/* ------------------------------------------------------------------ */
function BlinkCodeRow({ code, device, note }: { code: string; device: string; note: string }) {
  const [blinking, setBlinking] = useState(false);
  const n = parseInt(code, 10);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const demo = () => {
    if (blinking) return;
    setBlinking(true);
    for (let i = 0; i < n; i++) {
      timers.current.push(window.setTimeout(() => setBlinking(true), i * 850));
    }
    timers.current.push(window.setTimeout(() => setBlinking(false), n * 850 + 200));
  };

  /* LED мигает внутри своего цикла: включён 500 мс из 850 */
  return (
    <button
      onClick={demo}
      className="group grid w-full grid-cols-[52px_1fr] items-center gap-x-4 border border-line bg-panel/50 px-4 py-3 text-left transition-all duration-200 hover:border-red/60 hover:bg-panel sm:grid-cols-[52px_240px_1fr] sm:gap-x-6"
      title="Нажмите, чтобы увидеть, как мигает красная лампа"
    >
      <span className="font-display text-2xl font-black leading-none text-red/90">{code}</span>
      <span className="flex items-center gap-3">
        <BlinkLed on={blinking} cycles={n} />
        <span className="font-body text-[13.5px] font-bold text-snow">{device}</span>
      </span>
      <span className="col-span-2 mt-1 font-mono text-[11px] leading-relaxed text-fog sm:col-span-1 sm:mt-0">{note}</span>
    </button>
  );
}

function BlinkLed({ on, cycles }: { on: boolean; cycles: number }) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!on) {
      setLit(false);
      return;
    }
    let i = 0;
    setLit(true);
    const iv = window.setInterval(() => {
      i++;
      if (i >= cycles * 2) {
        window.clearInterval(iv);
        setLit(false);
        return;
      }
      setLit((v) => !v);
    }, 500);
    return () => window.clearInterval(iv);
  }, [on, cycles]);
  return (
    <span className="relative flex h-3.5 w-3.5 flex-none items-center justify-center">
      {lit && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />}
      <span
        className={
          "relative inline-flex h-3 w-3 rounded-full border transition-colors duration-150 " +
          (lit ? "border-red bg-red shadow-[0_0_14px_rgba(255,107,107,0.9)]" : "border-red/40 bg-red/15")
        }
      />
    </span>
  );
}

function BlinkCodesSection() {
  return (
    <FadeIn delay={80}>
      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className="font-display text-4xl font-black leading-none text-red sm:text-5xl">ST</span>
        <div>
          <h2 className="font-display text-xl font-bold text-snow sm:text-2xl">Самотест при включении</h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-fog">
            При старте терминал проверяет все устройства. Всё исправно — buzzer подаёт{" "}
            <span className="font-semibold text-green">три коротких сигнала</span>. Если узел не работает — на дисплее
            предупреждение, а красная лампа мигает код из таблицы. Нажмите на строку — увидите, как это выглядит.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {BLINK_CODES.map((b) => (
          <BlinkCodeRow key={b.code} {...b} />
        ))}
      </div>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Лента порядка сборки                                                */
/* ------------------------------------------------------------------ */
const STEPS = [
  ["Закупить", "по ведомости комплектующих, пересчёт ×3 уже сделан"],
  ["Собрать", "по монтажной схеме: SPI-шины раздельно, I2C одна"],
  ["Прошить", "Talon32_Rubezh.ino на все три платы (Arduino Core 3.x)"],
  ["Запустить", "самотест мигнёт коды сбоев; роли — кнопкой 1,5 с или в панели"],
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

  /* Порядок комплекта: прошивка -> схема -> комплектующие -> библиотеки -> инструкция -> диагностика */
  const ALL_DOCS = useMemo<DocMeta[]>(() => {
    const by = (k: DocMeta["key"]) => DOCS.find((d) => d.key === k) as DocMeta;
    return [FIRMWARE_DOC, by("wiring"), by("bom"), by("libs"), by("guide"), by("diag")];
  }, []);

  const downloadAll = () => {
    ALL_DOCS.forEach((d, i) => {
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
              ТАЛОН 32<span className="text-amber"> · РУБЕЖ</span>
            </span>
            <span className="border border-line bg-panel/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fog">v2.0</span>
          </div>
          <span className="ml-auto hidden font-mono text-[10.5px] uppercase tracking-wider text-mist md:block">
            Ресепшен · Столовая · Ресторан
          </span>
          <button
            onClick={downloadAll}
            className="inline-flex items-center gap-2 border border-cyan/70 bg-cyan/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-cyan transition-all duration-200 hover:bg-cyan hover:text-ink hover:shadow-[0_0_24px_rgba(86,215,232,0.35)]"
          >
            {Icon.download}
            <span className="hidden sm:inline">Все 6 файлов</span>
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24">
        {/* открытие: чертёжный штамп */}
        <div className="grid gap-10 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <FadeIn>
            <div className="mb-5 inline-flex items-center gap-2 border border-line bg-panel/60 px-3 py-1.5">
              <span className="text-amber">{Icon.doc}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                Комплект сборки · v2.0 «Рубеж»
              </span>
            </div>
            <h1 className="font-display text-4xl font-black leading-[1.08] text-snow sm:text-5xl">
              Три терминала.
              <br />
              <span className="text-amber">Один рубеж</span>
              <br />
              контроля.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fog">
              Полный комплект v2.0: прошивка с самотестом устройств и раздельным входом администратор/оператор,
              схема соединения, ведомость комплектующих, список библиотек, пошаговая инструкция
              и диагностический скетч. Всё скачивается текстовыми файлами — печатайте и держите на верстаке.
            </p>
            <div className="mt-7 space-y-3">
              <FadeIn delay={120}>
                <FirmwareDirectLink file={FIRMWARE_DOC.file} text={FIRMWARE_DOC.text} />
              </FadeIn>
              <div className="flex flex-wrap items-center gap-3">
                <FadeIn delay={210}>
                  <DownloadButton file={GUIDE.file} text={GUIDE.text} />
                </FadeIn>
                <FadeIn delay={280}>
                  <DownloadButton file={WIRING.file} text={WIRING.text} />
                </FadeIn>
                <FadeIn delay={350}>
                  <button
                    onClick={downloadAll}
                    className="inline-flex items-center gap-2 border border-line px-5 py-2.5 font-mono text-[13px] font-semibold text-fog transition-all duration-200 hover:border-cyan hover:text-cyan"
                  >
                    {Icon.download}
                    Все 6 файлов
                  </button>
                </FadeIn>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-wider text-mist">
              <span><span className="text-amber">●</span> самотест: 6 кодов миганий</span>
              <span><span className="text-green">●</span> 2 роли: админ + оператор</span>
              <span><span className="text-cyan">●</span> 6 файлов комплекта</span>
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

        {/* самотест: коды миганий красной лампы */}
        <div className="mt-20">
          <BlinkCodesSection />
        </div>

        {/* документы комплекта */}
        <div className="mt-16 space-y-16">
          {ALL_DOCS.map((d, i) => (
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
            Талон 32 v2.0 «Рубеж» · RFID-учёт посетителей · 6 файлов комплекта
          </span>
          <span className="ml-auto font-mono text-[11px] text-mist">
            Arduino Core 3.x · ESP32 + RC522 + W5500 + hd44780 + DS3231
          </span>
        </div>
      </footer>

      {modal && <DocModal doc={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
