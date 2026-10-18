// For browsers without container query units (iOS < 16 and the in-app browsers built on it): every size
// container gets --cqw / --cqh as px, which the compiled styles use instead of cqw / cqh (see vite.config.ts).
// Keep the selector list in step with the `container-type: size` rules in the CSS.
const CONTAINERS = '.page, .stage, .edit-stage, .frame-swatch, .bg-swatch, .effect-swatch';

if (typeof CSS !== 'undefined' && !CSS.supports('width', '1cqw') && typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      (target as HTMLElement).style.setProperty('--cqw', `${contentRect.width / 100}px`);
      (target as HTMLElement).style.setProperty('--cqh', `${contentRect.height / 100}px`);
    }
  });
  const seen = new WeakSet<Element>();
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll(CONTAINERS).forEach((el) => { if (!seen.has(el)) { seen.add(el); ro.observe(el); } });
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  scan();
}
