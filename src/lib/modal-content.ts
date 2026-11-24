export function observeModalHeight(
  elements: (HTMLElement | null)[],
  fitWindow: (height: number) => Promise<void>,
  beforeMeasure?: () => void,
) {
  const parts = elements.filter((element) => element !== null);
  let lastHeight = 0;
  let frame = 0;

  function measureAndFit() {
    beforeMeasure?.();
    const height = Math.ceil(parts.reduce((sum, part) => sum + part.getBoundingClientRect().height, 0));
    if (height <= 0 || height === lastHeight) return;
    lastHeight = height;
    void fitWindow(height).catch((error) => {
      if (lastHeight === height) lastHeight = 0;
      console.error("failed to fit modal window", error);
    });
  }

  // The initial fit reveals the window. A hidden WebView may never deliver
  // ResizeObserver callbacks or animation frames until it is shown.
  measureAndFit();
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measureAndFit);
  });
  for (const part of parts) observer.observe(part);
  return {
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

export function usesNativeModalFrame() {
  return new URLSearchParams(window.location.search).has("native-frame");
}
