/**
 * Dropdown placement.
 *
 * The regression these exist for: the profile menu was positioned with CSS
 * `right: 0`, which pins the panel to its trigger's right edge. In the header
 * the trigger is not at the right edge of the screen, so on a 390px phone a
 * 280px panel ran from x=-115 to x=165 and a third of it was off-screen. The
 * numbers below are the ones measured in Chromium before and after the fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_GUTTER, panelOffsetLeft, panelViewportLeft } from '../src/lib/menuPlacement.ts';

/** The header geometry that produced the bug, measured at 320-430px wide. */
const PHONE = { anchorLeft: 110, anchorRight: 165, panelWidth: 280 };

test('the panel never starts off the left of the screen', () => {
  for (const viewportWidth of [320, 360, 390, 430]) {
    const left = panelViewportLeft({ ...PHONE, viewportWidth });
    assert.ok(left >= PANEL_GUTTER, `${viewportWidth}px: left edge at ${left}`);
  }
});

test('and does not hang off the right either', () => {
  for (const viewportWidth of [320, 360, 390, 430, 768, 1440]) {
    const left = panelViewportLeft({ ...PHONE, viewportWidth });
    assert.ok(
      left + PHONE.panelWidth <= viewportWidth - PANEL_GUTTER + 0.5,
      `${viewportWidth}px: right edge at ${left + PHONE.panelWidth}`,
    );
  }
});

test('where there is room, it still right-aligns to its trigger', () => {
  // The desktop case: trigger at 366-481 in a 768px viewport.
  const left = panelViewportLeft({
    anchorLeft: 366,
    anchorRight: 481,
    panelWidth: 280,
    viewportWidth: 768,
  });
  assert.equal(left, 201);
  assert.equal(left + 280, 481, 'the right edges should line up');
});

test('a panel wider than the viewport keeps its start visible', () => {
  // Losing the right-hand end costs a Copy button; losing the left-hand end
  // costs every label that says what the panel is.
  const left = panelViewportLeft({
    anchorLeft: 10,
    anchorRight: 60,
    panelWidth: 400,
    viewportWidth: 320,
  });
  assert.equal(left, PANEL_GUTTER);
});

test('the offset is expressed against the positioned ancestor', () => {
  // The panel is absolutely positioned inside the wrapper, so the style value
  // is viewport-left minus the wrapper's own left.
  const g = { ...PHONE, viewportWidth: 390 };
  assert.equal(panelOffsetLeft(g), panelViewportLeft(g) - PHONE.anchorLeft);
  assert.equal(panelOffsetLeft(g), 12 - 110);
});

test('an exactly-fitting panel is not nudged', () => {
  const left = panelViewportLeft({
    anchorLeft: 100,
    anchorRight: 308,
    panelWidth: 296,
    viewportWidth: 320,
  });
  assert.equal(left, PANEL_GUTTER);
});
