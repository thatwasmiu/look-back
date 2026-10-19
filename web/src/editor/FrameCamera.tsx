import { useEffect, useRef, useState } from 'react';
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
  const recorder = useRef<MediaRecorder | null>(null);
  const aspect = frameAspect(frame);
  const shape = shapeOf(frame);

  const release = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Without a size, browsers often open the camera at 640×480: ask for the best it has (up to 4K).
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, ...HI_RES }, audio: mode === 'video' }).then((s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
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
    <div className="camera" role="dialog" aria-label="Chụp theo khung">
      <video ref={videoRef} className={`camera-feed${facing === 'user' ? ' mirrored' : ''}`} autoPlay playsInline muted />
      <div ref={windowRef} className={`camera-window shape-${shape}`} style={{ aspectRatio: String(aspect), '--aspect': aspect } as React.CSSProperties}>
        {(shape === 'heart' || shape === 'panel') && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {shape === 'heart' ? <path d={HEART} transform="scale(1 1.11)" />
              : <polygon points={frame.shape!.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} />}
          </svg>
        )}
      </div>
      {error && <p className="camera-error" role="alert">{error}</p>}
      {recording && <p className="camera-timer" role="status">● {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
      <div className="camera-top">
        <button type="button" onClick={() => { if (recording) recorder.current?.stop(); release(); onClose(); }}>Đóng</button>
        <div className="mode-switch" role="radiogroup" aria-label="Chế độ">
          {(['photo', 'video'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={recording} onClick={() => setMode(m)}>{m === 'photo' ? 'Ảnh' : 'Video'}</button>
          ))}
        </div>
      </div>
      <div className="camera-bottom">
        <button type="button" disabled={recording} onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}>Đổi camera</button>
        {mode === 'photo' ? <button type="button" className="camera-shutter" onClick={shoot}>Chụp</button>
          : recording ? <button type="button" className="camera-shutter recording" onClick={stopRecording}>Dừng</button>
            : <button type="button" className="camera-shutter rec" onClick={record}>Quay</button>}
      </div>
    </div>
  );
}
