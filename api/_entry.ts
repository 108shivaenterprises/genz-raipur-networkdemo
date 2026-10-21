import '../server/vercelBoot.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import app, { ready } from '../server.js';
import { handleShared, sharedMode } from '../server/sharedSync.js';

const run = app as unknown as (a: IncomingMessage, b: ServerResponse) => void;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  // v39: with DATABASE_URL the demo keeps its data in Supabase across cold starts (server/sharedSync.ts)
  if (sharedMode()) return handleShared(req, res, run);
  run(req, res);
}
