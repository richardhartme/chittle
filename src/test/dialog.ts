/**
 * jsdom has no `<dialog>` behaviour, so this stands in for the browser's: `showModal()` opens it and
 * focuses inside, `close()` shuts it and fires `close` a task later, as browsers do (without restoring
 * focus, which is left to the page), and Esc fires a cancelable `cancel` before closing the open one.
 */
export function installDialog() {
  const proto = HTMLDialogElement.prototype;
  if ("showModal" in proto && typeof proto.showModal === "function") return;

  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Like the browser, move focus to the first focusable element inside.
    this.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]")?.focus();
  };
  proto.show = proto.showModal;
  proto.close = function (this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute("open");
    setTimeout(() => this.dispatchEvent(new Event("close")));
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const dialog = [...document.querySelectorAll("dialog[open]")].at(-1) as HTMLDialogElement | undefined;
    if (dialog && dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
  });
}
