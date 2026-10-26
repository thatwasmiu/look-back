import type { CSSProperties } from 'react';
import type { MediaDTO, PageLayout } from '@scrapbook/shared';
import { PageRenderer } from './PageRenderer';

// One tile (a page-sized 3:4 piece) of a space: the album card, a slide of the carousel, a printed sheet. Tiles count
// along the space: down a wall, along a strip. An ordinary page is its own tile 0.
export function SpaceTile({ layout, media, index = 0, active = false }: { layout: PageLayout; media: Map<string, MediaDTO>; index?: number; active?: boolean }) {
  const s = layout.space;
  if (!s) return <PageRenderer layout={layout} media={media} mode="view" active={active} />;
  const ix = s.shape === 'horizontal' ? index : 0, iy = s.shape === 'horizontal' ? 0 : index;
  return (
    <div className="space-tile">
      <div className="space-tile-inner" style={{ width: `${s.cols * 100}%`, left: `${-ix * 100}%`, top: `${-iy * 100}%` } as CSSProperties}>
        <PageRenderer layout={layout} media={media} mode="view" active={active} />
      </div>
    </div>
  );
}

// How many tiles a page has: a space's length, 1 for an ordinary page.
export const tileCount = (layout: PageLayout) => (layout.space ? layout.space.cols * layout.space.rows : 1);
