// Geometry of a photo globe: n photos spread evenly over a sphere (a Fibonacci spiral), as longitude / latitude, and
// their place on screen once the globe is turned. Shared by the 3D view (CSS transforms) and the canvas drawing used
// for a still picture and the spinning video.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export type GlobePoint = { lon: number; lat: number }; // radians; lat from -π/2 (bottom) to π/2 (top)
export function spherePoints(n: number): GlobePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n; // top to bottom
    return { lon: (i * GOLDEN) % (2 * Math.PI), lat: Math.asin(Math.max(-1, Math.min(1, y))) };
  });
}

// A card's side for n photos on a globe of radius r: as big as fits without much overlap, within sensible limits.
export const cardSize = (n: number, r: number) => Math.max(r * 0.2, Math.min(r * 0.75, (r * 3) / Math.sqrt(Math.max(1, n))));

// Where a point is after turning the globe by (rx about the horizontal axis, ry about the vertical axis), in units of
// the radius: x right, y down, z towards the viewer.
export function turn(p: GlobePoint, rx: number, ry: number): { x: number; y: number; z: number } {
  const lon = p.lon + ry;
  let x = Math.cos(p.lat) * Math.sin(lon), y = -Math.sin(p.lat), z = Math.cos(p.lat) * Math.cos(lon);
  const cy = Math.cos(rx), sy = Math.sin(rx);
  [y, z] = [y * cy - z * sy, y * sy + z * cy];
  return { x, y, z };
}

// The globe drawn flat on a canvas (a still picture, a video frame): photos sorted far to near, smaller and fainter
// towards the back, the back half left out. Each photo is cropped square, with a thin white border.
export function drawGlobe(g: CanvasRenderingContext2D, imgs: (HTMLImageElement | null)[], w: number, h: number, rx: number, ry: number, size = 1) {
  const r = Math.min(w, h) * 0.36 * size, cx = w / 2, cy = h / 2, f = 3; // f: perspective distance, in radii
  const pts = spherePoints(imgs.length).map((p, i) => ({ i, ...turn(p, rx, ry) })).sort((a, b) => a.z - b.z);
  const side = cardSize(imgs.length, r / size); // photo size as on a globe of size 1
  for (const p of pts) {
    const img = imgs[p.i];
    if (!img || p.z < -0.2) continue;
    const s = f / (f - p.z);
    const d = side * s, x = cx + p.x * r * s - d / 2, y = cy + p.y * r * s - d / 2;
    g.globalAlpha = Math.min(1, 0.35 + 0.65 * ((p.z + 0.2) / 1.2));
    g.fillStyle = '#fffdf8';
    g.fillRect(x - d * 0.04, y - d * 0.04, d * 1.08, d * 1.08);
    const k = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, x, y, d, d);
  }
  g.globalAlpha = 1;
}
