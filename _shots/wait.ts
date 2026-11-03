/** Poll until a selector matches, so the capture never races the first paint. */
export async function waitFor(selector: string, what: string, timeout = 10_000): Promise<void> {
  const started = performance.now();

  for (;;) {
    if (document.querySelector(selector)) return;

    if (performance.now() - started > timeout) {
      throw new Error(`timed out waiting for ${what} (${selector})`);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Two frames: one to lay the change out, one to paint it. */
export function paint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function ready(): void {
  document.documentElement.dataset.shotsReady = "1";
}
