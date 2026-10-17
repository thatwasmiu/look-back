import { useState } from 'react';

type Props = { blurDataUrl: string | null; src: string; srcAvif?: string; alt?: string; objectPosition: string; scale: number };

// Blur layer is a CSS background, so it can never render a broken-image icon.
// The sharp <picture> fades in on load and is dropped entirely on error.
export function BlurImage({ blurDataUrl, src, srcAvif, alt = '', objectPosition, scale }: Props) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Scale about the crop point: zoomed in, crop.x/y ∈ [0,1] still pans edge to edge of the photo.
  const transform = `scale(${scale})`;
  const transformOrigin = objectPosition;
  return (
    <div className="blur-image">
      {blurDataUrl && (
        <div className="blur-layer" aria-hidden
          style={{ backgroundImage: `url("${blurDataUrl}")`, backgroundPosition: objectPosition, transform, transformOrigin }} />
      )}
      {failed !== src && (
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
