export const mediaUrl = (key: string): string => `${import.meta.env.VITE_MEDIA_BASE_URL ?? '/media'}/${key}`;
