// Built-in album templates for "New album → Template": a desk color, an album background effect and a run of
// page templates. Look Back reuses the example album's pages. The server empties every frame.
import { instantiateTemplate, type AlbumDesign, type AlbumMode, type BackgroundColor, type BackgroundEffect, type EffectEl, type PageElement, type PageLayout, type ReadingDirection, type TextEl } from '@scrapbook/shared';
import { exampleAlbum } from './lookBack';

// icon: a sticker id. mode: which album mode lists it (default scrapbook); manga designs take the chosen reading direction.
type AlbumTemplate = { id: string; name: string; icon: string; mode?: AlbumMode; design: (direction?: ReadingDirection) => AlbumDesign };

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
// music: deploy/template-music/squids.mp3 on the server, if present (never in the repo or images).
const squidDesign = (): AlbumDesign => ({ backgroundColor: 'ocean', backgroundEffect: 'bubbles', music: 'squids', pages: [
  sea('cover', { texts: ['2 3 con mực'], stickers: ['octopus'], add: [[[0.06, 0.78, 0.16, 0.13, -8], 'octopus-blue'], [[0.76, 0.04, 0.17, 0.1275, 0], 'infinity']] }),
  sea('two-tilted', { texts: ['nắm tay nha'], stickers: ['squid'], add: [[[0.06, 0.86, 0.14, 0.1, -6], 'shell']] }),
  sea('sweet-heart', { texts: ['thưng vô cực ∞'], stickers: ['octopus', 'infinity'], bubbles: [0.1, 0.1, 0.8, 0.8, 0] }),
  sea('three-collage', { texts: ['đi ăn hông?'], stickers: ['sushi'], add: [[[0.8, 0.86, 0.14, 0.11, 4], 'onigiri']] }),
  sea('film-day', { texts: ['uống tăng lực', 'nạp năng lượng'], stickers: ['energy-can', 'octopus-blue'] }),
  sea('journal', { texts: ['căng cực?', undefined], stickers: ['ring'], add: [[[0.5, 0.84, 0.1, 0.1, 10], 'squid']] }),
] });

// ---- Manga album templates: manga page layouts plus bubbles, narration, sound effects and lines. All captions are
// our own generic lines; panels stay empty for the owner's photos. Boxes line up with the panels in mangaTemplates.ts.
type B = [x: number, y: number, w: number, h: number, rotation?: number];
const say = (textStyle: NonNullable<TextEl['textStyle']>, text: string, [x, y, w, h, rotation = 0]: B, extra: Partial<TextEl> = {}): TextEl => ({
  type: 'text', id: newId(), x, y, w, h, rotation, z: 7, text, textStyle,
  font: textStyle === 'sfx' ? 'bangers' : 'patrick-hand', color: textStyle === 'sfx' ? '#ffffff' : '#111111',
  size: textStyle === 'sfx' ? 0.075 : textStyle === 'narration' ? 0.028 : 0.032,
  ...(textStyle === 'speech' || textStyle === 'thought' ? { tail: 'bl' as const } : {}), ...extra,
});
const fx = (effect: EffectEl['effect'], [x, y, w, h]: B): EffectEl => ({ type: 'effect', id: newId(), x, y, w, h, rotation: 0, z: 6, effect });
const mangaPage = (template: string, extras: PageElement[] = [], title?: string): PageLayout => {
  const l = instantiateTemplate(template, newId);
  const elements = l.elements.map((e) => (title && e.type === 'text' && e.text === 'Tiêu đề' ? { ...e, text: title } : e));
  return { ...l, elements: [...elements, ...extras] };
};
const manga = (backgroundColor: BackgroundColor, backgroundEffect: BackgroundEffect, pages: () => PageLayout[]) =>
  (direction: ReadingDirection = 'ltr'): AlbumDesign => ({ backgroundColor, backgroundEffect, mode: 'manga', readingDirection: direction, pages: pages() });

