import type { MediaDTO, PageLayout } from '@scrapbook/shared';
import { useT } from '../i18n';
import { LocalPreview } from '../localPreview';
import { mediaUrl } from '../mediaUrl';
import { SphereView } from '../render/SphereView';
import { removeElement } from './layoutOps';
import { moveOnSphere, sphereOrder } from './spaceOps';

// Editing a globe (Space, sphere): no placing by hand — the app spreads the photos over it. Here: a live preview, and
// the photos in the globe's order to move earlier / later or take off. Photos are added with 🧩 Space → Arrange.
export function SphereEditor({ layout, media, commit }: {
  layout: PageLayout; media: Map<string, MediaDTO>; commit(next: PageLayout): void;
}) {
  const t = useT();
  const order = sphereOrder(layout).flatMap((f) => { const m = media.get(f.mediaId!); return m ? [{ f, m }] : []; });
  const thumb = (m: MediaDTO) => {
    const key = m.kind === 'video' ? m.variants?.poster : m.variants?.thumb ?? m.variants?.display;
    return key ? mediaUrl(key) : '';
  };
  return (
    <div className="sphere-editor">
      <div className="sphere-editor-globe"><SphereView photos={order.map((o) => o.m)} size={layout.space?.radius} /></div>
      {!order.length && <p className="manage-hint">{t('No photos on the globe yet: ＋ Add photos below, or 🧩 Space → Add the album\'s photos.')}</p>}
      <ol className="sphere-order" aria-label={t('Photos on the globe, in order')}>
        {order.map(({ f, m }, i) => (
          <li key={f.id}>
            {/* Still uploading / processing: the picked file's local preview (an empty tile when there is none). */}
            <span className="sphere-order-pic">{thumb(m) ? <img src={thumb(m)} alt="" /> : <LocalPreview id={m.id} />}</span>
            <span className="sphere-order-n">{i + 1}</span>
            <span className="sphere-order-tools">
              <button type="button" aria-label={t('Move earlier')} disabled={i === 0} onClick={() => commit(moveOnSphere(layout, f.id, -1))}>◀</button>
              <button type="button" aria-label={t('Take off the globe')} onClick={() => commit(removeElement(layout, f.id))}>✕</button>
              <button type="button" aria-label={t('Move later')} disabled={i === order.length - 1} onClick={() => commit(moveOnSphere(layout, f.id, 1))}>▶</button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
