import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Just enough of the Gemini generateContent endpoint for the AI tests: answers with whatever the test queued
// (`text` is wrapped as the model's JSON answer; `body` is sent as-is), and remembers the last request.
type Reply = { status?: number; body?: unknown; text?: string; delayMs?: number };

export async function startFakeGemini() {
  let next: Reply = { text: '{}' };
  let last: { headers: Record<string, string>; url: string; body: any } | null = null;
  const server = createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on('data', (c) => parts.push(c)).on('end', () => {
      last = { headers: req.headers as Record<string, string>, url: req.url!, body: JSON.parse(Buffer.concat(parts).toString() || 'null') };
      const r = next;
      setTimeout(() => {
        if (res.destroyed) return;
        const body = r.body ?? { candidates: [{ content: { parts: [{ text: r.text ?? '' }] }, finishReason: 'STOP' }] };
        res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    reply(r: Reply) { next = r; },
    lastRequest: () => last,
    close: () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}
