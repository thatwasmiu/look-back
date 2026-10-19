// Dev-only review of the starter templates (route /dev/templates): each one filled with sample media, and empty
// as it appears in the editor. ?only=<id> shows one template; ?book shows them (minus blank) in the flip viewer;
// ?manga lists the manga layouts; ?ai fills every AI text slot and sticker spot with sample content.
import type { AlbumBundle, PageLayout } from '@scrapbook/shared';
import { fillTemplate, mangaTemplates, stickerSpotCount, templates, textSlots, type Template } from '@scrapbook/shared';
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
  album: { id: 'dev', title: 'Templates (dev sample)', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' },
  pages: templates.filter((t) => t.id !== 'blank').map((t, i) => ({ id: `page${i}`, albumId: 'dev', position: i, layout: fill(t.id, t.layout) })),
  media: [...media.values()],
};

export default function Templates() {
  const q = new URLSearchParams(location.search);
  if (q.has('book')) return <Book bundle={bundle} />;
  const only = q.get('only');
  const list = q.has('manga') ? mangaTemplates : templates;
  const sample: Record<string, string> = { plain: 'Ghi chú mẫu', speech: 'Đi thôi nào!', thought: 'Hôm nay vui ghê…', shout: 'NHANH LÊN!', narration: '8 giờ sáng', sfx: 'BÙM!' };
  let n = 0;
  const shown = (t: Template) => (q.has('ai')
    ? fillTemplate(t.id, textSlots(t).map((s) => sample[s.style]), Array(stickerSpotCount(t)).fill('sparkle'), () => `ai${n++}`)
    : t.layout);
  return (
    <main style={{ padding: 24, display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
      {list.filter((t) => !only || t.id === only).flatMap((t) => [
        <figure key={t.id} id={t.id} style={{ margin: 0 }}>
          <PageRenderer layout={fill(t.id, shown(t))} media={media} mode="view" />
          <figcaption style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{t.id} · {t.name}</figcaption>
        </figure>,
        <figure key={`${t.id}-empty`} style={{ margin: 0 }}>
          <PageRenderer layout={shown(t)} media={media} mode="edit" />
          <figcaption style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{t.id} · empty (edit)</figcaption>
        </figure>,
      ])}
    </main>
  );
}
