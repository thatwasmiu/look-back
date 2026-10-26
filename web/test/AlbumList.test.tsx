import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AlbumList from '../src/pages/AlbumList';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AlbumList /></MemoryRouter>);
}

test('500 on load shows an error, not the empty state', async () => {
  setup(vi.fn().mockResolvedValue(json(500, { error: 'boom' })));
  expect(await screen.findByText(/Couldn't load the album list/)).toBeTruthy();
  expect(screen.queryByText('No albums yet.')).toBeNull();
});

test('create failure shows an inline error', async () => {
  setup(vi.fn().mockResolvedValueOnce(json(200, [])).mockResolvedValueOnce(json(500, { error: 'boom' })));
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Trip');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByText("Couldn't create the album")).toBeTruthy();
});

test('New album opens a modal; Escape and × close it', async () => {
  setup(vi.fn().mockResolvedValue(json(200, [])));
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  expect(screen.getByRole('dialog', { name: 'New album' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'New scrapbook album' }));
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the built-in example album is listed (view only) after your albums', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AlbumList /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: /Look Back — a tribute/ });
  expect(link.getAttribute('href')).toBe('/albums/example-look-back');
  expect(screen.getByText(/Example/)).toBeTruthy();
});

test('Delete asks first; Cancel keeps the album, Delete removes it via the API', async () => {
  const album = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', coverThumb: null, pageCount: 2 };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [album])).mockResolvedValueOnce(new Response(null, { status: 204 }));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Trip' }));
  expect(screen.getByRole('alertdialog').textContent).toContain("can't be undone");
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete album' }));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/albums/a1', expect.objectContaining({ method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: /^Trip/ })).toBeNull());
});

test('Share creates a link the owner can copy, and Stop sharing revokes it', async () => {
  const album = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, coverThumb: null, pageCount: 2 };
  const token = 'T'.repeat(43);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(200, [album]))
    .mockResolvedValueOnce(json(200, { shareToken: token }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'Share Trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create share link' }));
  const link = await screen.findByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
  expect(link.value).toBe(`${location.origin}/s/${token}`);
  expect(fetchMock).toHaveBeenCalledWith('/api/albums/a1/share', expect.objectContaining({ method: 'POST' }));
  await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/albums/a1/share', expect.objectContaining({ method: 'DELETE' }));
  expect(await screen.findByRole('button', { name: 'Create share link' })).toBeTruthy();
});

test('New album can start from another album’s design (sent as fromAlbumId) and lands first in the list', async () => {
  const src = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'snow', backgroundColor: 'sage', shareToken: null, coverThumb: null, pageCount: 5 };
  const created = { ...src, id: 'a2', title: 'Trip 2', shareToken: null };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [src])).mockResolvedValueOnce(json(201, created));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Trip 2');
  await userEvent.click(screen.getAllByRole('radio', { name: 'Trip' }).at(-1)!); // the album, after the built-in Trip template
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ title: 'Trip 2', fromAlbumId: 'a1' });
  await waitFor(() => expect(screen.getAllByRole('link', { name: /Trip/ })[0].textContent).toContain('Trip 2'));
  expect(screen.getAllByText(/5 pages/, { selector: 'small' })).toHaveLength(2);
});

test('New album can start from a built-in template: its whole design is sent', async () => {
  const created = { id: 'a9', title: 'Sinh nhật', coverMediaId: null, backgroundEffect: 'stars', backgroundColor: 'rose', shareToken: null };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [])).mockResolvedValueOnce(json(201, created));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Sinh nhật');
  await userEvent.click(screen.getByRole('radio', { name: 'Birthday' }));
  expect(screen.getByRole('radio', { name: 'Birthday' }).getAttribute('aria-checked')).toBe('true');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.design).toMatchObject({ backgroundColor: 'rose', backgroundEffect: 'stars' });
  expect(body.design.pages.length).toBeGreaterThan(3);
  expect(await screen.findByText(/6 pages/, { selector: 'small' })).toBeTruthy();
});

test('an album without a cover photo shows its first page on the card', async () => {
  const layout = { background: 'paper-kraft', elements: [{ type: 'text', id: 't', x: 0.1, y: 0.1, w: 0.8, h: 0.1, rotation: 0, z: 1, text: 'Biển xanh', font: 'patrick-hand', color: '#4a3b2c', size: 0.05 }] };
  const album = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, coverThumb: null, pageCount: 1, coverPage: { layout, media: [] } };
  setup(vi.fn().mockResolvedValueOnce(json(200, [album])));
  expect(await screen.findByText('Biển xanh')).toBeTruthy();
  expect(document.querySelector('.polaroid .cover-page .page.page-view')).not.toBeNull();
});

const albumOf = (id: string, title: string, mode: 'scrapbook' | 'manga') =>
  ({ id, title, coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode, readingDirection: 'ltr', coverThumb: null, pageCount: 1 });

