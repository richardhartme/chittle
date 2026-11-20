"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const svg = { "aria-hidden": true, viewBox: "0 0 24 24", width: 22, height: 22 } as const;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" } as const;

/**
 * The signed-in links. On narrow screens globals.css hides them behind a menu button, which opens
 * them in a panel under the header. The panel closes on a link, Escape, a tap outside it, or a
 * change of page.
 */
export function NavMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The page the menu was opened on, so moving to another page (back included) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <nav ref={ref} className="site-nav" data-open={open || undefined}>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-nav-links"
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {open ? (
          <svg {...svg}>
            <path d="M6 6l12 12M18 6L6 18" {...stroke} />
          </svg>
        ) : (
          <svg {...svg}>
            <path d="M4 7h16M4 12h16M4 17h16" {...stroke} />
          </svg>
        )}
        <span className="sr-only">Menu</span>
      </button>
      <div
        id="site-nav-links"
        className="nav-links"
        // A link to the page already showing doesn't change the pathname, so close on any link.
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpenOn(null);
        }}
      >
        {children}
      </div>
    </nav>
  );
}
