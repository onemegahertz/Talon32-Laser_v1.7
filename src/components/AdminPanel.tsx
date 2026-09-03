import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_LOG, DEMO_CARDS, DEMO_DATES, EVENT_LABEL, SCHEDULE, LogRow } from "../data/site";
import { SectionHead, Reveal } from "../ui";
import { downloadText } from "../utils/download";

type Tab = "dash" | "log" | "report" | "cards" | "sched" | "net" | "sys";
const TABS: Array<{ id: Tab; t: string }> = [
  { id: "dash", t: "Дашборд" },
  { id: "log", t: "Журнал" },
  { id: "report", t: "Отчёты" },
  { id: "cards", t: "Карты" },
  { id: "sched", t: "Расписание" },
  { id: "net", t: "Сеть · Telegram · Почта" },
  { id: "sys", t: "Система" },
];

function pad2(x: number) { return x < 10 ? "0" + x : "" + x; }

function EventBadge({ ev }: { ev: string }) {
  const e = EVENT_LABEL[ev];
  const cls = e?.cls ?? "info";
  const map: Record<string, string> = {
    ok: "border-phos/50 text-phos bg-phos/10",
    bad: "border-alarm/50 text-alarm bg-alarm/10",
    warn: "border-amber/50 text-amber bg-amber/10",
    info: "border-ice/50 text-ice bg-ice/10",
  };
  return <span className={`whitespace-nowrap border px-2 py-0.5 text-[10.5px] font-semibold ${map[cls]}`}>{e?.t ?? ev}</span>;
}

