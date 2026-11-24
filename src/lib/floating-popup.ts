/** Keep a non-modal popup anchored and close it when interaction leaves its field. */
export function watchFloatingPopup(
  root: HTMLElement,
  dismiss: () => void,
  close: () => void,
  place: () => void,
) {
  function outside(event: PointerEvent | FocusEvent) {
    const target = event instanceof FocusEvent ? event.relatedTarget : event.target;
    if (target instanceof Node && !root.contains(target)) dismiss();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  root.addEventListener("keydown", onKeydown);
  root.addEventListener("focusout", outside);
  document.addEventListener("pointerdown", outside);
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);

  return () => {
    root.removeEventListener("keydown", onKeydown);
    root.removeEventListener("focusout", outside);
    document.removeEventListener("pointerdown", outside);
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
  };
}
