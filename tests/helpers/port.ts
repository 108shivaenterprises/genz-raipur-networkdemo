/**
 * Audit F18 — every test file starts its own server. Picking "base + random(0..89)" made files that share a base collide
 * (EADDRINUSE) when vitest runs them in parallel. Ask the OS for a free port instead.
 */
import net from 'node:net';

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = typeof a === 'object' && a ? a.port : 0;
      s.close(() => resolve(port));
    });
  });
}
