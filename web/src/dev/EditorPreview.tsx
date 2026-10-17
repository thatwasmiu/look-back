// Dev-only editor against a fake api (route /dev/editor). Pages persist in sessionStorage so "reload → layout
// persisted" can be checked; ?reset starts over from the /dev/preview sample pages.
import type { AlbumBundle, PageDTO } from '@scrapbook/shared';
import { instantiateTemplate } from '@scrapbook/shared';
import { EditorView, type EditorApi } from '../pages/Editor';
import { media, pages as samples } from './Preview';

const KEY = 'dev-editor-pages';
if (new URLSearchParams(location.search).has('reset')) sessionStorage.removeItem(KEY);
let pages: PageDTO[] = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  ?? samples.slice(0, 3).map((p, i) => ({ id: `page${i}`, albumId: 'dev', position: i, layout: p.layout }));
const store = () => sessionStorage.setItem(KEY, JSON.stringify(pages));
let n = 0;
const wait = () => new Promise((r) => setTimeout(r, 150));

const fakeApi: EditorApi = {
  async addPage(albumId, templateId, position = pages.length) {
    await wait();
    const p: PageDTO = { id: `new${Date.now()}`, albumId, position, layout: instantiateTemplate(templateId, () => `d${Date.now()}${n++}`) };
    pages.splice(position, 0, p);
    store();
    return p;
  },
  async savePage(id, layout) {
    await wait();
    const p = pages.find((x) => x.id === id)!;
    p.layout = layout;
    store();
    console.info('[fake api] savePage', id, layout.elements.length, 'elements');
    return p;
  },
  async deletePage(id) { await wait(); pages = pages.filter((p) => p.id !== id); store(); },
  async reorderPages(_albumId, ids) { await wait(); pages = ids.map((id) => pages.find((p) => p.id === id)!); store(); },
};

export default function EditorPreview() {
  const bundle: AlbumBundle = { album: { id: 'dev', title: 'Đà Lạt (dev editor)', coverMediaId: null }, pages: structuredClone(pages), media: [...media.values()] };
  return <EditorView bundle={bundle} api={fakeApi} />;
}
