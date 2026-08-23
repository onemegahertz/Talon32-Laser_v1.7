--- src/App.tsx (原始)
export default function App() {
  return (
    <div/>
  );
}


+++ src/App.tsx (修改后)
import { useEffect, useState } from "react";
import Opening from "./components/Opening";
import HowItWorks from "./components/HowItWorks";
import Hardware from "./components/Hardware";
import FirmwareSection, { useDownloadFirmware } from "./components/FirmwareSection";
import AdminPanel from "./components/AdminPanel";
import Comms from "./components/Comms";
import Docs from "./components/Docs";

const NAV = [
  { id: "terminal", t: "Терминал" },
  { id: "logic", t: "Логика" },
  { id: "parts", t: "Железо" },
  { id: "firmware", t: "Прошивка" },
  { id: "admin", t: "Админ-панель" },
  { id: "telegram", t: "Telegram" },
  { id: "flash", t: "Запуск" },
  { id: "audit", t: "Аудит" },
];

function Nav({ onDownload }: { onDownload: () => void }) {
  const [active, setActive] = useState("terminal");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-38% 0px -55% 0px" }
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "border-line bg-ink/92 backdrop-blur-md" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 sm:px-8">
        <a href="#terminal" className="flex items-baseline gap-2">
          <span className="font-display text-[15px] font-black tracking-tight text-snow">ТАЛОН-32</span>
          <span className="font-mono text-[11px] font-bold text-phos">v1.7</span>
        </a>
        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={"#" + n.id}
              className={`px-3 py-2 font-mono text-[11.5px] uppercase tracking-wider transition-colors ${
                active === n.id ? "text-phos" : "text-fog hover:text-snow"
              }`}
            >
              {n.t}
            </a>
          ))}
        </nav>
        <button
          onClick={onDownload}
          className="btn-phos ml-auto hidden border border-phos bg-[#123524] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-phos lg:ml-3 lg:block"
        >
          ↓ .ino
        </button>
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto border border-line2 p-2 text-snow lg:hidden"
          aria-label="Меню"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-ink/97 px-5 py-3 backdrop-blur-md lg:hidden">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={"#" + n.id}
              onClick={() => setOpen(false)}
              className="block border-b border-line/50 py-2.5 font-mono text-xs uppercase tracking-wider text-fog last:border-0"
            >
              {n.t}
            </a>
          ))}
          <button
            onClick={() => { setOpen(false); onDownload(); }}
            className="mt-3 w-full border border-phos bg-[#123524] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-phos"
          >
            ↓ Скачать Talon32.ino
          </button>
        </div>
      )}
    </header>
  );
}

export default function App() {
  const download = useDownloadFirmware();

  return (
    <div className="relative min-h-screen">
      <div className="bg-stage" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div className="bg-noise" aria-hidden />
      <Nav onDownload={download} />
      <main>
        <Opening onDownload={download} />
        <div className="hair mx-auto max-w-7xl" />
        <HowItWorks />
        <div className="hair mx-auto max-w-7xl" />
        <Hardware />
        <div className="hair mx-auto max-w-7xl" />
        <FirmwareSection />
        <div className="hair mx-auto max-w-7xl" />
        <AdminPanel />
        <div className="hair mx-auto max-w-7xl" />
        <Comms />
        <div className="hair mx-auto max-w-7xl" />
        <Docs />
      </main>
    </div>
  );
}
