/** A grid wraps horizontally within its row and vertically within its column. */
export function nextRadioIndex(key: string, index: number, count: number, columns?: number): number | null {
  if (count === 0 || index < 0 || index >= count) return null;

  const wrap = (value: number) => (value + count) % count;
  const rowStart = columns ? Math.floor(index / columns) * columns : 0;
  const rowLength = columns ? Math.min(columns, count - rowStart) : count;

  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowLeft":
      return rowStart + ((index - rowStart + rowLength - 1) % rowLength);
    case "ArrowRight":
      return rowStart + ((index - rowStart + 1) % rowLength);
    case "ArrowUp":
      return wrap(index - (columns ?? 1));
    case "ArrowDown":
      return wrap(index + (columns ?? 1));
    default:
      return null;
  }
}

/** Roving tabindex is bound to the selected value by the component. */
export function radioGroup(group: HTMLElement, columns?: number) {
  let width = columns;

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    const radios = [...group.querySelectorAll<HTMLButtonElement>("button[role='radio']:not(:disabled)")];
    const index = radios.indexOf(group.ownerDocument.activeElement as HTMLButtonElement);
    // Arrow keys follow the visual order, including right-to-left locales.
    const rtl = group.ownerDocument.defaultView?.getComputedStyle(group).direction === "rtl";
    let key = event.key;
    if (rtl && key === "ArrowLeft") key = "ArrowRight";
    else if (rtl && key === "ArrowRight") key = "ArrowLeft";

    const next = nextRadioIndex(key, index, radios.length, width);
    if (next === null) return;

    event.preventDefault();
    radios[next].focus();
    radios[next].click();
  }

  group.addEventListener("keydown", onKeydown);
  return {
    update(columns?: number) {
      width = columns;
    },
    destroy() {
      group.removeEventListener("keydown", onKeydown);
    },
  };
}
