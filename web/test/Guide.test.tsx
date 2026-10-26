import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Guide from '../src/pages/Guide';
import { setLang } from '../src/i18n';

afterEach(() => { cleanup(); setLang('en'); });
test('the guide lists every section in its table of contents, each feature as a heading', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Guide /></MemoryRouter>);
  const sections = screen.getAllByRole('heading', { level: 2 });
  const toc = screen.getByRole('navigation', { name: 'Contents' }).querySelectorAll('a');
  expect(toc).toHaveLength(sections.length);
  for (const a of toc) expect(document.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull();
  expect(screen.getByRole('heading', { level: 3, name: 'Pin' })).toBeTruthy();
  expect(screen.getAllByText('Crop', { selector: 'strong' }).length).toBeGreaterThan(0); // **bold** markup rendered
});

test('the guide has a Manga section with reading direction', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Guide /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 2, name: /Manga/ })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Right-to-left reading' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Panels and layouts' })).toBeTruthy();
  expect(screen.getByText(/Tail/, { selector: 'strong' })).toBeTruthy();
});

test('opened from the editor (installed app), ← Back goes back to the editor', async () => {
  const { Routes, Route } = await import('react-router-dom');
  const { default: userEvent } = await import('@testing-library/user-event');
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={['/albums/a1/edit', { pathname: '/guide', state: { back: true } }]} initialIndex={1}>
      <Routes><Route path="/guide" element={<Guide />} /><Route path="/albums/a1/edit" element={<p>editor</p>} /></Routes>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('link', { name: '← Back' }));
  expect(screen.getByText('editor')).toBeTruthy();
});

test('in Vietnamese the guide is Vietnamese, with the same sections', () => {
  setLang('vi');
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Guide /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'Hướng dẫn sử dụng' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Mục lục' }).querySelectorAll('a')).toHaveLength(12);
  expect(screen.getByRole('heading', { level: 3, name: 'Link sửa (cho người khác cùng làm)' })).toBeTruthy();
});

