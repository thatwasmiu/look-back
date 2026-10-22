import { useState } from 'react';
import { MediaUnavailable } from './MediaUnavailable';

type Props = { blurDataUrl: string | null; src: string; srcAvif?: string; alt?: string; objectPosition: string; scale: number; shift?: { ox?: number; oy?: number } };

// Blur layer is a CSS background, so it can never render a broken-image icon.
// The sharp <picture> fades in on load; if it can't load (file gone, its storage bucket down) the frame shows the
// crying placeholder instead.
export function BlurImage({ blurDataUrl, src, srcAvif, alt = '', objectPosition, scale, shift }: Props) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Scale about the crop point: zoomed in, crop.x/y ∈ [0,1] still pans edge to edge of the photo.
  // A free shift (crop.ox/oy) moves the photo by a share of the frame, whatever its size.
  const transform = `${shift?.ox || shift?.oy ? `translate(${(shift.ox ?? 0) * 100}%, ${(shift.oy ?? 0) * 100}%) ` : ''}scale(${scale})`;
  const transformOrigin = objectPosition;
  return (
    <div className="blur-image">
      {blurDataUrl && (
        <div className="blur-layer" aria-hidden
          style={{ backgroundImage: `url("${blurDataUrl}")`, backgroundPosition: objectPosition, transform, transformOrigin }} />
      )}
      {failed === src ? <MediaUnavailable /> : (
        <picture>
          {srcAvif && <source type="image/avif" srcSet={srcAvif} />}
          <img src={src} alt={alt} draggable={false} decoding="async"
            className={loaded === src ? 'sharp loaded' : 'sharp'}
            style={{ objectPosition, transform, transformOrigin }}
            ref={(n) => { if (n?.complete && n.naturalWidth > 0 && loaded !== src) setLoaded(src); }}
            onLoad={() => setLoaded(src)} onError={() => setFailed(src)} />
        </picture>
      )}
    </div>
  );
}
