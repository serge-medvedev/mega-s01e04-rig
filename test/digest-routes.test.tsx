import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, ReadNightResult, RunCounts } from '../src/digest/types.js';

const configBase = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

const counts: RunCounts = { ok: 2, retry: 3, fail: 1 };

const expectedRows: DigestRow[] = [
  {
    job: 'alpha',
    owner: 'ada',
    runs: 1,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T08:00:00+02:00',
    lastAt: '2026-10-28T08:00:00+02:00',
    hasFailure: false,
  },
  {
    job: 'zeta',
    owner: null,
    runs: 5,
    retries: 3,
    lastStatus: 'ok',
    lastError: 'temporary outage',
    firstAt: '2026-10-28T08:01:00+02:00',
    lastAt: '2026-10-28T08:04:00+02:00',
    hasFailure: true,
  },
];

const event = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
    await mkdir(runsDir, { recursive: true });
    await writeFile(
      join(runsDir, '2026-10-28.jsonl'),
      [
        event('2026-10-28T08:01:00+02:00', 'zeta', 'retry', null),
        '{malformed json',
        event('2026-10-28T08:00:00+02:00', 'alpha', 'ok', 'ada'),
        event('2026-10-28T08:02:00+02:00', 'zeta', 'retry', null),
        event('2026-10-28T08:03:00+02:00', 'zeta', 'retry', null),
        event('2026-10-28T08:04:00+02:00', 'zeta', 'fail', null, 'temporary outage'),
        event('2026-10-28T08:05:00+02:00', 'zeta', 'ok', null),
      ].join('\n') + '\n',
    );
    await writeFile(join(runsDir, '2026-10-27.jsonl'), '');
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({ ...configBase, runsDir });
  }

  it('serves the same sorted jobs from HTML and JSON, retaining digest details', async () => {
    const [page, json] = await Promise.all([
      app().request('/digest/2026-10-28'),
      app().request('/api/digest/2026-10-28'),
    ]);

    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const html = await page.text();
    const body = (await json.json()) as ReadNightResult;
    expect(body).toEqual({ found: true, rows: expectedRows, badLines: 1, counts });

    const alphaPosition = html.indexOf('<td>alpha</td>');
    const zetaPosition = html.indexOf('<td>zeta</td>');
    expect(alphaPosition).toBeGreaterThan(-1);
    expect(zetaPosition).toBeGreaterThan(alphaPosition);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<span class="warn">3 · high</span>');
    expect(html).toContain('<span class="warn">yes</span>');
    expect(html).toContain('2026-10-28T08:01:00+02:00');
    expect(html).toContain('2026-10-28T08:05:00+02:00');
    expect(html).toContain('1 bad line');
  });

  it('returns 404 for a missing night on both routes', async () => {
    const [page, json] = await Promise.all([
      app().request('/digest/2026-10-26'),
      app().request('/api/digest/2026-10-26'),
    ]);

    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
    expect(await json.json()).toEqual({ found: false });
  });

  it('renders an empty night and returns an empty JSON result', async () => {
    const [page, json] = await Promise.all([
      app().request('/digest/2026-10-27'),
      app().request('/api/digest/2026-10-27'),
    ]);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      found: true,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