test('Manga mode with right-to-left reading is sent on Create; scrapbook templates are hidden in Manga mode', async () => {
  const created = { ...albumOf('m1', 'Truyện', 'manga'), readingDirection: 'rtl' };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [])).mockResolvedValueOnce(json(201, created));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Truyện');
  expect(screen.getByRole('radio', { name: 'Trip' })).toBeTruthy();
  await userEvent.click(screen.getByRole('radio', { name: 'Manga' }));
  expect(screen.queryByRole('radio', { name: 'Trip' })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'Birthday' })).toBeNull(); // scrapbook-only
  expect(screen.getByRole('radio', { name: 'Left → right' }).getAttribute('aria-checked')).toBe('true');
  await userEvent.click(screen.getByRole('radio', { name: 'Right → left' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ title: 'Truyện', mode: 'manga', readingDirection: 'rtl' });
});

test('"copy the design of" lists only albums of the chosen mode; a default create is not manga', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [albumOf('s1', 'Biển', 'scrapbook'), albumOf('m1', 'Truyện', 'manga')]))
    .mockResolvedValueOnce(json(201, albumOf('s2', 'Mới', 'scrapbook')));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  const copyNames = () => screen.getAllByRole('radio').map((r) => r.textContent);
  expect(copyNames()).toContain('Biển');
  expect(copyNames()).not.toContain('Truyện');
  await userEvent.click(screen.getByRole('radio', { name: 'Manga' }));
  expect(copyNames()).toContain('Truyện');
  expect(copyNames()).not.toContain('Biển');
  await userEvent.click(screen.getByRole('radio', { name: 'Scrapbook' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Mới');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).mode).not.toBe('manga');
});

test('Manga mode offers manga templates (not scrapbook ones); a picked one is sent as a manga design in the chosen direction', async () => {
  const created = { ...albumOf('m2', 'Đi phượt', 'manga'), readingDirection: 'rtl' };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [])).mockResolvedValueOnce(json(201, created));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Đi phượt');
  expect(screen.queryByRole('radio', { name: 'Hành trình' })).toBeNull(); // scrapbook mode: no manga templates
  await userEvent.click(screen.getByRole('radio', { name: 'Manga' }));
  expect(screen.queryByRole('radio', { name: 'Trip' })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: 'Hành trình' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Right → left' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.design).toMatchObject({ mode: 'manga', readingDirection: 'rtl' });
  expect(body.design.pages.length).toBeGreaterThanOrEqual(3);
});

test('Copy puts the share link on the clipboard, closes the dialog and says so', async () => {
  const token = 'T'.repeat(43);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  setup(vi.fn().mockResolvedValueOnce(json(200, [{ ...albumOf('a1', 'Trip', 'scrapbook'), shareToken: token }])));
  await userEvent.click(await screen.findByRole('button', { name: 'Share Trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(writeText).toHaveBeenCalledWith(`${location.origin}/s/${token}`);
  expect(screen.queryByRole('dialog', { name: 'Share album' })).toBeNull();
  expect((await screen.findByRole('status')).textContent).toBe('Link copied');
});

// ✨ AI: settings are fetched when the card is picked; Create sends the description to /api/ai/album.
function serveAi(hasKey: boolean, create: () => Promise<Response> | Response = () => json(201, { id: 'a1', title: 'Đi làm', mode: 'manga' })) {
  const calls: { method: string; url: string; body: any }[] = [];
  setup(vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/albums') return json(200, []);
    if (url === '/api/manage/ai') return json(200, { hasKey, last4: hasKey ? 'abcd' : null, model: 'm' });
    if (url === '/api/ai/album') return create();
    return json(404, {});
  }));
  return calls;
}

test('✨ AI card in both modes; without a key it points to /manage and Create stays off', async () => {
  serveAi(false);
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  expect(screen.getByRole('radio', { name: /✨ AI/ })).toBeTruthy();
  await userEvent.click(screen.getByRole('radio', { name: 'Manga' }));
  await userEvent.click(screen.getByRole('radio', { name: /✨ AI/ }));
  expect(await screen.findByText(/Add a Gemini key in \/manage/)).toBeTruthy();
  await userEvent.type(screen.getByLabelText('Album description'), 'abc');
  expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
});

test('✨ AI sends the description, mode and direction once, then opens the editor', async () => {
  let release!: (r: Response) => void;
  const calls = serveAi(true, () => new Promise<Response>((ok) => { release = ok; }));
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Manga' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Right → left' }));
  await userEvent.click(screen.getByRole('radio', { name: /✨ AI/ }));
  const box = screen.getByLabelText('Album description') as HTMLTextAreaElement;
  expect(box.maxLength).toBe(200);
  expect(screen.getByText('0/200')).toBeTruthy();
  await userEvent.type(box, '1 ngày đi làm');
  expect(screen.getByText('13/200')).toBeTruthy();
  const create = await screen.findByRole('button', { name: 'Create' });
  await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(create);
  const busy = await screen.findByRole('button', { name: 'AI is building the album…' });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(busy);
  expect(calls.filter((c) => c.url === '/api/ai/album')).toHaveLength(1);
  expect(calls.find((c) => c.url === '/api/ai/album')!.body).toEqual({ prompt: '1 ngày đi làm', mode: 'manga', readingDirection: 'rtl' });
  release(json(201, { id: 'a1', title: 'Đi làm', mode: 'manga' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('✨ AI shows the server error', async () => {
  serveAi(true, () => json(502, { error: 'Hết lượt miễn phí của Gemini, thử lại sau.' }));
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.click(screen.getByRole('radio', { name: /✨ AI/ }));
  await userEvent.type(screen.getByLabelText('Album description'), 'sinh nhật');
  await userEvent.type(screen.getByLabelText('Album title'), 'Của tôi');
  const create = screen.getByRole('button', { name: 'Create' });
  await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(create);
  expect(await screen.findByText('Hết lượt miễn phí của Gemini, thử lại sau.')).toBeTruthy();
});

test('✨ AI: the dialog cannot be closed while the album is being generated', async () => {
  serveAi(true, () => new Promise<Response>(() => {}));
  await userEvent.click(await screen.findByRole('button', { name: 'New scrapbook album' }));
  await userEvent.click(screen.getByRole('radio', { name: /✨ AI/ }));
  await userEvent.type(screen.getByLabelText('Album description'), 'abc');
  const create = screen.getByRole('button', { name: 'Create' });
  await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(create);
  await screen.findByRole('button', { name: 'AI is building the album…' });
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'New album' })).toBeTruthy();
});

