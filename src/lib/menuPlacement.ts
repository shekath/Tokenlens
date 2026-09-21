/**
 * Where a dropdown panel goes, as arithmetic.
 *
 * Extracted from the component because this is where the bug was, and a bug in
 * geometry is only provable with numbers. The original rule was CSS `right: 0`,
 * which pins the panel's right edge to its trigger's. That is correct only when
 * the trigger sits at the right edge of the screen. In the header it does not -
 * the theme switcher follows it, and the row wraps on a narrow viewport - so a
 * 280px panel hung off a trigger ending at x=165 began at x=-115 and a third of
 * it was off the left of every phone screen.
 *
 * It read as clean in a test because `scrollWidth` does not grow for overflow to
 * the left. Hence this, and the cases in tests/menuPlacement.test.mjs.
 */

/** Clear of the viewport edge, and of a rounded display's corner. */
export const PANEL_GUTTER = 12;

export interface PanelGeometry {
  /** Viewport x of the anchor's left and right edges. */
  anchorLeft: number;
  anchorRight: number;
  panelWidth: number;
  viewportWidth: number;
  gutter?: number;
}

/**
 * The panel's left edge, in viewport coordinates: right-aligned to the anchor
 * where that fits, pushed inside the gutter where it does not.
 *
 * When the panel is wider than the viewport allows, the left gutter wins - a
 * panel whose start is cut off is unreadable, whereas one whose end is cut off
 * still shows the labels that say what it is.
 */
export function panelViewportLeft(g: PanelGeometry): number {
  const gutter = g.gutter ?? PANEL_GUTTER;
  const rightmost = Math.max(gutter, g.viewportWidth - g.panelWidth - gutter);
  return Math.min(Math.max(g.anchorRight - g.panelWidth, gutter), rightmost);
}

/** The same, expressed relative to the positioned ancestor the panel sits in. */
export function panelOffsetLeft(g: PanelGeometry): number {
  return panelViewportLeft(g) - g.anchorLeft;
}
