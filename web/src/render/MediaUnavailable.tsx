// Shown in a frame whose photo / video can't be loaded (e.g. its storage bucket is down): a little crying face
// instead of a broken image. Original art in the style of the app's stickers.
export function MediaUnavailable() {
  return (
    <div className="media-unavailable" role="img" aria-label="Ảnh tạm thời không tải được">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="40" fill="#fff4e0" stroke="#4a3b2c" strokeWidth="4" />
        <circle cx="30" cy="58" r="7" fill="#f6b8b0" opacity=".7" />
        <circle cx="70" cy="58" r="7" fill="#f6b8b0" opacity=".7" />
        {/* T T eyes */}
        <path d="M27 38h16M35 38v12M57 38h16M65 38v12" stroke="#4a3b2c" strokeWidth="4" strokeLinecap="round" />
        {/* tears */}
        <path d="M35 54q-4 7 0 11q4-4 0-11z M65 54q-4 7 0 11q4-4 0-11z" fill="#7cc0e8" />
        {/* wobbly mouth */}
        <path d="M41 72q4.5-5 9 0q4.5 5 9 0" fill="none" stroke="#4a3b2c" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <span>Ảnh tạm thời không tải được</span>
    </div>
  );
}