test('Đăng xuất ends the session and goes to the login page', async () => {
  const calls: string[] = [];
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign, origin: 'http://localhost' });
  setup(vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    return url === '/api/auth/logout' ? new Response(null, { status: 204 }) : json(200, []);
  }));
  await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  expect(calls).toContain('POST /api/auth/logout');
});

test('Share dialog: an edit link for the hours the owner types (8 by default), to copy, renew or revoke', async () => {
  const album = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, editToken: null, coverThumb: null, pageCount: 2 };
  const token = 'E'.repeat(43);
  const expiresAt = new Date(Date.now() + 8 * 3600_000).toISOString();
  const calls: string[] = [];
  const bodies: unknown[] = [];
  setup(vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/albums/a1/edit-link' && init?.method === 'POST') bodies.push(JSON.parse(String(init.body)));
    if (url === '/api/albums') return json(200, [album]);
    if (url === '/api/albums/a1/edit-link' && init?.method === 'POST') return json(200, { editToken: token, expiresAt });
    return new Response(null, { status: 204 });
  }));
  await userEvent.click(await screen.findByRole('button', { name: 'Share Trip' }));
  const hours = screen.getByLabelText('Hours') as HTMLInputElement;
  expect(hours.value).toBe('8');
  await userEvent.clear(hours);
  await userEvent.type(hours, '24');
  await userEvent.click(screen.getByRole('button', { name: 'Create edit link' }));
  expect(bodies).toEqual([{ hours: 24 }]);
  const link = await screen.findByRole('textbox', { name: 'Edit link' }) as HTMLInputElement;
  expect(link.value).toBe(`${location.origin}/e/${token}`);
  expect(screen.getByText(/until/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Revoke edit link' }));
  expect(calls).toContain('DELETE /api/albums/a1/edit-link');
  expect(await screen.findByRole('button', { name: 'Create edit link' })).toBeTruthy();
});

test('the album list shows one button per mode; Manga opens the dialog in manga mode', async () => {
  setup(vi.fn().mockResolvedValue(json(200, [])));
  await userEvent.click(await screen.findByRole('button', { name: 'New manga album' }));
  expect(screen.getByRole('radio', { name: 'Manga' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radiogroup', { name: 'Reading direction' })).toBeTruthy();
});

test('Photobooth is a kind of its own: booth templates, no AI; an empty one starts on a strips page', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, []))
    .mockResolvedValueOnce(json(201, { id: 'b1', title: 'Booth', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'slate', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' }));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'New photobooth album' }));
  expect(screen.getByRole('radio', { name: 'Photobooth' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.queryByRole('radio', { name: '✨ AI' })).toBeNull();
  expect(screen.getByRole('radio', { name: /Party booth/ })).toBeTruthy();
  await userEvent.type(screen.getByLabelText('Album title'), 'Booth');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.mode).toBeUndefined(); // stored as a scrapbook album
  expect(body.design.pages[0].background).toBe('paper-black');
});
