/**
 * Toolbar layout decision.
 *
 * The bar must never spill a button onto a third row. Fixed media-query
 * thresholds cannot guarantee that: the width of "Import"/"Export" depends on
 * the locale and on the rendered font, so the same window width can fit in one
 * language and overflow in another. Instead the component measures the natural
 * widths of every part (an off-screen probe renders the same markup) and this
 * pure function picks the densest layout that still fits.
 *
 * The view tabs and the window's caption buttons live in the title strip
 * above, so the bar itself holds the app's actions only.
 *
 * Priority: keep everything on one row while it fits, then move search below,
 * drop the New reminder label, and finally drop the Import/Export labels.
 * ioWithLabels and ioIcons include the gap between the two buttons.
 */

export interface ToolbarLayoutMetrics {
  /** Usable width of the bar: content box, padding excluded. */
  available: number;
  /** Flex gap between two neighbouring parts. */
  gap: number;
  /** Smallest search field that is still usable. */
  search: number;
  /** "New reminder" button with its label. */
  newWithLabel: number;
  /** "New reminder" button as an icon-only square. */
  newIcon: number;
  /** Import + Export buttons with labels. */
  ioWithLabels: number;
  /** Import + Export buttons as icon-only squares. */
  ioIcons: number;
  /** The settings icon button. */
  settings: number;
}

export interface ToolbarLayout {
  /** Import/Export show their labels. */
  ioLabels: boolean;
  /** The "New reminder" button shows its label. */
  newLabel: boolean;
  /** The search field sits on a row of its own under the buttons. */
  searchOwnRow: boolean;
}

/**
 * Smallest usable search field. When even this does not fit on the button row,
 * the search moves to a row of its own instead of being squeezed narrower.
 */
export const SEARCH_MIN_WIDTH = 170;

/**
 * Row widths. The first row holds the new button, the search field, the
 * Import/Export pair and the settings button; when the search drops to a row
 * of its own the button row holds three items.
 */
const firstRow = (parts: number[], gap: number) =>
  parts.reduce((total, part) => total + part, 0) + gap * (parts.length - 1);

export function chooseToolbarLayout(m: ToolbarLayoutMetrics): ToolbarLayout {
  // Widest state: everything, search included, on a single row.
  const single = firstRow([m.newWithLabel, m.search, m.ioWithLabels, m.settings], m.gap);
  if (single <= m.available) {
    return { ioLabels: true, newLabel: true, searchOwnRow: false };
  }

  // The search moves down. Keep both labels while the button row fits.
  const withBothLabels = firstRow([m.newWithLabel, m.ioWithLabels, m.settings], m.gap);
  if (withBothLabels <= m.available) {
    return { ioLabels: true, newLabel: true, searchOwnRow: true };
  }

  // Drop the "New reminder" label before the Import/Export ones.
  const withIoLabels = firstRow([m.newIcon, m.ioWithLabels, m.settings], m.gap);
  if (withIoLabels <= m.available) {
    return { ioLabels: true, newLabel: false, searchOwnRow: true };
  }

  // Nothing else fits: icons only. The button row never wraps, so this is the
  // densest state and the bar stays two rows tall.
  return { ioLabels: false, newLabel: false, searchOwnRow: true };
}
