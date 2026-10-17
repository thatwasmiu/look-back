import type { ReactNode } from 'react';
import type { MediaDTO, PageElement, PageLayout } from '@scrapbook/shared';
import { FrameView } from './FrameView';
import { Tape, fontFamily, stickers } from './decor';
import { EffectView } from './effects';
import './render.css';

type RenderProps = {
  layout: PageLayout; media: Map<string, MediaDTO>; mode: 'view' | 'edit';
  renderOverlay?: (el: PageElement) => ReactNode; // editor hooks selection UI here
  active?: boolean; // false when the page is off-screen: stops video playback
};

// Rounded so 0.3 → "30%", not "30.000000000000004%".
const pct = (v: number) => `${Math.round(v * 1e6) / 1e4}%`;

export function PageRenderer({ layout, media, mode, renderOverlay, active = true }: RenderProps) {
  return (
    <div className={`page page-${mode}`}>
      <div className={`page-bg bg-${layout.background}`} />
      {layout.elements.map((el) => (
        <div key={el.id} data-el={el.id} className={`el el-${el.type}`}
          style={{ left: pct(el.x), top: pct(el.y), width: pct(el.w), height: pct(el.h), transform: `rotate(${el.rotation}deg)`, zIndex: el.z }}>
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
      return <div className="text" style={{ fontFamily: fontFamily[el.font], color: el.color, fontSize: `${el.size * 100}cqh` }}>{el.text}</div>;
    case 'effect': return <EffectView effect={el.effect} />;
  }
}
