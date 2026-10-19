// Dev-only: screenshots for the usage guide (/guide) → web/public/guide/*.jpg.
// Uses the dev server's /dev/editor and /dev/viewer (sample media, no backend); the album list is fed mocked API data.
// 1. Start the Vite preview (see README), then from the repo root:
// 2. docker run --rm -v "$PWD/web:/web" -w /tmp mcr.microsoft.com/playwright:v1.47.2-jammy \
//      sh -c "npm i -s playwright@1.47.2 && cp /web/src/dev/guide-shots.mjs . && node guide-shots.mjs /web/public/guide"
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://host.docker.internal:5173';
const OUT = process.argv[2] ?? 'guide';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shot = (page, name, clip) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 78, ...(clip && { clip }) });
const settle = (page) => page.waitForTimeout(700); // pickers / thumbnails fade in
const btn = (page, name) => page.getByRole('button', { name, exact: true });

// ---- Album list (mocked API) ----
const album = (id, title, cover, pageCount, shareToken = null) => ({
  id, title, coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken,
  coverThumb: cover && `dev-samples/${cover}.webp`, pageCount,
});
{
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  await page.route('**/api/auth/check', (r) => r.fulfill({ status: 204 }));
  await page.route('**/api/albums', (r) => r.fulfill({ json: [
    album('a1', 'Đà Lạt 2026', 'pine-forest', 6, 'x'.repeat(43)),
    album('a2', 'Biển Quy Nhơn', 'beach', 4),
    album('a3', 'Tà Xùa', 'lake-mountains', 3),
  ] }));
  await page.goto(`${BASE}/`);
  await page.getByText('Biển Quy Nhơn').waitFor();
  await settle(page);
  await shot(page, 'albums');
  await btn(page, 'New album').click();
  await page.getByLabel('Album title').fill('Tà Xùa 2026');
  await page.getByRole('radio', { name: '2 3 con mực' }).click();
  await shot(page, 'new-album');
  await page.getByRole('radio', { name: 'Manga' }).click();
  await page.getByRole('radio', { name: 'Right → left' }).click();
  await shot(page, 'manga-new-album');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Share Đà Lạt 2026' }).click();
  await settle(page);
  await shot(page, 'share');
  await page.close();
}

// ---- Editor (laptop) ----
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(`${BASE}/dev/editor`);
  await page.locator('.edit-page [data-el]').first().waitFor();
  await settle(page);
  await shot(page, 'editor');

  for (const [name, button] of [['stickers', 'Sticker'], ['frames', 'Frame'], ['background', 'Background'], ['paper', 'Paper'], ['effects', 'Effect']]) {
    await btn(page, button).click();
    await settle(page);
    await shot(page, name);
    await page.keyboard.press('Escape');
  }

  // A photo: selected (toolbar shows Pin / Duplicate / Crop), then crop mode.
  await page.locator('.edit-page [data-el]:has(img)').first().click();
  await settle(page);
  await shot(page, 'selected');
  await btn(page, 'Crop').click();
  await settle(page);
  await shot(page, 'crop');
  await btn(page, 'Done').click();

  // New empty frame → "+ add" menu.
  await btn(page, 'Frame').click();
  await page.locator('.frame-swatch').first().click();
  await page.locator('.edit-page [data-el]:has-text("+ add")').last().click();
  await settle(page);
  await shot(page, 'frame-menu');
  await btn(page, 'Close').click();

  // Text with the Font panel (typeface, size, color) open.
  await btn(page, 'Text').click();
  await btn(page, 'Font').click();
  await settle(page);
  await shot(page, 'text');
  await page.keyboard.press('Escape');

  // Pages strip open + template picker.
  if (await page.locator('.page-strip:not(.open)').count()) await page.locator('.strip-tab').click();
  await settle(page);
  await shot(page, 'pages');
  await page.getByRole('button', { name: 'Add page' }).click();
  await settle(page);
  await shot(page, 'templates');
  await page.close();
}

// ---- Manga editor (dev sample: slanted panels, shout bubble, sound effect, speed lines) ----
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(`${BASE}/dev/editor?manga`);
  await page.locator('.edit-page .frame-panel').first().waitFor();
  await settle(page);
  await shot(page, 'manga-editor');
  await page.close();
}

// ---- Viewer ----
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(`${BASE}/dev/viewer`);
  await page.locator('.book').waitFor();
  await page.waitForTimeout(1500);
  await shot(page, 'viewer');
  await page.close();
}

// ---- Phone ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/dev/editor`);
  await page.locator('.edit-page [data-el]').first().waitFor();
  await settle(page);
  await shot(page, 'phone');
  await page.close();
}

await browser.close();
console.log('guide shots written to', OUT);
