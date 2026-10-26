import type { CSSProperties, ReactNode } from 'react';
import { PHOTO_FILTER_CSS, type MediaDTO, type PageElement, type PageLayout } from '@scrapbook/shared';
import { FrameView } from './FrameView';
import { Tape, stickers } from './decor';
import { textCss } from './textStyle';
import { EffectView } from './effects';
import './render.css';
import { MangaText, isMangaText } from '../manga/render';

type RenderProps = {
  layout: PageLayout; media: Map<string, MediaDTO>; mode: 'view' | 'edit';
  renderOverlay?: (el: PageElement) => ReactNode; // editor hooks selection UI here
  active?: boolean; // false when the page is off-screen: stops video playback
};

// Rounded so 0.3 → "30%", not "30.000000000000004%".
const pct = (v: number) => `${Math.round(v * 1e6) / 1e4}%`;

// A space (layout.space) is cols × rows pages in one box: items are placed in tile units (x / cols, y / rows), and
// --cqw / --cqh (what every page-relative size in the CSS goes through, see vite.config.ts) are one tile's, so words,
// borders and stickers keep a page's proportions however long the space is. data-cols / data-rows tell the iOS < 16
// container-units polyfill to divide the same way.
export function spaceStyle(layout: PageLayout): CSSProperties | undefined {
  const s = layout.space;
  if (!s) return undefined;
  return { aspectRatio: `${3 * s.cols} / ${4 * s.rows}`, '--cqw': `calc(1cqw / ${s.cols})`, '--cqh': `calc(1cqh / ${s.rows})` } as CSSProperties;
}

export function PageRenderer({ layout, media, mode, renderOverlay, active = true }: RenderProps) {
  const cols = layout.space?.cols ?? 1, rows = layout.space?.rows ?? 1;
  return (
    <div className={`page page-${mode}${layout.filter ? ` photo-filter-${layout.filter}` : ''}${layout.space ? ` page-space space-${layout.space.shape}` : ''}`}
      data-cols={layout.space ? cols : undefined} data-rows={layout.space ? rows : undefined}
      style={{ ...(layout.filter && { '--photo-filter': PHOTO_FILTER_CSS[layout.filter] }), ...spaceStyle(layout) } as CSSProperties}>
      <div className={`page-bg bg-${layout.background}`} />
      {layout.elements.map((el) => (
        <div key={el.id} data-el={el.id} className={`el el-${el.type}`}
          style={{ left: pct(el.x / cols), top: pct(el.y / rows), width: pct(el.w / cols), height: pct(el.h / rows), transform: `rotate(${el.rotation}deg)`, zIndex: el.z }}>
          {element(el, media, mode, active)}
          {renderOverlay?.(el)}
        </div>
      ))}
    </div>
  );
}

function element(el: PageElement, media: Map<string, MediaDTO>, mode: 'view' | 'edit', active: boolean): ReactNode {
  switch (el.type) {
    case 'frame': return <FrameView el={el} media={el.mediaId ? media.get(el.mediaId) : undefined} mode={mode} active={active} />;
    case 'tape': return <Tape tapeStyle={el.tapeStyle} />;
    case 'sticker': {
      const S = stickers[el.stickerId]?.Svg;
      return S ? <S /> : null;
    }
    case 'text':
      if (isMangaText(el)) return <MangaText el={el} />;
      return <div className="text" style={textCss(el)}>{el.text}</div>;
    case 'effect': return <EffectView effect={el.effect} />;
  }
}
