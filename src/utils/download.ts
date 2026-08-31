// Утилиты скачивания файлов из браузера.
// Проблема: когда сайт открыт внутри iframe (превью-окно, песочница),
// браузер ТИХО блокирует переходы по ссылке с атрибутом download —
// клик отрабатывает, но файл не сохраняется, и никакой ошибки нет.
// Решение: многоуровневая стратегия + обязательная обратная связь:
//   1) вне iframe — классический anchor-download (как раньше);
//   2) внутри iframe — диалог «Сохранить как» (File System Access API,
//      Chrome/Edge), если недоступен — anchor + автоматическое
//      копирование текста в буфер, чтобы пользователь не потерял данные;
//   3) результат всегда возвращается вызывающему коду для показа статуса.

export type DownloadResult = "saved" | "started" | "copied" | "cancelled";

/** Открыта ли страница внутри iframe (превью/песочница). */
export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // доступ к top запрещён — точно iframe
  }
}

/** Надёжное копирование текста (Clipboard API → execCommand). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface SaveFileHandle {
  createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
}

/**
 * Скачать текстовый файл. Возвращает фактический результат:
 *  - "saved"     — файл сохранён через диалог «Сохранить как»;
 *  - "started"   — запущено классическое скачивание (браузер сам сохранит);
 *  - "copied"    — скачивание заблокировано окном-песочницей, текст
 *                  автоматически скопирован в буфер обмена;
 *  - "cancelled" — пользователь отменил диалог сохранения.
 */
export async function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8"
): Promise<DownloadResult> {
  const frame = inIframe();

  // 1) Внутри iframe пробуем диалог «Сохранить как» (Chrome/Edge):
  //    он работает там, где download-атрибут молча блокируется.
  if (frame) {
    const w = window as unknown as {
      showSaveFilePicker?: (opts: unknown) => Promise<SaveFileHandle>;
    };
    if (typeof w.showSaveFilePicker === "function") {
      try {
        const ext = "." + (filename.split(".").pop() ?? "txt");
        const handle = await w.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: filename, accept: { [mime.split(";")[0]]: [ext] } }],
        });
        const ws = await handle.createWritable();
        await ws.write(text);
        await ws.close();
        return "saved";
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return "cancelled";
        // недоступно в песочнице — уходим на следующую стратегию
      }
    }
  }

  // 2) Классический anchor-download (работает во всех браузерах вне iframe).
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a); // без добавления в DOM Firefox не качает
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  // 3) В iframe скачивание почти наверняка заблокировано — страхуемся
  //    копированием в буфер и сообщаем об этом вызывающему коду.
  if (frame) {
    const ok = await copyText(text);
    return ok ? "copied" : "started";
  }
  return "started";
}
