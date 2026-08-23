--- src/ui.tsx (原始)


+++ src/ui.tsx (修改后)
import React, { useEffect, useRef, useState } from "react";

export function usePRM(): boolean {
  const [prm, setPrm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrm(mq.matches);
    const fn = (e: MediaQueryListEvent) => setPrm(e.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return prm;
}

/** Обёртка scroll-reveal на IntersectionObserver */
export function Reveal({
  children,
  dir = "up",
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  dir?: "up" | "left" | "right";
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const dcls = dir === "left" ? "rv rv-l" : dir === "right" ? "rv rv-r" : "rv";
  return (
    <Tag ref={ref as never} className={`${dcls} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}

const GLYPHS = "█▓▒░<>/\\|=+*#01";

/** Scramble-декодирование строки при появлении */
export function useScramble(text: string, speed = 28) {
  const prm = usePRM();
  const [out, setOut] = useState(prm ? text : "");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (prm) {
      setOut(text);
      return;
    }
    let frame = 0;
    let raf = 0;
    let started = false;
    const total = text.length * 3;
    const step = () => {
      frame++;
      const fixed = Math.floor((frame / total) * text.length * 1.4);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        if (text[i] === " " || text[i] === "-" || i < fixed) s += text[i];
        else s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (fixed < text.length) raf = requestAnimationFrame(step);
      else setOut(text);
    };
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting && !started) {
            started = true;
            raf = requestAnimationFrame(step);
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    const t = setInterval(() => {
      if (started) clearInterval(t);
    }, speed * 10);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prm]);
  return { out, ref };
}

export function Kicker({ children, tone = "phos" }: { children: React.ReactNode; tone?: "phos" | "amber" | "ice" | "alarm" }) {
  const c =
    tone === "amber" ? "text-amber border-[#5c431f]" :
    tone === "ice" ? "text-ice border-[#1f4a5c]" :
    tone === "alarm" ? "text-alarm border-[#5c2323]" :
    "text-phos border-[#1f5c3a]";
  return (
    <div className={`inline-flex items-center gap-2 border ${c} bg-panel2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.22em]`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </div>
  );
}

export function SectionHead({
  index,
  kicker,
  title,
  tone,
  lead,
}: {
  index: string;
  kicker: string;
  title: React.ReactNode;
  tone?: "phos" | "amber" | "ice" | "alarm";
  lead?: React.ReactNode;
}) {
  return (
    <div className="mb-10 md:mb-14">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm text-fog/70">{index}</span>
        <Kicker tone={tone}>{kicker}</Kicker>
      </div>
      <Reveal className="lm mt-4">
        <span>
          <h2 className="font-display text-[26px] leading-[1.12] font-bold text-snow sm:text-4xl lg:text-[44px]">
            {title}
          </h2>
        </span>
      </Reveal>
      {lead && <Reveal delay={120}><p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fog">{lead}</p></Reveal>}
    </div>
  );
}

export function Stat({ k, v, tone = "" }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="border border-line bg-panel2/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-fog">{k}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${tone}`}>{v}</div>
    </div>
  );
}
