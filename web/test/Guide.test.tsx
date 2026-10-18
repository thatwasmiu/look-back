import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Guide from '../src/pages/Guide';

afterEach(cleanup);
test('the guide lists every section in its table of contents, each feature as a heading', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Guide /></MemoryRouter>);
  const sections = screen.getAllByRole('heading', { level: 2 });
  const toc = screen.getByRole('navigation', { name: 'Mục lục' }).querySelectorAll('a');
  expect(toc).toHaveLength(sections.length);
  for (const a of toc) expect(document.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull();
  expect(screen.getByRole('heading', { level: 3, name: 'Ghim (Pin)' })).toBeTruthy();
  expect(screen.getAllByText('Crop', { selector: 'strong' }).length).toBeGreaterThan(0); // **bold** markup rendered
});

test('the guide has a Manga section with reading direction', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Guide /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 2, name: /Manga/ })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Đọc từ phải sang trái' })).toBeTruthy();
});
