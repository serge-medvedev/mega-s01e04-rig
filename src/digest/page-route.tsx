import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import type { ReadNight } from './types.js';
import { DigestPage } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function registerDigestPage(app: Hono, config: RigConfig, read: ReadNight) {
  app.get('/digest/:night', (c) => {
    const { night } = c.req.param();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.notFound();

    const result = read(config.runsDir, night);
    if (!result.found) return c.notFound();

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} rows={result.rows} badLines={result.badLines} />
      </Layout>,
    );
  });
}
