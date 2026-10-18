import type { AlbumBundle, AlbumDesign, ReadingDirection, AlbumDTO, BackgroundColor, BackgroundEffect, AlbumSummary, MediaDTO, PageDTO, PageLayout } from '@scrapbook/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// `quiet` calls (login, check) handle 401 themselves instead of redirecting.
// keepalive: the request survives page unload (flush on tab hide / route leave).
async function req<T>(method: string, path: string, body?: unknown, quiet = false, keepalive = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method, keepalive,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !quiet) window.location.assign('/login'); // the only 401 redirect
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? data?.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (password: string) => req<void>('POST', '/auth/login', { password }, true),
  logout: () => req<void>('POST', '/auth/logout'),
  // false only on 401; network/5xx errors propagate so callers can tell "logged out" from "server down".
  check: () =>
    req<void>('GET', '/auth/check', undefined, true).then(
      () => true,
      (e) => { if (e instanceof ApiError && e.status === 401) return false; throw e; },
    ),
  listAlbums: () => req<AlbumSummary[]>('GET', '/albums'),
  createAlbum: (title: string, from?: { fromAlbumId: string } | { design: AlbumDesign }, manga?: { mode: 'manga'; readingDirection: ReadingDirection }) =>
    req<AlbumDTO>('POST', '/albums', { title, ...from, ...manga }),
  updateAlbum: (id: string, patch: { title?: string; coverMediaId?: string | null; musicMediaId?: string | null; backgroundEffect?: BackgroundEffect; backgroundColor?: BackgroundColor; readingDirection?: ReadingDirection }) =>
    req<AlbumDTO>('PATCH', `/albums/${id}`, patch),
  deleteAlbum: (id: string) => req<void>('DELETE', `/albums/${id}`),
  getAlbum: (id: string) => req<AlbumBundle>('GET', `/albums/${id}`),
  shareAlbum: (id: string) => req<{ shareToken: string }>('POST', `/albums/${id}/share`),
  unshareAlbum: (id: string) => req<void>('DELETE', `/albums/${id}/share`),
  // Public share link: quiet — a dead link must not bounce visitors to the owner's login page.
  getShared: (token: string) => req<AlbumBundle>('GET', `/share/${encodeURIComponent(token)}`, undefined, true),
  addPage: (albumId: string, templateId: string, position?: number) =>
    req<PageDTO>('POST', `/albums/${albumId}/pages`, { templateId, position }),
  savePage: (id: string, layout: PageLayout, opts?: { keepalive?: boolean }) =>
    req<PageDTO>('PUT', `/pages/${id}`, { layout }, false, opts?.keepalive),
  deletePage: (id: string) => req<void>('DELETE', `/pages/${id}`),
  reorderPages: (albumId: string, pageIds: string[]) => req<void>('PUT', `/albums/${albumId}/page-order`, { pageIds }),
  getMedia: (id: string) => req<MediaDTO>('GET', `/media/${id}`),
  deleteMedia: (id: string) => req<void>('DELETE', `/media/${id}`),
};
