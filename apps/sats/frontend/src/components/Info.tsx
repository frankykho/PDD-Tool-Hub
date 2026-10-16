import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Small "i" button with an explanation. Hover or keyboard focus on desktop, tap on phones.
 * Rendered in a portal with fixed positioning, so it is never clipped by scrolling tables.
 */
export default function Info({ children, label = "Penjelasan" }: { children: ReactNode; label?: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false });

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    const above = r.bottom + 160 > window.innerHeight && r.top > 180;
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const show = () => {
    place();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="info-btn"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className={`info-pop ${pos.above ? "above" : ""}`}
            style={{ left: pos.left, top: pos.top, width: Math.min(300, window.innerWidth - 16) }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Label + info button, keeps them on one line. */
export function WithInfo({ children, info }: { children: ReactNode; info: ReactNode }) {
  return (
    <span className="with-info">
      {children}
      <Info>{info}</Info>
    </span>
  );
}