// ---------- генерация отчётов (как в прошивке, но в браузере) ----------
function rowsInRange(from: string, to: string): LogRow[] {
  return DEMO_LOG.filter((r) => r.date >= from && r.date <= to);
}
function toCSV(rows: LogRow[]): string {
  let s = "\uFEFFДата;Время;Место;ID;UID;Имя;Период;Событие\r\n";
  rows.forEach((r) => {
    s += [r.date, r.time, r.place, r.id || "", r.uid, r.name, r.period, r.event].join(";") + "\r\n";
  });
  return s;
}
function toTXT(rows: LogRow[], from: string, to: string): string {
  let s = "ТАЛОН-32 v1.7 · Отчёт по посещениям\nПериод: " + from + " — " + to + " · Записей: " + rows.length + "\n" + "-".repeat(78) + "\n";
  rows.forEach((r) => {
    s += (r.date + " " + r.time).padEnd(20) + ("ID " + (r.id || "—")).padEnd(10) + r.name.padEnd(16) + r.place.padEnd(11) + (r.period || "—").padEnd(9) + r.event + "\n";
  });
  return s;
}
function toHTML(rows: LogRow[], from: string, to: string): string {
  const visits = rows.filter((r) => r.event === "VISIT");
  const byGuest = new Map<number, { name: string; count: number; periods: Set<string>; last: string }>();
  visits.forEach((r) => {
    const g = byGuest.get(r.id) ?? { name: r.name, count: 0, periods: new Set<string>(), last: "" };
    g.count++;
    g.periods.add(r.period + " (" + r.date + ")");
    g.last = r.date + " " + r.time;
    byGuest.set(r.id, g);
  });
  let guests = "";
  byGuest.forEach((g, id) => {
    guests += "<tr><td>" + id + "</td><td>" + g.name + "</td><td>" + g.count + "</td><td>" + [...g.periods].join(", ") + "</td><td>" + g.last + "</td></tr>";
  });
  let log = "";
  rows.forEach((r) => {
    const color = r.event === "VISIT" ? "#4ce08f" : r.event === "BREACH" ? "#ffb347" : r.event.startsWith("DENIED") ? "#ff6262" : "#62c8f7";
    log += "<tr><td>" + r.date + "</td><td>" + r.time + "</td><td>" + (r.id || "—") + "</td><td>" + r.name + "</td><td>" + r.uid + "</td><td>" + (r.period || "—") + "</td><td style='color:" + color + ";font-weight:600'>" + r.event + "</td></tr>";
  });
  return "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'><title>Талон-32 · Отчёт " + from + " — " + to + "</title><style>" +
    "body{font-family:'Segoe UI',Arial,sans-serif;background:#0e151c;color:#dce7f0;padding:32px}" +
    "h1{font-size:22px;margin:0}h2{color:#4ce08f;font-size:16px;margin:26px 0 10px}.sub{color:#8fa5b8;font-size:13px;margin:6px 0 22px}" +
    "table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px}th{background:#16222d;text-align:left;padding:8px 10px;border-bottom:2px solid #2a3d4e}" +
    "td{padding:7px 10px;border-bottom:1px solid #1e2c39}</style></head><body>" +
    "<h1>ТАЛОН-32 v1.7 — отчёт по посещениям</h1><div class='sub'>Период: " + from + " — " + to + " · Записей: " + rows.length + " · Посещений: " + visits.length + " · Гостей: " + byGuest.size + "</div>" +
    "<h2>Кто и когда посещал</h2><table><tr><th>ID</th><th>Гость</th><th>Посещений</th><th>Периоды (дата)</th><th>Последний визит</th></tr>" + guests + "</table>" +
    "<h2>Полный журнал</h2><table><tr><th>Дата</th><th>Время</th><th>ID</th><th>Гость</th><th>UID</th><th>Период</th><th>Событие</th></tr>" + log + "</table></body></html>";
}

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("dash");
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState("");
  const toastT = useRef<number | null>(null);

  // журнал
  const [logDate, setLogDate] = useState<string>(DEMO_DATES.today + "|" + DEMO_DATES.yesterday);
  const [logFilter, setLogFilter] = useState<string>("all");
  // отчёты
  const [repFrom, setRepFrom] = useState(DEMO_DATES.yesterday);
  const [repTo, setRepTo] = useState(DEMO_DATES.today);
  const [preview, setPreview] = useState<{ kind: "html" | "txt" | "csv"; text: string } | null>(null);
  // расписание (локальная копия)
  const [sched, setSched] = useState(SCHEDULE.map((p) => ({ from: p.from, to: p.to })));
  const [regLeft, setRegLeft] = useState(0);
  // план гостей и режим оператора (демо)
  const [plan, setPlan] = useState(120);
  const [opView, setOpView] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (regLeft <= 0) return;
    const t = window.setTimeout(() => setRegLeft((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
  }, [regLeft]);

  function say(m: string) {
    setToast(m);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(""), 2600);
  }

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (pass === "admin") { setAuthed(true); setErr(""); say("Добро пожаловать, администратор"); }
    else setErr("Неверный пароль. В прошивке пароль меняется во вкладке «Система».");
  }

  const todayRows = useMemo(() => DEMO_LOG.filter((r) => r.date === DEMO_DATES.today), []);
  const dash = useMemo(() => {
    const visits = todayRows.filter((r) => r.event === "VISIT");
    const guests = new Set(visits.map((r) => r.id)).size;
    const denied = todayRows.filter((r) => r.event.startsWith("DENIED")).length;
    const breach = todayRows.filter((r) => r.event === "BREACH").length;
    return { visits: visits.length, guests, denied, breach };
  }, [todayRows]);

  // проходы по залам (демо «столовая + ресторан» на одном экране)
  const hall = useMemo(() => {
    const v = todayRows.filter((r) => r.event === "VISIT");
    return {
      sto: v.filter((r) => r.place === "СТОЛОВАЯ").length,
      res: v.filter((r) => r.place === "РЕСТОРАН").length,
    };
  }, [todayRows]);

  const curPeriod = useMemo(() => {
    const m = now.getHours() * 60 + now.getMinutes();
    return SCHEDULE.find((p) => m >= p.fromMin && m < p.toMin) ?? null;
  }, [now]);

  const logRows = useMemo(() => {
    let rows = DEMO_LOG;
    if (logDate !== "all") {
      const dates = logDate.split("|");
      rows = rows.filter((r) => dates.includes(r.date));
    }
    if (logFilter !== "all") rows = rows.filter((r) => (logFilter === "visit" ? r.event === "VISIT" : logFilter === "denied" ? r.event.startsWith("DENIED") : r.event === "BREACH"));
    return [...rows].sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
  }, [logDate, logFilter]);

  const repRows = useMemo(() => rowsInRange(repFrom, repTo), [repFrom, repTo]);

  function download(kind: "html" | "csv" | "txt") {
    const text = kind === "html" ? toHTML(repRows, repFrom, repTo) : kind === "csv" ? toCSV(repRows) : toTXT(repRows, repFrom, repTo);
    const mime = kind === "csv" ? "text/csv;charset=utf-8" : kind === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8";
    void downloadText("talon32_report_" + repFrom + "_" + repTo + "." + kind, text, mime).then((r: import("../utils/download").DownloadResult) => {
      if (r === "cancelled") return;
      say(
        r === "copied"
          ? "Скачивание заблокировано окном-превью — отчёт скопирован в буфер обмена"
          : "Отчёт " + kind.toUpperCase() + " сформирован (" + repRows.length + " записей)"
      );
    });
  }

  return (
    <section id="admin" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHead
        index="04"
        kicker="Веб-интерфейс"
        tone="amber"
        title={<>Админ-панель: всё на одном экране</>}
        lead={<>Интерфейс живёт прямо в прошивке (ESP32 отдаёт его по HTTP) и защищён паролем: журналы, отчёты и настройки доступны только администратору. Ниже — <b className="text-snow">работающая демонстрация</b>: демо-пароль <span className="font-mono text-phos">admin</span>.</>}
      />

      <Reveal>
        <div className="border border-line bg-[#0d141b]" style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.4)" }}>
          {!authed ? (
            <form onSubmit={login} className="mx-auto flex max-w-sm flex-col items-stretch px-6 py-20">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center border border-line2 bg-panel">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ce08f" strokeWidth="2"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-snow">ТАЛОН-32 · вход</h3>
                <p className="mt-1 text-xs text-fog">http://192.168.1.77 · доступ только по паролю</p>
              </div>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Пароль (демо: admin)"
                className="mt-6 border border-line2 bg-panel px-4 py-3 font-mono text-sm text-snow outline-none placeholder:text-fog/50 focus:border-phos"
              />
              {err && <p className="mt-2 text-xs text-alarm">{err}</p>}
              <button type="submit" className="btn-phos mt-4 border border-phos bg-[#123524] py-3 font-mono text-xs font-bold uppercase tracking-widest text-phos">
                Войти
              </button>
            </form>
          ) : (
            <>
              {/* шапка панели */}
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel2/80 px-5 py-3.5">
                <span className="font-display text-sm font-bold text-snow">ТАЛОН-32</span>
                <span className="font-mono text-xs text-phos">v1.7</span>
                <span className="border border-line px-2.5 py-1 text-[11px] text-fog">СТОЛОВАЯ</span>
                <span className="border border-phos/50 px-2.5 py-1 font-mono text-[11px] text-phos">
                  {pad2(now.getHours())}:{pad2(now.getMinutes())}:{pad2(now.getSeconds())}
                </span>
                <span className="border border-line px-2.5 py-1 font-mono text-[11px] text-ice">Wi-Fi: 192.168.1.77</span>
                <span className="border border-line px-2.5 py-1 font-mono text-[11px] text-amber">Лазер: ОХРАНА</span>
                <span className="ml-auto flex items-center gap-3">
                  {regLeft > 0 && <span className="font-mono text-[11px] text-phos">регистрация карты: {regLeft} с</span>}
                  <button onClick={() => setAuthed(false)} className="border border-line2 px-3 py-1.5 text-[11px] font-semibold text-fog hover:text-snow">Выход</button>
                </span>
              </div>

              {/* вкладки */}
              <div className="flex flex-wrap gap-1.5 border-b border-line bg-panel px-4 py-3">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${tab === t.id ? "border border-phos bg-[#123524] text-phos" : "border border-transparent text-fog hover:border-line2 hover:text-snow"}`}
                  >
                    {t.t}
                  </button>
                ))}
              </div>

              <div className="p-5 sm:p-6">
                {/* ------- ДАШБОРД ------- */}
                {tab === "dash" && (
                  <div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        { k: "Посещений сегодня", v: dash.visits, tone: "text-phos" },
                        { k: "Уникальных гостей", v: dash.guests, tone: "text-phos" },
                        { k: "Отказов", v: dash.denied, tone: "text-alarm" },
                        { k: "Нарушений луча", v: dash.breach, tone: "text-amber" },
                      ].map((s) => (
                        <div key={s.k} className="border border-line bg-panel2/70 p-4">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-fog">{s.k}</div>
                          <div className={`mt-1 font-mono text-3xl font-bold ${s.tone}`}>{s.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Прошло сегодня + план */}
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                      <div className="border border-phos/40 bg-[#0d1710] p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-phos">Прошло сегодня (онлайн)</div>
                        <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-3">
                          <div>
                            <div className="font-mono text-4xl font-bold text-phos">{hall.sto}</div>
                            <div className="mt-1 text-[11px] text-fog">столовая</div>
                          </div>
                          <div>
                            <div className="font-mono text-4xl font-bold text-ice">{hall.res}</div>
                            <div className="mt-1 text-[11px] text-fog">ресторан</div>
                          </div>
                          <div className="ml-auto text-right">
                            <div className="font-mono text-4xl font-bold text-snow">{hall.sto + hall.res}</div>
                            <div className="mt-1 text-[11px] text-fog">всего проходов</div>
                          </div>
                        </div>
                      </div>
                      <div className="border border-line bg-panel2/70 p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-fog">План гостей на сегодня (справочно)</div>
                        <div className="mt-3 flex items-center gap-3">
                          <input type="number" min={0} value={plan}
                            onChange={(e) => setPlan(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-24 border border-line2 bg-panel px-3 py-2 font-mono text-lg text-snow outline-none focus:border-phos" />
                          <button onClick={() => say("План сохранён (демо): " + plan)}
                            className="border border-line2 px-4 py-2 font-mono text-[11px] font-bold uppercase text-snow hover:border-fog">Сохранить</button>
                        </div>
                        <div className="mt-3 text-[12px] text-fog">
                          Осталось по плану:{" "}
                          <span className="font-mono font-bold text-phos">{Math.max(0, plan - dash.guests)}</span>
                          <span className="ml-2 text-fog/60">(план − уникальные гости)</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                      <div className="border border-line bg-panel2/70 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-fog">Текущий период</span>
                          <span className="font-mono text-[11px] text-fog">{curPeriod ? curPeriod.from + "–" + curPeriod.to : "вне окон"}</span>
                        </div>
                        <div className="mt-3 space-y-2.5">
                          {SCHEDULE.map((p) => {
                            const m = now.getHours() * 60 + now.getMinutes();
                            const pct = Math.max(0, Math.min(1, (m - p.fromMin) / (p.toMin - p.fromMin)));
                            const active = m >= p.fromMin && m < p.toMin;
                            return (
                              <div key={p.key}>
                                <div className="flex justify-between font-mono text-[11px]">
                                  <span style={{ color: active ? p.color : "#8fa5b8" }}>{p.name}{active ? " · идёт" : ""}</span>
                                  <span className="text-fog/60">{Math.round((active ? pct : m >= p.toMin ? 1 : 0) * 100)}%</span>
                                </div>
                                <div className="mt-1 h-1.5 bg-ink">
                                  <div className="h-full transition-all duration-1000" style={{ width: `${(active ? pct : m >= p.toMin ? 1 : 0) * 100}%`, background: p.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="border border-line bg-panel2/70 p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-fog">Последние события</div>
                        <div className="mt-3 space-y-2">
                          {todayRows.slice(0, 5).map((r, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                              <span className="font-mono text-fog/60">{r.time}</span>
                              <span className="flex-1 truncate text-snow">{r.name} · {r.place}</span>
                              <EventBadge ev={r.event} />
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-fog">
                          второй терминал: 192.168.1.78 — <span className="text-phos">НА СВЯЗИ</span><br />
                          аптайм 14:22:07 · ОЗУ 211 КБ · RTC синхронизирован
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ------- ЖУРНАЛ ------- */}
                {tab === "log" && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: DEMO_DATES.today + "|" + DEMO_DATES.yesterday, t: "2 дня" },
                        { id: DEMO_DATES.today, t: "Сегодня" },
                        { id: DEMO_DATES.yesterday, t: "Вчера" },
                        { id: "all", t: "Все" },
                      ].map((o) => (
                        <button key={o.id} onClick={() => setLogDate(o.id)}
                          className={`px-3 py-1.5 font-mono text-[11px] ${logDate === o.id ? "border border-ice text-ice" : "border border-line text-fog hover:text-snow"}`}>
                          {o.t}
                        </button>
                      ))}
                      <span className="mx-2 h-5 w-px bg-line2" />
                      {[
                        { id: "all", t: "Все события" },
                        { id: "visit", t: "Посещения" },
                        { id: "denied", t: "Отказы" },
                        { id: "breach", t: "Нарушения" },
                      ].map((o) => (
                        <button key={o.id} onClick={() => setLogFilter(o.id)}
                          className={`px-3 py-1.5 font-mono text-[11px] ${logFilter === o.id ? "border border-amber text-amber" : "border border-line text-fog hover:text-snow"}`}>
                          {o.t}
                        </button>
                      ))}
                      <span className="ml-auto font-mono text-[11px] text-fog">{logRows.length} записей</span>
                    </div>
                    <div className="code-scroll mt-4 max-h-[46vh] overflow-auto border border-line">
                      <table className="w-full text-[12.5px]">
                        <thead className="sticky top-0 bg-panel2">
                          <tr className="text-left text-[10px] uppercase tracking-widest text-fog">
                            <th className="px-3 py-2.5">Дата</th><th className="px-3 py-2.5">Время</th><th className="px-3 py-2.5">ID</th>
                            <th className="px-3 py-2.5">Гость</th><th className="px-3 py-2.5">UID</th><th className="px-3 py-2.5">Место</th>
                            <th className="px-3 py-2.5">Период</th><th className="px-3 py-2.5">Событие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logRows.map((r, i) => (
                            <tr key={i} className="border-t border-line/60 transition-colors hover:bg-panel2/80">
                              <td className="px-3 py-2 font-mono text-fog">{r.date}</td>
                              <td className="px-3 py-2 font-mono text-snow">{r.time}</td>
                              <td className="px-3 py-2 font-mono text-ice">{r.id || "—"}</td>
                              <td className="px-3 py-2 text-snow">{r.name}</td>
                              <td className="px-3 py-2 font-mono text-fog">{r.uid}</td>
                              <td className="px-3 py-2">{r.place === "СТОЛОВАЯ" ? <span className="text-phos">{r.place}</span> : <span className="text-ice">{r.place}</span>}</td>
                              <td className="px-3 py-2 text-fog">{r.period || "—"}</td>
                              <td className="px-3 py-2"><EventBadge ev={r.event} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ------- ОТЧЁТЫ ------- */}
                {tab === "report" && (
                  <div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-widest text-fog">С даты</span>
                        <input type="date" value={repFrom} max={DEMO_DATES.today} onChange={(e) => setRepFrom(e.target.value)}
                          className="mt-1 block border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-widest text-fog">По дату</span>
                        <input type="date" value={repTo} max={DEMO_DATES.today} onChange={(e) => setRepTo(e.target.value)}
                          className="mt-1 block border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      </label>
                      <span className="pb-2.5 font-mono text-xs text-fog">найдено: <b className="text-snow">{repRows.length}</b></span>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {([
                        ["html", "HTML", "красивый отчёт: сводка по гостям + полный журнал"],
                        ["csv", "CSV", "для Excel / Telegram-бота (с BOM, разделитель «;»)"],
                        ["txt", "TXT", "плоский текстовый журнал"],
                      ] as Array<["html" | "csv" | "txt", string, string]>).map(([f, t, d]) => (
                        <div key={f} className="card-lift border border-line bg-panel2/70 p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-lg font-bold text-snow">{t}</span>
                            <span className="border border-line px-2 py-0.5 font-mono text-[10px] text-fog">{repRows.length} строк</span>
                          </div>
                          <p className="mt-2 min-h-[36px] text-[12px] leading-snug text-fog">{d}</p>
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => setPreview({ kind: f, text: f === "html" ? toHTML(repRows, repFrom, repTo) : f === "csv" ? toCSV(repRows) : toTXT(repRows, repFrom, repTo) })}
                              className="flex-1 border border-line2 py-2 font-mono text-[11px] font-bold uppercase text-snow hover:border-fog">
                              Предпросмотр
                            </button>
                            <button onClick={() => download(f)}
                              className="flex-1 border border-phos bg-[#123524] py-2 font-mono text-[11px] font-bold uppercase text-phos">
                              Скачать
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 font-mono text-[11px] leading-relaxed text-fog/80">
                      На реальном терминале отчёты строятся из журнала LittleFS за произвольный период (до 62 дней) и отдаются
                      только авторизованной сессии. Telegram-бот дублирует CSV командой /report, суточный HTML уходит на почту.
                    </p>
                  </div>
                )}

                {/* ------- КАРТЫ ------- */}
                {tab === "cards" && (
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => { setRegLeft(5); say("Режим регистрации открыт на 5 секунд — поднесите карту к терминалу"); }}
                        className="btn-phos border border-phos bg-[#123524] px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-phos">
                        ● Режим регистрации (5 с)
                      </button>
                      <span className="text-[12px] text-fog">Нумерация сквозная (1, 2, 3…) и не зависит от зала. Контроль «одно место за период» — по уникальному UID карты.</span>
                    </div>
                    <div className="mt-4 overflow-x-auto border border-line">
                      <table className="w-full text-[12.5px]">
                        <thead className="bg-panel2">
                          <tr className="text-left text-[10px] uppercase tracking-widest text-fog">
                            <th className="px-3 py-2.5">ID</th><th className="px-3 py-2.5">UID карты</th><th className="px-3 py-2.5">Имя</th>
                            <th className="px-3 py-2.5">Роль</th><th className="px-3 py-2.5">Привязка</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DEMO_CARDS.map((c) => (
                            <tr key={c.uid} className="border-t border-line/60 hover:bg-panel2/80">
                              <td className="px-3 py-2 font-mono text-ice">{c.id || "—"}</td>
                              <td className="px-3 py-2 font-mono text-snow">{c.uid}</td>
                              <td className="px-3 py-2">{c.name}</td>
                              <td className="px-3 py-2">
                                {c.role === "админ"
                                  ? <span className="border border-amber/50 bg-amber/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber">админ</span>
                                  : <span className="border border-ice/50 bg-ice/10 px-2 py-0.5 text-[10.5px] font-semibold text-ice">гость</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-fog">{c.hall}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-[12px] text-fog">Админ-карта открывает сервисный режим касанием: антиповтор её не глушит (фикс v1.7). UID длиной 4, 7 и 10 байт поддерживаются.</p>
                  </div>
                )}

                {/* ------- РАСПИСАНИЕ ------- */}
                {tab === "sched" && (
                  <div className="max-w-2xl">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {SCHEDULE.map((p, i) => (
                        <div key={p.key} className="border border-line bg-panel2/70 p-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                            <span className="font-display text-xs font-bold uppercase tracking-wider text-snow">{p.name}</span>
                          </div>
                          <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">с</label>
                          <input type="time" value={sched[i].from}
                            onChange={(e) => setSched((s) => s.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)))}
                            className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                          <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">по</label>
                          <input type="time" value={sched[i].to}
                            onChange={(e) => setSched((s) => s.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)))}
                            className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button onClick={() => say("Расписание сохранено в NVS терминала (демо)")}
                        className="btn-phos border border-phos bg-[#123524] px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-phos">
                        Сохранить расписание
                      </button>
                      <span className="text-[12px] text-fog">Применяется мгновенно, без перезагрузки.</span>
                    </div>
                  </div>
                )}

                {/* ------- СЕТЬ ------- */}
                {tab === "net" && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="border border-line bg-panel2/70 p-4">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-snow">Wi-Fi</h4>
                      <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">SSID</label>
                      <input defaultValue="Hotel_Guest" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Пароль (пусто = не менять)</label>
                      <input type="password" placeholder="••••••••" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none placeholder:text-fog/40 focus:border-phos" />
                      <p className="mt-2 text-[11px] leading-relaxed text-fog">При потере сети — автопереподключение; через 15 с безуспешных попыток поднимается точка <span className="font-mono text-amber">Talon32-Setup</span> с WPA2-паролем — LCD сообщает имя точки и пароль.</p>
                      <button onClick={() => say("Wi-Fi сохранён, идёт переподключение (демо)")} className="btn-phos mt-3 border border-line2 px-4 py-2 font-mono text-[11px] font-bold uppercase text-snow hover:border-fog">Сохранить сеть</button>
                    </div>
                    <div className="border border-line bg-panel2/70 p-4">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider" style={{ color: "#c792ea" }}>Ethernet W5500 и точка доступа</h4>
                      <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">Основной канал</label>
                      <select className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos">
                        <option>Авто: Ethernet → Wi-Fi → точка</option>
                        <option>Только Wi-Fi</option>
                        <option>Только Ethernet (фолбэк на Wi-Fi)</option>
                      </select>
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Адрес Ethernet</label>
                      <select className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos">
                        <option>DHCP (автоматически)</option>
                        <option>Статический: 192.168.1.77 / 255.255.255.0 / 192.168.1.1</option>
                      </select>
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Пароль точки доступа (8–63 символа)</label>
                      <input type="password" defaultValue="talon3232" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      <p className="mt-2 text-[11px] leading-relaxed text-fog">Смена канала и статики применяется перезагрузкой — терминал делает её сам. При ошибке Ethernet автоматически включается Wi-Fi, затем точка доступа.</p>
                      <button onClick={() => say("Сохранено. Терминал перезагружается для применения (демо)")} className="btn-phos mt-3 border border-line2 px-4 py-2 font-mono text-[11px] font-bold uppercase text-snow hover:border-fog">Сохранить</button>
                    </div>
                    <div className="border border-line bg-panel2/70 p-4">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-snow">Сверка терминалов и время</h4>
                      <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">IP второго терминала</label>
                      <input defaultValue="192.168.1.78" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Часовой пояс (мин от UTC, МСК = 180)</label>
                      <input defaultValue="180" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Зал</label>
                      <select className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos">
                        <option>СТОЛОВАЯ — контроль прохода</option>
                        <option>РЕСТОРАН — контроль прохода</option>
                        <option>РЕСЕПШЕН — выдача карт + мониторинг</option>
                      </select>
                      <button onClick={() => say("Параметры сохранены в NVS (демо)")} className="btn-phos mt-3 border border-line2 px-4 py-2 font-mono text-[11px] font-bold uppercase text-snow hover:border-fog">Сохранить</button>
                    </div>
                    <div className="border border-line bg-panel2/70 p-4">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ice">Telegram-бот</h4>
                      <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">Токен от @BotFather</label>
                      <input placeholder="123456789:AAE…" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none placeholder:text-fog/40 focus:border-phos" />
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Chat ID администратора</label>
                      <input placeholder="987654321" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none placeholder:text-fog/40 focus:border-phos" />
                      <button onClick={() => say("Тестовое сообщение отправлено (демо)")} className="btn-phos mt-3 border border-ice/60 bg-[#0f2431] px-4 py-2 font-mono text-[11px] font-bold uppercase text-ice">Тест</button>
                    </div>
                    <div className="border border-line bg-panel2/70 p-4">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-amber">Почта администратора (SMTP2GO)</h4>
                      <label className="mt-3 block text-[10px] uppercase tracking-widest text-fog">API-ключ</label>
                      <input type="password" placeholder="key-…" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none placeholder:text-fog/40 focus:border-phos" />
                      <label className="mt-2 block text-[10px] uppercase tracking-widest text-fog">Кому (адрес можно менять)</label>
                      <input defaultValue="admin@hotel.local" className="mt-1 w-full border border-line2 bg-panel px-3 py-2 font-mono text-sm text-snow outline-none focus:border-phos" />
                      <p className="mt-2 text-[11px] text-fog">Суточный HTML-отчёт уходит автоматически в 21:00 (время настраивается в прошивке).</p>
                      <button onClick={() => say("Почтовые настройки сохранены (демо)")} className="btn-phos mt-3 border border-amber/60 bg-[#241a0c] px-4 py-2 font-mono text-[11px] font-bold uppercase text-amber">Сохранить</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Reveal>

      {/* превью отчёта */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[86vh] w-full max-w-4xl border border-line2 bg-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line bg-panel2 px-4 py-2.5">
              <span className="font-mono text-xs text-fog">Предпросмотр · talon32_report.{preview.kind}</span>
              <button onClick={() => setPreview(null)} className="border border-line2 px-3 py-1 font-mono text-xs text-snow hover:border-alarm hover:text-alarm">Закрыть ✕</button>
            </div>
            <div className="code-scroll max-h-[74vh] overflow-auto">
              {preview.kind === "html"
                ? <iframe title="Отчёт" sandbox="" srcDoc={preview.text} className="h-[72vh] w-full border-0 bg-[#0e151c]" />
                : <pre className="whitespace-pre px-5 py-4 font-mono text-[12px] leading-relaxed text-snow">{preview.text}</pre>}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border border-phos/60 bg-[#0d1710] px-5 py-3 font-mono text-xs text-phos" style={{ boxShadow: "0 10px 40px rgba(0,0,0,.5)" }}>
          {toast}
        </div>
      )}
    </section>
  );
}
