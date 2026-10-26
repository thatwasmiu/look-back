// For browsers without container query units (iOS < 16 and the in-app browsers built on it): every size
// container gets --cqw / --cqh as px, which the compiled styles use instead of cqw / cqh (see vite.config.ts).
// Keep the selector list in step with the `container-type: size` rules in the CSS.
const CONTAINERS = '.page, .stage, .edit-stage, .frame-swatch, .bg-swatch, .effect-swatch';
const needed = typeof CSS !== 'undefined' && !CSS.supports('width', '1cqw');
// A space page's units are one tile's (PageRenderer): its size divided by its columns / rows.
const setUnits = (el: HTMLElement, w: number, h: number) => {
  el.style.setProperty('--cqw', `${w / Number(el.dataset.cols ?? 1) / 100}px`);
  el.style.setProperty('--cqh', `${h / Number(el.dataset.rows ?? 1) / 100}px`);
};

// Set the units right now for the containers in `root` (the observer below fills them in a frame later): Share to
// social photographs its off-screen pages at once, and on iOS < 16 their words came out the wrong size.
export function applyContainerUnits(root: ParentNode): void {
  if (!needed) return;
  root.querySelectorAll<HTMLElement>(CONTAINERS).forEach((el) => setUnits(el, el.clientWidth, el.clientHeight));
}

if (needed && typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) setUnits(target as HTMLElement, contentRect.width, contentRect.height);
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
