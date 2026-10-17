// Dev-only review of the starter templates (route /dev/templates): each one filled with sample media, and empty
// as it appears in the editor. ?only=<id> shows one template; ?book shows them (minus blank) in the flip viewer.
import type { AlbumBundle, PageLayout } from '@scrapbook/shared';
import { templates } from '@scrapbook/shared';
import { PageRenderer } from '../render/PageRenderer';
import { Book } from '../pages/Viewer';
import { media } from './Preview';

const photos = ['sunset', 'lake', 'pine', 'beach'];
const fill = (id: string, layout: PageLayout): PageLayout => {
  let n = 0;
  return { ...layout, elements: layout.elements.map((e) => e.type !== 'frame' ? e
    : { ...e, mediaId: id === 'video-feature' && n === 0 ? (n++, 'video') : photos[n++ % photos.length] }) };
};

const bundle: AlbumBundle = {
  album: { id: 'dev', title: 'Templates (dev sample)', coverMediaId: null, backgroundEffect: 'none' },
  pages: templates.filter((t) => t.id !== 'blank').map((t, i) => ({ id: `page${i}`, albumId: 'dev', position: i, layout: fill(t.id, t.layout) })),
  media: [...media.values()],
};

export default function Templates() {
  const q = new URLSearchParams(location.search);
  if (q.has('book')) return <Book bundle={bundle} />;
  const only = q.get('only');
  return (
    <main style={{ padding: 24, display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
      {templates.filter((t) => !only || t.id === only).flatMap((t) => [
        <figure key={t.id} id={t.id} style={{ margin: 0 }}>
          <PageRenderer layout={fill(t.id, t.layout)} media={media} mode="view" />
          <figcaption style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{t.id} · {t.name}</figcaption>
        </figure>,
        <figure key={`${t.id}-empty`} style={{ margin: 0 }}>
          <PageRenderer layout={t.layout} media={media} mode="edit" />
          <figcaption style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{t.id} · empty (edit)</figcaption>
        </figure>,
      ])}
    </main>
  );
}
