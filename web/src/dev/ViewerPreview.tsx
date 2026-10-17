// Dev-only sample album for the flip viewer (route /dev/viewer). Reuses the /dev/preview pages and media,
// adds a page number to each, and points `original` at a file that doesn't exist: the Network panel
// must never show a request for it.
import type { AlbumBundle, PageElement } from '@scrapbook/shared';
import { Book } from '../pages/Viewer';
import { media, pages } from './Preview';

const label = (n: number): PageElement => ({
  type: 'text', id: 'pageno', x: 0.82, y: 0.93, w: 0.14, h: 0.05, rotation: 0, z: 9,
  text: n === 0 ? 'cover' : `p.${n}`, font: 'patrick-hand', size: 0.035, color: '#4a3b2c',
});

const bundle: AlbumBundle = {
  album: { id: 'dev', title: 'Đà Lạt 2026 (dev sample)', coverMediaId: null, backgroundEffect: 'petals' },
  pages: Array.from({ length: 9 }, (_, i) => {
    const { layout } = pages[i % pages.length];
    return { id: `page${i}`, albumId: 'dev', position: i, layout: { ...layout, elements: [...layout.elements, label(i)] } };
  }),
  media: [...media.values()].map((m) => ({ ...m, variants: m.variants && { ...m.variants, original: 'dev-samples/NEVER-original.jpg' } })),
};

export default function ViewerPreview() {
  return <Book bundle={bundle} />;
}