const mangaJourney = manga('slate', 'none', () => [
  mangaPage('manga-cover', [], 'Hành trình'),
  mangaPage('manga-slants', [
    say('shout', 'ĐI THÔI!', [0.07, 0.06, 0.3, 0.16, -4]),
    fx('speed-lines', [0.04, 0.69, 0.92, 0.27]),
    say('sfx', 'VÚT!', [0.6, 0.74, 0.32, 0.14, -10]),
  ]),
  mangaPage('manga-grid', [
    say('narration', 'Ngày 1', [0.06, 0.05, 0.24, 0.05]),
    say('speech', 'Đẹp quá…', [0.62, 0.38, 0.3, 0.12], { tail: 'br' }),
  ]),
  mangaPage('manga-splash', [
    fx('focus-lines', [0.04, 0.04, 0.92, 0.92]),
    say('narration', 'Cuối cùng cũng tới nơi.', [0.52, 0.9, 0.42, 0.06]),
  ]),
]);

const mangaDaily = manga('walnut', 'none', () => [
  mangaPage('manga-cover', [], 'Thường ngày'),
  mangaPage('manga-tall-stack', [
    say('narration', '7 giờ sáng', [0.06, 0.05, 0.26, 0.05]),
    say('thought', 'Hôm nay ăn gì nhỉ…', [0.45, 0.07, 0.42, 0.15]),
  ]),
  mangaPage('manga-strips', [
    say('speech', 'Chào buổi sáng!', [0.08, 0.07, 0.36, 0.12]),
    fx('screentone', [0.04, 0.355, 0.92, 0.29]),
    say('sfx', 'TÁCH!', [0.65, 0.42, 0.28, 0.12, 6]),
  ]),
  mangaPage('manga-six', [say('narration', 'Một ngày bình thường', [0.06, 0.05, 0.4, 0.05])]),
]);

const mangaAction = manga('night', 'stars', () => [
  mangaPage('manga-cover', [], 'Hành động'),
  mangaPage('manga-diagonal', [
    fx('focus-lines', [0.04, 0.04, 0.92, 0.52]),
    say('shout', 'CẨN THẬN!', [0.08, 0.06, 0.34, 0.16, -3]),
    say('sfx', 'BÙM!', [0.55, 0.62, 0.36, 0.16, -12]),
  ]),
  mangaPage('manga-slants', [
    fx('speed-lines', [0.04, 0.04, 0.92, 0.34]),
    say('speech', 'Chưa xong đâu!', [0.08, 0.4, 0.36, 0.12]),
    say('sfx', 'RẦM!', [0.58, 0.72, 0.34, 0.14, 8]),
  ]),
  mangaPage('manga-bleed', [
    fx('focus-lines', [0, 0, 1, 1]),
    say('narration', 'Trận cuối.', [0.06, 0.88, 0.3, 0.06]),
  ]),
]);

const mangaRomance = manga('rose', 'petals', () => [
  mangaPage('manga-cover', [], 'Lãng mạn'),
  mangaPage('manga-columns', [
    say('thought', 'Tim đập nhanh quá…', [0.08, 0.08, 0.36, 0.15]),
    fx('screentone', [0.5125, 0.04, 0.4475, 0.92]),
  ]),
  mangaPage('manga-splash', [
    say('narration', 'Mùa hè năm ấy.', [0.08, 0.06, 0.36, 0.06]),
    say('speech', 'Mình đi cùng nhau nhé?', [0.55, 0.36, 0.38, 0.14], { tail: 'br' }),
  ]),
  mangaPage('manga-grid', [say('speech', 'Ừ!', [0.72, 0.7, 0.2, 0.1])]),
]);

export const albumTemplates: AlbumTemplate[] = [
  { id: 'manga-journey', name: 'Hành trình', icon: 'plane', mode: 'manga', design: mangaJourney },
  { id: 'manga-daily', name: 'Thường ngày', icon: 'coffee', mode: 'manga', design: mangaDaily },
  { id: 'manga-action', name: 'Hành động', icon: 'sparkle', mode: 'manga', design: mangaAction },
  { id: 'manga-romance', name: 'Lãng mạn', icon: 'heart', mode: 'manga', design: mangaRomance },
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
