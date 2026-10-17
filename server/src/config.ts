export type Config = {
  port: number;
  databaseUrl: string;
  ownerPasswordHash: string;
  sessionSecret: string;
  mediaDir: string;
  uploadDir: string;
  maxUploadBytes: number;
  videoRenditions: number[];
  ffmpegPreset: string;
  cookieSecure: boolean;
  trustProxy: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['DATABASE_URL', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET', 'MEDIA_DIR', 'UPLOAD_DIR'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL!,
    ownerPasswordHash: env.OWNER_PASSWORD_HASH!,
    sessionSecret: env.SESSION_SECRET!,
    mediaDir: env.MEDIA_DIR!,
    uploadDir: env.UPLOAD_DIR!,
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 4294967296),
    videoRenditions: (env.VIDEO_RENDITIONS ?? '720').split(',').map(Number),
    ffmpegPreset: env.FFMPEG_PRESET ?? 'veryfast',
    cookieSecure: env.COOKIE_SECURE !== 'false',
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
