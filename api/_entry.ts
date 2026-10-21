import '../server/vercelBoot.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import app, { ready } from '../server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  (app as unknown as (a: IncomingMessage, b: ServerResponse) => void)(req, res);
}
