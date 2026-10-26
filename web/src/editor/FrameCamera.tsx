import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { FrameEl } from '@scrapbook/shared';
import { useT } from '../i18n';

// "Chụp theo khung" (phones): an in-app camera whose preview shows the frame's own shape and proportions, so the
// owner composes the shot for that frame. A photo is cropped to the outlined area; a video is recorded whole (the frame
// shows its centre, which is the outlined area). The file then goes through the normal upload into that frame.
// Photobooth (when the page has more empty frames): one press shoots into this frame and then each next empty frame,
// a countdown before each shot, the camera window taking each frame's shape in turn.

type Mode = 'photo' | 'video' | 'booth';
type Facing = 'environment' | 'user';

// The photo area of a frame as drawn on the page (polaroids, film, mats… pad it, so it isn't the frame's own
// proportions): width / height and its corner rounding as percentages, so the camera window is the same shape at
// any size. null when the element isn't laid out.
export type WindowShape = { aspect: number; radius: string };
export function frameWindowShape(el: HTMLElement | null): WindowShape | null {
  if (!el?.offsetWidth || !el.offsetHeight) return null;
  const w = el.offsetWidth, h = el.offsetHeight;
  const cs = getComputedStyle(el);
  const keys = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const;
  const corners = keys.map((k) => cs[k] || cs.borderRadius || '0px');
  const pct = (v: string, size: number) => (v.endsWith('%') ? v : `${Math.round((parseFloat(v) || 0) / size * 10000) / 100}%`);
  const hs = corners.map((c) => pct(c.trim().split(/\s+/)[0], w));
  const vs = corners.map((c) => { const [a, b = a] = c.trim().split(/\s+/); return pct(b, h); });
  const same = (xs: string[]) => xs.every((x) => x === xs[0]);
  let radius: string;
  if ([...hs, ...vs].every((x) => parseFloat(x) === 0)) radius = '0px';
  else if (same(hs) && same(vs)) radius = hs[0] === vs[0] ? hs[0] : `${hs[0]} / ${vs[0]}`;
  else radius = `${hs.join(' ')} / ${vs.join(' ')}`;
  return { aspect: w / h, radius };
}

// Held upright the camera's picture is tall, so a wide frame only gets a thin slice of it (and the reverse held
// sideways): suggest turning the phone when the frame's shape fights the orientation.
const PORTRAIT = '(orientation: portrait)';
function usePortrait(): boolean {
  return useSyncExternalStore((cb) => {
    const mq = typeof matchMedia === 'function' ? matchMedia(PORTRAIT) : null;
    mq?.addEventListener?.('change', cb);
    return () => mq?.removeEventListener?.('change', cb);
  }, () => (typeof matchMedia === 'function' ? matchMedia(PORTRAIT).matches : true));
}
export const rotateHint = (aspect: number, portrait: boolean) =>
  portrait && aspect >= 1.25 ? 'Turn the phone sideways to fit the wide frame'
    : !portrait && aspect <= 0.8 ? 'Turn the phone upright to fit the tall frame' : null;

// Width / height of the frame on the page (pages are 3:4) — fallback when the photo area can't be measured.
export const frameAspect = (f: FrameEl) => (f.w * 3) / (f.h * 4);
const shapeOf = (f: FrameEl) => (f.frameStyle === 'circle' ? 'circle' : f.frameStyle === 'heart' ? 'heart' : f.shape ? 'panel' : 'rect');
const HI_RES = { width: { ideal: 3840 }, height: { ideal: 2160 } };
const VIDEO_TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const DELAYS = [0, 3, 5, 10] as const; // self-timer, seconds
const MODE_LABEL = { photo: 'Photo', booth: 'Photobooth', video: 'Video' } as const;
const MODE_ICON = { photo: '📷', booth: '🎞', video: '🎬' } as const;
const HEART = 'M50 88C10 60 0 38 0 24 0 10 11 0 25 0c11 0 20 6 25 15C55 6 64 0 75 0c14 0 25 10 25 24 0 14-10 36-50 64z';

// Zalo's in-app browser on iPhone can't play video inside the page: the live camera opens in iOS's fullscreen
// player instead of behind the frame. There the phone's own camera (Take photo/video) is the way.
export const inlineVideoBlocked = (ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) =>
  /Zalo/i.test(ua) && /iPhone|iPad|iPod/i.test(ua);

export type CameraTarget = { frame: FrameEl; shape: WindowShape | null };
const BOOTH_DELAY = 3; // s before each photobooth shot when the self-timer is off
const BOOTH_GAP_MS = 900; // pause on the next frame's shape before its countdown starts

