// While a picked photo/video uploads and the worker processes it, frames and the tray show the file itself
// (an object URL) under the usual "đang tải… / đang xử lý…" chip. Dropped once the media settles.
const previews = new Map<string, { url: string; video: boolean }>();

export function setLocalPreview(mediaId: string, file: Blob): void {
  if (previews.has(mediaId) || !/^(image|video)\//.test(file.type) || !URL.createObjectURL) return;
  previews.set(mediaId, { url: URL.createObjectURL(file), video: file.type.startsWith('video/') });
}

export function dropLocalPreview(mediaId: string): void {
  const p = previews.get(mediaId);
  if (!p) return;
  URL.revokeObjectURL(p.url);
  previews.delete(mediaId);
}

export function LocalPreview({ id, objectPosition }: { id: string; objectPosition?: string }) {
  const p = previews.get(id);
  if (!p) return null;
  // #t: some phones show a blank video until it has a time to seek to.
  return p.video
    ? <video className="local-preview" src={`${p.url}#t=0.1`} muted playsInline preload="metadata" style={{ objectPosition }} />
    : <img className="local-preview" src={p.url} alt="" draggable={false} style={{ objectPosition }} />;
}
