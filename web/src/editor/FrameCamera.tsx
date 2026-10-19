import { useEffect, useId, useRef, useState } from 'react';
import type { FrameEl } from '@scrapbook/shared';

// "Chụp theo khung" (phones): an in-app camera whose preview shows the frame's own shape and proportions, so the
// owner composes the shot for that frame. A photo is cropped to the outlined area; a video is recorded whole (the frame
// shows its centre, which is the outlined area). The file then goes through the normal upload into that frame.

type Mode = 'photo' | 'video';
type Facing = 'environment' | 'user';

// Width / height of the frame on the page (pages are 3:4).
export const frameAspect = (f: FrameEl) => (f.w * 3) / (f.h * 4);
const shapeOf = (f: FrameEl) => (f.frameStyle === 'circle' ? 'circle' : f.frameStyle === 'heart' ? 'heart' : f.shape ? 'panel' : 'rect');
const HI_RES = { width: { ideal: 3840 }, height: { ideal: 2160 } };
const VIDEO_TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const HEART = 'M50 88C10 60 0 38 0 24 0 10 11 0 25 0c11 0 20 6 25 15C55 6 64 0 75 0c14 0 25 10 25 24 0 14-10 36-50 64z';

export function FrameCamera({ frame, onCapture, onClose }: { frame: FrameEl; onCapture(file: File): void; onClose(): void }) {
  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<Facing>('environment');
  const [error, setError] = useState<string | null>(null);
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
  const aspect = frameAspect(frame);
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
      const caps = (t?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number; step?: number }; torch?: boolean };
      setHw({ zoom: caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 } : null, torch: !!caps.torch });
      setZoomState(caps.zoom?.min ?? 1);
      setTorch(false);
      const v = videoRef.current;
      if (v) { v.srcObject = s; void v.play().catch(() => {}); }
    }, (e: Error) => {
      if (!cancelled) setError(`${e.name === 'NotAllowedError' ? 'Bạn chưa cho phép dùng camera.' : 'Không mở được camera.'} Hãy dùng nút Take photo/video.`);
    }) ?? setError('Trình duyệt này không mở được camera. Hãy dùng nút Take photo/video.');
    return () => { cancelled = true; release(); };
  }, [facing, mode]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

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

  const done = (blob: Blob, ext: string) => {
    release();
    onCapture(new File([blob], `camera-${Date.now()}.${ext}`, { type: blob.type }));
  };

  // The outlined area, mapped from the screen back into the camera image (the preview fills the screen, cropped).
  const shoot = () => {
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
    c.toBlob((b) => { if (b) done(b, 'jpg'); }, 'image/jpeg', 0.92);
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
    <div className="camera" role="dialog" aria-label="Chụp theo khung"
      onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer}>
      <video ref={videoRef} className="camera-feed" style={{ transform: feedTransform }} autoPlay playsInline muted />
      <div ref={windowRef} className={`camera-window shape-${shape}`} style={{ aspectRatio: String(aspect), '--aspect': aspect } as React.CSSProperties}>
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
      {error && <p className="camera-error" role="alert">{error}</p>}
      {recording && <p className="camera-timer" role="status"><span className="rec-dot" aria-hidden />{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
      <div className="camera-top">
        <button type="button" className="camera-round" aria-label="Đóng" onClick={() => { if (recording) recorder.current?.stop(); release(); onClose(); }}>✕</button>
        <div className="mode-switch" role="radiogroup" aria-label="Chế độ">
          {(['photo', 'video'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-label={m === 'photo' ? 'Ảnh' : 'Video'} aria-checked={mode === m} disabled={recording} onClick={() => setMode(m)}>{m === 'photo' ? '📷 Ảnh' : '🎬 Video'}</button>
          ))}
        </div>
      </div>
      {canZoom && (
        <label className="camera-zoom">
          <input type="range" aria-label="Zoom" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} />
          <span className="camera-pill">{zoom.toFixed(1)}×</span>
        </label>
      )}
      <div className="camera-bottom">
        <button type="button" className="camera-round camera-flip" aria-label="Đổi camera" disabled={recording} onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}>🔄</button>
        {mode === 'photo' ? <button type="button" className="camera-shutter" aria-label="Chụp" onClick={shoot}><span aria-hidden>♥</span></button>
          : recording ? <button type="button" className="camera-shutter recording" aria-label="Dừng" onClick={stopRecording}><span aria-hidden /></button>
            : <button type="button" className="camera-shutter rec" aria-label="Quay" onClick={record}><span aria-hidden /></button>}
        {hw.torch && <button type="button" className="camera-round camera-torch" aria-label="⚡ Đèn" aria-pressed={torch} onClick={toggleTorch}>⚡</button>}
      </div>
    </div>
  );
}