// onCapture's frameId: a photobooth shot, for that frame (the camera stays open); without it, the one shot is done.
export function FrameCamera({ frame: first, windowShape: firstShape, more = [], onCapture, onClose }: {
  frame: FrameEl; windowShape?: WindowShape | null; more?: CameraTarget[]; onCapture(file: File, frameId?: string): void; onClose(): void;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('photo');
  const targets: CameraTarget[] = [{ frame: first, shape: firstShape ?? null }, ...more];
  const [boothAt, setBoothAt] = useState<number | null>(null); // index in targets while a photobooth run is going
  const boothRef = useRef<number | null>(null);
  const boothTimer = useRef<ReturnType<typeof setTimeout>>();
  const [flash, setFlash] = useState(0);
  const taken = useRef(0); // photobooth shots handed over in this run
  const { frame, shape: windowShape } = targets[boothAt ?? 0];
  const [facing, setFacing] = useState<Facing>('environment');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0); // bump to open the camera again (iOS ends the stream in the background)
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  // What this camera can do itself (Chrome Android: zoom, torch). Without camera zoom, photos get digital zoom.
  const [hw, setHw] = useState<{ zoom: { min: number; max: number; step: number } | null; torch: boolean }>({ zoom: null, torch: false });
  const [zoom, setZoomState] = useState(1);
  const [torch, setTorch] = useState(false);
  const pointers = useRef(new Map<number, number>()); // pointerId → x, for pinch
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  // Self-timer: the shutter (or Record) starts a countdown; tapping it again during the countdown cancels.
  const [delay, setDelay] = useState<(typeof DELAYS)[number]>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const aspect = windowShape?.aspect ?? frameAspect(frame);
  const hint = rotateHint(aspect, usePortrait());
  const maskId = `cam-mask-${useId().replace(/:/g, '')}`;
  const shapeEl = (fill: string) => (frame.frameStyle === 'heart'
    ? <path d={HEART} transform="scale(1 1.11)" fill={fill} />
    : <polygon points={(frame.shape ?? []).map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill={fill} />);
  const shape = shapeOf(frame);

  const release = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Without a size, browsers often open the camera at 640×480: ask for the best it has (up to 4K).
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, ...HI_RES }, audio: mode === 'video' }).then((s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const t = s.getVideoTracks?.()[0] ?? null;
      track.current = t;
      t?.addEventListener?.('ended', () => { if (stream.current === s) { stream.current = null; setSession((n) => n + 1); } });
      // iOS mutes the camera for a moment on rotation, Control Center, a notification…; muted for longer, it rarely
      // comes back by itself (the preview stays black): open it again.
      let muteTimer: ReturnType<typeof setTimeout> | undefined;
      t?.addEventListener?.('mute', () => {
        clearTimeout(muteTimer);
        muteTimer = setTimeout(() => {
          if (stream.current === s && t.muted && recorder.current?.state !== 'recording') { release(); setSession((n) => n + 1); }
        }, 1500);
      });
      t?.addEventListener?.('unmute', () => { clearTimeout(muteTimer); void videoRef.current?.play().catch(() => {}); });
      const caps = (t?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number; step?: number }; torch?: boolean };
      setHw({ zoom: caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 } : null, torch: !!caps.torch });
      setZoomState(caps.zoom?.min ?? 1);
      setTorch(false);
      const v = videoRef.current;
      if (v) {
        // iOS Safari plays a live preview inline only when muted as an attribute (React doesn't write `muted`).
        v.muted = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.srcObject = s;
        void v.play().catch(() => {});
      }
    }, (e: Error) => {
      if (!cancelled) setError(`${t(e.name === 'NotAllowedError' ? "You haven't allowed the camera." : "Couldn't open the camera.")} ${t('Use the “Take photo/video” button instead.')}`);
    }) ?? setError(`${t("This browser can't open the camera.")} ${t('Use the “Take photo/video” button instead.')}`);
    return () => { cancelled = true; release(); };
  }, [facing, mode === 'video', session]);

  // Turning the phone (or the browser pausing the preview on its own) can leave the live preview paused on black:
  // play it again.
  useEffect(() => {
    const v = videoRef.current;
    const resume = () => { if (stream.current && document.visibilityState === 'visible' && v?.paused) void v.play().catch(() => {}); };
    const later = () => setTimeout(resume, 300); // after the rotation's relayout
    v?.addEventListener('pause', resume);
    window.addEventListener('orientationchange', later);
    window.addEventListener('resize', later);
    return () => {
      v?.removeEventListener('pause', resume);
      window.removeEventListener('orientationchange', later);
      window.removeEventListener('resize', later);
    };
  }, []);

  // Leaving the app (switching apps, locking the phone): let go of the camera; coming back: open it again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (recorder.current?.state === 'recording') recorder.current.stop(); // keeps what was recorded
        release();
      } else if (!stream.current) setSession((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); pending.current?.(); pending.current = null; return; }
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  const cancelCountdown = () => {
    pending.current = null;
    setCountdown(null);
    clearTimeout(boothTimer.current);
    if (boothRef.current !== null) { // stopping a photobooth run: the shots taken so far are kept, and done
      boothRef.current = null;
      setBoothAt(null);
      if (taken.current) { release(); onClose(); }
    }
  };
  useEffect(() => () => clearTimeout(boothTimer.current), []);
  const later = (action: () => void) => () => {
    if (countdown !== null) return cancelCountdown();
    if (!delay) return action();
    pending.current = action;
    setCountdown(delay);
  };

  const zoomRange = hw.zoom ?? { min: 1, max: 4, step: 0.1 };
  const digital = !hw.zoom;
  const canZoom = !digital || mode === 'photo'; // digital zoom can't reach the recorded video
  const setZoom = (v: number) => {
    const z = Math.round(Math.min(zoomRange.max, Math.max(zoomRange.min, v)) * 10) / 10;
    setZoomState(z);
    if (!digital) void track.current?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => {});
  };
  const toggleTorch = () => {
    const on = !torch;
    setTorch(on);
    void track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => setTorch(!on));
  };
  const onPointer = (e: React.PointerEvent) => {
    if (!canZoom) return;
    if (e.type === 'pointerdown' || e.type === 'pointermove') pointers.current.set(e.pointerId, e.clientX);
    else { pointers.current.delete(e.pointerId); pinch.current = null; return; }
    if (pointers.current.size !== 2) return;
    const [a, b] = [...pointers.current.values()];
    const d = Math.abs(a - b) || 1;
    if (!pinch.current) pinch.current = { d, z: zoom };
    else setZoom(pinch.current.z * (d / pinch.current.d));
  };
  const scale = digital && canZoom ? zoom : 1;
  const feedTransform = facing === 'user' ? `scale(${-scale}, ${scale})` : scale === 1 ? '' : `scale(${scale})`;

  const file = (blob: Blob, ext: string) => new File([blob], `camera-${Date.now()}.${ext}`, { type: blob.type });
  const done = (blob: Blob, ext: string) => {
    release();
    onCapture(file(blob, ext));
  };

  // The outlined area, mapped from the screen back into the camera image (the preview fills the screen, cropped).
  const grab = (got: (b: Blob) => void) => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const vr = v.getBoundingClientRect();
    const wr = windowRef.current?.getBoundingClientRect();
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (wr?.width && vr.width) {
      const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
      const offX = (vr.width - v.videoWidth * scale) / 2, offY = (vr.height - v.videoHeight * scale) / 2;
      sx = (wr.left - vr.left - offX) / scale; sy = (wr.top - vr.top - offY) / scale;
      sw = wr.width / scale; sh = wr.height / scale;
    } else if (sw / sh > aspect) { sw = sh * aspect; sx = (v.videoWidth - sw) / 2; } else { sh = sw / aspect; sy = (v.videoHeight - sh) / 2; }
    const c = document.createElement('canvas');
    c.width = Math.round(sw); c.height = Math.round(sh);
    const g = c.getContext('2d');
    if (!g) return;
    if (facing === 'user') { g.translate(c.width, 0); g.scale?.(-1, 1); } // match the mirrored selfie preview
    g.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) got(b); }, 'image/jpeg', 0.92);
  };
  const shoot = () => grab((b) => done(b, 'jpg'));

  // Photobooth: countdown → shot into targets[i] → next frame's shape → … → close after the last.
  const boothShot = (i: number) => {
    pending.current = () => grab((b) => {
      if (boothRef.current !== i) return;
      onCapture(file(b, 'jpg'), targets[i].frame.id);
      taken.current++;
      setFlash((n) => n + 1);
      if (i + 1 >= targets.length) { boothRef.current = null; release(); onClose(); return; }
      boothRef.current = i + 1;
      setBoothAt(i + 1);
      boothTimer.current = setTimeout(() => boothShot(i + 1), BOOTH_GAP_MS);
    });
    setCountdown(delay || BOOTH_DELAY);
  };
  const startBooth = () => {
    if (countdown !== null || boothRef.current !== null) return cancelCountdown();
    taken.current = 0;
    boothRef.current = 0;
    setBoothAt(0);
    boothShot(0);
  };

  const record = () => {
    if (!stream.current) return;
    const type = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    const parts: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    r.onstop = () => {
      const blobType = (r.mimeType || type || 'video/webm').split(';')[0];
      done(new Blob(parts, { type: blobType }), blobType.includes('mp4') ? 'mp4' : 'webm');
    };
    recorder.current = r;
    r.start();
    setSeconds(0);
    setRecording(true);
  };
  const stopRecording = () => { setRecording(false); recorder.current?.stop(); };

  return (
    <div className="camera" role="dialog" aria-label={t('Shoot in the frame')}
      onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer}>
      <video ref={videoRef} className="camera-feed" style={{ transform: feedTransform }} autoPlay playsInline muted />
      <div ref={windowRef} className={`camera-window shape-${shape}`} style={{ aspectRatio: String(aspect), '--aspect': aspect, ...(windowShape && shape !== 'heart' && shape !== 'panel' && { borderRadius: windowShape.radius }) } as React.CSSProperties}>
        {/* little stickers on the corners of the frame */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((c, i) => <span key={c} className={`camera-deco deco-${c}`} aria-hidden>{i % 2 ? '♥' : '✿'}</span>)}
        {(shape === 'heart' || shape === 'panel') && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {/* dim the box outside the shape too, then draw its dashed outline */}
            <defs>
              <mask id={maskId}>
                <rect width="100" height="100" fill="white" />
                {shapeEl('black')}
              </mask>
            </defs>
            <rect className="camera-dim" width="100" height="100" mask={`url(#${maskId})`} />
            {shapeEl('none')}
          </svg>
        )}
      </div>
      {hint && !error && <p className="camera-hint" role="note"><span aria-hidden>📱↻</span> {t(hint)} <small>({t('turn off rotation lock if it is on')})</small></p>}
      {error && <p className="camera-error" role="alert">{error}</p>}
      {countdown !== null && <p className="camera-countdown" role="status" aria-live="assertive">{countdown}</p>}
      {flash > 0 && <div key={flash} className="camera-flash" aria-hidden />}
      {mode === 'booth' && <p className="camera-booth-count">{t('Shot {n} of {total}', { n: (boothAt ?? 0) + 1, total: targets.length })}</p>}
      {recording && <p className="camera-timer" role="status"><span className="rec-dot" aria-hidden />{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
      <div className="camera-top">
        <button type="button" className="camera-round" aria-label={t('Close')} onClick={() => { cancelCountdown(); if (recording) recorder.current?.stop(); release(); onClose(); }}>✕</button>
        <div className="mode-switch" role="radiogroup" aria-label={t('Mode')}>
          {(more.length ? ['photo', 'booth', 'video'] as const : ['photo', 'video'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-label={t(MODE_LABEL[m])} aria-checked={mode === m} disabled={recording || boothAt !== null}
              onClick={() => { cancelCountdown(); setMode(m); }}>{MODE_ICON[m]} {t(MODE_LABEL[m])}</button>
          ))}
        </div>
        <button type="button" className="camera-round camera-delay" aria-label={t('Self-timer')} aria-pressed={delay > 0} disabled={recording || countdown !== null}
          onClick={() => setDelay(DELAYS[(DELAYS.indexOf(delay) + 1) % DELAYS.length])}>
          {delay ? `${delay}s` : <TimerIcon />}
        </button>
      </div>
      {canZoom && (
        <label className="camera-zoom">
          <input type="range" aria-label="Zoom" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} />
          <span className="camera-pill">{zoom.toFixed(1)}×</span>
        </label>
      )}
      <div className="camera-bottom">
        <button type="button" className="camera-round camera-flip" aria-label={t('Switch camera')} disabled={recording || boothAt !== null} onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}><FlipIcon /></button>
        {mode === 'booth' ? <button type="button" className="camera-shutter booth" aria-label={t(boothAt !== null ? 'Stop' : 'Start photobooth')} onClick={startBooth}><span aria-hidden>{boothAt !== null ? '■' : '★'}</span></button>
          : mode === 'photo' ? <button type="button" className="camera-shutter" aria-label={t(countdown !== null ? 'Cancel' : 'Shoot')} onClick={later(shoot)}><span aria-hidden>♥</span></button>
          : recording ? <button type="button" className="camera-shutter recording" aria-label={t('Stop')} onClick={stopRecording}><span aria-hidden /></button>
            : <button type="button" className="camera-shutter rec" aria-label={t(countdown !== null ? 'Cancel' : 'Record')} onClick={later(record)}><span aria-hidden /></button>}
        {hw.torch && <button type="button" className="camera-round camera-torch" aria-label={t('⚡ Light')} aria-pressed={torch} onClick={toggleTorch}><BoltIcon /></button>}
      </div>
    </div>
  );
}

// Line icons in the camera's ink colour (emoji like 🔄 / ⚡ look different on every phone, often a blue square).
function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5a8 8 0 0 1 14.2-3.6" />
      <path d="M18.6 2.8v3.6H15" />
      <path d="M20 14.5a8 8 0 0 1-14.2 3.6" />
      <path d="M5.4 21.2v-3.6H9" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 2M9.5 2.5h5" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M13.5 2.5 5.5 13.5h5.2l-1.2 8 8-11h-5.2z" />
    </svg>
  );
}

