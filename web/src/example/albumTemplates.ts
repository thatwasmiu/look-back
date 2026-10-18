// Built-in album templates for "New album → Template": a desk color, an album background effect and a run of
// page templates. Look Back reuses the example album's pages. The server empties every frame.
import { instantiateTemplate, type AlbumDesign, type BackgroundColor, type BackgroundEffect, type PageElement, type PageLayout } from '@scrapbook/shared';
import { exampleAlbum } from './lookBack';

type AlbumTemplate = { id: string; name: string; icon: string; design: () => AlbumDesign }; // icon: a sticker id

// randomUUID needs a secure context; the app may be opened over plain http on the LAN.
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const fromPages = (backgroundColor: BackgroundColor, backgroundEffect: BackgroundEffect, pageTemplates: string[]) =>
  (): AlbumDesign => ({ backgroundColor, backgroundEffect, pages: pageTemplates.map((t) => instantiateTemplate(t, newId)) });

// A page template re-themed: its stickers, texts and tapes swapped in order (undefined keeps one), plus extras.
type Box = [x: number, y: number, w: number, h: number, rotation: number];
const sea = (template: string, o: { stickers?: string[]; texts?: (string | undefined)[]; bubbles?: Box; add?: [Box, string][] }): PageLayout => {
  const l = instantiateTemplate(template, newId);
  let si = 0, ti = 0;
  const elements = l.elements.map((e): PageElement => {
    if (e.type === 'sticker') return { ...e, stickerId: o.stickers?.[si++] ?? e.stickerId };
    if (e.type === 'text') return { ...e, text: o.texts?.[ti++] ?? e.text, color: '#2f5d7c' };
    if (e.type === 'tape') return { ...e, tapeStyle: 'mint' };
    return e;
  });
  const at = ([x, y, w, h, rotation]: Box, z: number) => ({ id: newId(), x, y, w, h, rotation, z });
  for (const [b, stickerId] of o.add ?? []) elements.push({ type: 'sticker', ...at(b, 8), stickerId });
  if (o.bubbles) elements.push({ type: 'effect', ...at(o.bubbles, 9), effect: 'bubbles' });
  return { ...l, elements };
};
// "2 3 con mực": ocean desk, rising bubbles, octopus / squid stickers; the themes of the song (love to infinity,
// energy drinks, sushi & rice balls, holding hands, a wedding) as stickers and original captions — no lyrics.
const squidDesign = (): AlbumDesign => ({ backgroundColor: 'ocean', backgroundEffect: 'bubbles', pages: [
  sea('cover', { texts: ['2 3 con mực'], stickers: ['octopus'], add: [[[0.06, 0.78, 0.16, 0.13, -8], 'octopus-blue'], [[0.78, 0.05, 0.15, 0.09, 0], 'infinity']] }),
  sea('two-tilted', { texts: ['nắm tay nha'], stickers: ['squid'], add: [[[0.06, 0.86, 0.14, 0.1, -6], 'shell']] }),
  sea('sweet-heart', { texts: ['thưng vô cực ∞'], stickers: ['octopus', 'infinity'], bubbles: [0.1, 0.1, 0.8, 0.8, 0] }),
  sea('three-collage', { texts: ['đi ăn hông?'], stickers: ['sushi'], add: [[[0.8, 0.86, 0.14, 0.11, 4], 'onigiri']] }),
  sea('film-day', { texts: ['uống tăng lực', 'nạp năng lượng'], stickers: ['energy-can', 'octopus-blue'] }),
  sea('journal', { texts: ['căng cực?', undefined], stickers: ['ring'], add: [[[0.5, 0.84, 0.1, 0.1, 10], 'squid']] }),
] });

export const albumTemplates: AlbumTemplate[] = [
  { id: 'squids', name: '2 3 con mực', icon: 'octopus', design: squidDesign },
  { id: 'trip', name: 'Trip', icon: 'plane', design: fromPages('walnut', 'none',
    ['cover', 'postcard', 'one-hero', 'three-collage', 'film-day', 'hero-plus-two', 'journal']) },
  { id: 'birthday', name: 'Birthday', icon: 'gift', design: fromPages('rose', 'stars',
    ['cover', 'instant-fan', 'two-tilted', 'memories', 'four-grid-loose', 'sweet-heart']) },
  { id: 'love', name: 'Love story', icon: 'heart', design: fromPages('plum', 'petals',
    ['cover', 'sweet-heart', 'vintage', 'two-tilted', 'postcard', 'memories']) },
  { id: 'year', name: 'Year in review', icon: 'camera', design: fromPages('slate', 'snow',
    ['cover', 'four-grid-loose', 'three-collage', 'hero-plus-two', 'video-feature', 'film-day', 'old-album', 'journal']) },
  { id: 'look-back', name: 'Look Back', icon: 'moon', design: () => ({
    backgroundColor: exampleAlbum.album.backgroundColor, backgroundEffect: exampleAlbum.album.backgroundEffect,
    pages: exampleAlbum.pages.map((p) => p.layout),
  }) },
];
