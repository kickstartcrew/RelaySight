export const G2_CANVAS = { width: 576, height: 288 } as const;

export const GLASSES_LAYOUT = {
  brand: { x: 8, y: 1, width: 300, height: 28, padding: 4, border: 0 },
  status: { x: 388, y: 1, width: 180, height: 28, padding: 4, border: 1 },
  body: { x: 4, y: 31, width: 568, height: 226, padding: 4, border: 1 },
  hint: { x: 8, y: 259, width: 420, height: 29, padding: 4, border: 0 },
  page: { x: 432, y: 259, width: 136, height: 29, padding: 4, border: 0 },
} as const;

export const GLASSES_BODY_INNER_WIDTH = GLASSES_LAYOUT.body.width
  - 2 * (GLASSES_LAYOUT.body.padding + GLASSES_LAYOUT.body.border);

export const GLASSES_BODY_INNER_HEIGHT = GLASSES_LAYOUT.body.height
  - 2 * (GLASSES_LAYOUT.body.padding + GLASSES_LAYOUT.body.border);

// EvenHub's firmware font has a fixed 27px line height.
export const G2_TEXT_LINE_HEIGHT = 27;
