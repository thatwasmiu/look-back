import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MediaDTO } from '@scrapbook/shared';
import { MediaTray } from '../src/editor/MediaTray';
import { ACCEPT } from '../src/editor/useUpload';

afterEach(cleanup);

test('shows a processing… chip for processing media; the file input accepts exactly ACCEPT', () => {
  const m: MediaDTO = { id: 'm1', albumId: 'a1', kind: 'image', status: 'processing', width: null, height: null, durationSec: null, blurDataUrl: null, variants: null, error: null };
  const { container } = render(<MediaTray media={[m]} items={[]} coverMediaId={null}
    onUpload={vi.fn()} onRetry={vi.fn()} onPick={vi.fn()} onDrop={vi.fn()} onDelete={vi.fn()} onSetCover={vi.fn()} />);
  expect(screen.getByText('processing…')).toBeTruthy();
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input.accept).toBe(ACCEPT);
  expect(ACCEPT).toBe('image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm');
  expect(input.multiple).toBe(true);
});
