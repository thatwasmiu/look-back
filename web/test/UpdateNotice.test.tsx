import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateNotice } from '../src/UpdateNotice';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const serverHas = (version: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version }))));

test('a different build on the server shows the update modal; "Để sau" hides it', async () => {
  serverHas('202610200900');
  render(<UpdateNotice current="202610190800" />);
  expect(await screen.findByRole('dialog', { name: 'A new version is ready' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('same build, or the dev server: no modal (dev never asks)', async () => {
  serverHas('202610190800');
  render(<UpdateNotice current="202610190800" />);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('dialog')).toBeNull();
  cleanup();
  const f = vi.fn();
  vi.stubGlobal('fetch', f);
  render(<UpdateNotice current="dev" />);
  expect(f).not.toHaveBeenCalled();
});
