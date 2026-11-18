"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * A native `<dialog>` drawer's state. `open(value)` shows it with `value` (what to show in it), and
 * `onClosed(value)` runs once it has closed, to return focus to whatever opened it. Spread
 * `dialogProps` onto the `<dialog>`; it closes on Esc, from `close()` and from a click on the backdrop.
 */
export function useDrawer<T>(onClosed: (value: T) => void) {
  // A new object on every open, so reopening straight after closing reruns the effect even if a late `close` is pending.
  const [opened, setOpened] = useState<{ value: T } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (opened) dialog.current?.showModal();
  }, [opened]);

  return {
    value: opened?.value ?? null,
    open: (value: T) => setOpened({ value }),
    close: () => dialog.current?.close(),
    dialogProps: {
      ref: dialog,
      onClose() {
        // Browsers fire `close` after a task, so it can arrive once the drawer has already been reopened.
        if (dialog.current?.open) return;
        if (opened) onClosed(opened.value);
        setOpened(null);
      },
      // A click on the dialog itself, not its contents, is a click on the backdrop.
      onClick(event: MouseEvent<HTMLDialogElement>) {
        if (event.target === event.currentTarget) event.currentTarget.close();
      },
    },
  };
}

export function DrawerCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="drawer-close" aria-label="Close" onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
        <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
