// `||`, not `??`: a Docker build arg left unset arrives as "".
const base = (import.meta.env.VITE_MEDIA_BASE_URL || '/media').replace(/\/+$/, '');
export const mediaUrl = (key: string): string => `${base}/${key}`;
