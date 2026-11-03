/** Suppress the webview's default right-click menu, keeping it available for
 * text editing targets (paste/select inside inputs and textareas). */
export function disableContextMenu(): void {
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;

    if (target?.closest("input, textarea, [contenteditable='true']")) return;

    e.preventDefault();
  });
}
