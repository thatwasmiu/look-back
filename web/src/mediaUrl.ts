// `||`, not `??`: a Docker build arg left unset arrives as "".
const base = (import.meta.env.VITE_MEDIA_BASE_URL || '/media').replace(/\/+$/, '');
// Keys that are already absolute paths (the built-in example album's art) are served as-is.
export const mediaUrl = (key: string): string => (key.startsWith('/') ? key : `${base}/${key}`);
