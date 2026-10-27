import type { CSSProperties } from 'react';
import type { MediaDTO, PageLayout } from '@scrapbook/shared';
import { PageRenderer } from './PageRenderer';
import { SphereView } from './SphereView';
import { mediaUrl } from '../mediaUrl';

// One tile (a page-sized 3:4 piece) of a space: the album card, a slide of the carousel, a printed sheet. Tiles count
// along the space: down a wall, along a strip. A free board is square in tiles, so 3:4 as a whole: it is shown whole,
// as one piece. An ordinary page is its own tile 0.
// A globe has no page to cut: a still globe (album card), or its photos as a grid (`grid`: printing).
export function SpaceTile({ layout, media, index = 0, active = false, grid = false }: { layout: PageLayout; media: Map<string, MediaDTO>; index?: number; active?: boolean; grid?: boolean }) {
  const s = layout.space;
  if (s?.shape === 'sphere') {
    const photos = layout.elements.flatMap((e) => { const m = e.type === 'frame' && e.mediaId ? media.get(e.mediaId) : undefined; return m ? [m] : []; });
    return (
      <div className="space-tile">
        {grid
          ? <div className="globe-grid">{photos.map((m) => {
              const key = m.kind === 'video' ? m.variants?.poster : m.variants?.display;
              return key ? <img key={m.id} src={mediaUrl(key)} alt="" /> : null;
            })}</div>
          : <SphereView photos={photos} interactive={false} size={s.radius} />}
      </div>
    );
  }
  if (!s || s.shape === 'free') return <PageRenderer layout={layout} media={media} mode="view" active={active} />;
  const ix = s.shape === 'horizontal' ? index : 0, iy = s.shape === 'horizontal' ? 0 : index;
  return (
    <div className="space-tile">
      <div className="space-tile-inner" style={{ width: `${s.cols * 100}%`, left: `${-ix * 100}%`, top: `${-iy * 100}%` } as CSSProperties}>
        <PageRenderer layout={layout} media={media} mode="view" active={active} />
      </div>
    </div>
  );
}

// How many pieces a page is cut into: a wall's / strip's length; 1 for a free board (whole) and an ordinary page.
export const tileCount = (layout: PageLayout) => (layout.space && layout.space.shape !== 'free' ? layout.space.cols * layout.space.rows : 1);
