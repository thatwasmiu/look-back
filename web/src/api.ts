import type { AlbumBundle, AlbumDTO, AlbumSummary, MediaDTO, PageDTO, PageLayout } from '@scrapbook/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// `quiet` calls (login, check) handle 401 themselves instead of redirecting.
async function req<T>(method: string, path: string, body?: unknown, quiet = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
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
  check: () => req<void>('GET', '/auth/check', undefined, true).then(() => true, () => false),
  listAlbums: () => req<AlbumSummary[]>('GET', '/albums'),
  createAlbum: (title: string) => req<AlbumDTO>('POST', '/albums', { title }),
  updateAlbum: (id: string, patch: { title?: string; coverMediaId?: string | null }) =>
    req<AlbumDTO>('PATCH', `/albums/${id}`, patch),
  deleteAlbum: (id: string) => req<void>('DELETE', `/albums/${id}`),
  getAlbum: (id: string) => req<AlbumBundle>('GET', `/albums/${id}`),
  addPage: (albumId: string, templateId: string, position?: number) =>
    req<PageDTO>('POST', `/albums/${albumId}/pages`, { templateId, position }),
  savePage: (id: string, layout: PageLayout) => req<PageDTO>('PUT', `/pages/${id}`, { layout }),
  deletePage: (id: string) => req<void>('DELETE', `/pages/${id}`),
  reorderPages: (albumId: string, pageIds: string[]) => req<void>('PUT', `/albums/${albumId}/page-order`, { pageIds }),
  getMedia: (id: string) => req<MediaDTO>('GET', `/media/${id}`),
  deleteMedia: (id: string) => req<void>('DELETE', `/media/${id}`),
};
