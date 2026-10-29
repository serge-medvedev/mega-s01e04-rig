import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import type { ReadNight } from './types.js';

/** Register the JSON endpoint using the same reader as the digest page. */
export function registerDigestJson(
  app: Hono,
  config: RigConfig,
  read: ReadNight,
): void {
  app.get('/api/digest/:night', (c) => {
    const result = read(config.runsDir, c.req.param('night'));
    if (!result.found) return c.json(result, 404);
    return c.json(result);
  });
}
