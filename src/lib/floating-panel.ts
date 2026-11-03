interface Anchor {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

/** Fit an anchored panel inside the viewport, opening above when necessary. */
export function floatingPanel(
  anchor: Anchor,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const margin = 8;
  const width = Math.min(anchor.width, Math.max(1, viewportWidth - margin * 2));
  const maxHeight = Math.max(1, viewportHeight - margin * 2);
  const height = Math.min(panelHeight, maxHeight);
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - margin - width));
  const below = anchor.bottom + 4;
  const top = Math.max(
    margin,
    Math.min(
      below + height <= viewportHeight - margin ? below : anchor.top - height - 4,
      viewportHeight - margin - height,
    ),
  );
  return { top, left, width, maxHeight };
}
