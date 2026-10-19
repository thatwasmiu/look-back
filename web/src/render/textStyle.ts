import type { CSSProperties } from 'react';
import type { TextEl } from '@scrapbook/shared';
import { fontFamily } from './decor';

// Lettering of a text element (plain text, bubbles, narration, sound effects, and the in-place editor).
// align / lineHeight / outline are optional: older pages keep their look.
export function textCss(el: TextEl, color = el.color): CSSProperties {
  return {
    fontFamily: fontFamily[el.font], color, fontSize: `calc(${el.size * 100} * var(--cqh))`,
    ...(el.align && { textAlign: el.align, justifyItems: el.align === 'left' ? 'start' : el.align === 'right' ? 'end' : 'center' }),
    ...(el.lineHeight && { lineHeight: el.lineHeight }),
    // Outline: a stroke in the opposite of the text color, drawn under the fill so letters keep their weight.
    ...(el.outline && { WebkitTextStroke: `calc(${el.size * 9} * var(--cqh)) ${isLight(color) ? '#111111' : '#ffffff'}`, paintOrder: 'stroke fill' }),
  };
}

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
};
