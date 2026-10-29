import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const event = {
  at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook',
};
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map(value => JSON.stringify(value)).join('\n'));
}

describe('readNight', () => {
  it('reads the real night without changing it', () => {
    const result = readNight('runs', night);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('Fixture night missing');
    expect(result.badLines).toBe(1);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result.rows[0].owner).toBeNull();
    expect(result.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
  });

  it('aggregates by instant across offsets and preserves timestamp text and earlier failures', () => {
    writeEvents([
      { ...event, at: '2026-10-29T01:00:00+02:00', owner: null },
      { ...event, at: '2026-10-28T21:00:00Z', status: 'fail', error: 'old error' },
      { ...event, at: '2026-10-28T18:00:00-04:00', status: 'retry', error: 'latest error' },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      found: true, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
        lastError: 'latest error', firstAt: '2026-10-28T21:00:00Z',
        lastAt: '2026-10-29T01:00:00+02:00', hasFailure: true,
      }],
    });
  });

  it('breaks timestamp ties by file order, including supplied empty errors', () => {
    writeEvents([
      { ...event, status: 'fail', error: 'first error' },
      { ...event, owner: null, error: '' },
    ]);
    const result = readNight(runsDir, night);
    expect(result.found && result.rows[0]).toMatchObject({
      owner: null, lastStatus: 'ok', lastError: '', runs: 2, hasFailure: true,
    });
  });

  it('counts malformed, incomplete, blank, and schema-invalid lines while accepting valid lines', () => {
    const invalid: unknown[] = [
      null, [], 'text', {},
      { ...event, owner: undefined }, { ...event, owner: 42 },
      { ...event, status: 'unknown' }, { ...event, job: '' },
      { ...event, error: null }, { ...event, at: 'yesterday' },
      { ...event, at: '2026-02-30T23:00:00+01:00' },
      { ...event, at: '2026-10-28T23:00:00' },
    ];
    const lines = [JSON.stringify(event), ...invalid.map(value => JSON.stringify(value)), '{', ''];
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\r\n') + '\r\n');
    const result = readNight(runsDir, night);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('Temporary night missing');
    expect(result.badLines).toBe(invalid.length + 2);
    expect(result.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(result.rows).toHaveLength(1);
  });

  it('sorts jobs using string comparison rather than file or locale order', () => {
    writeEvents(['z', 'a', 'Z', 'A'].map(job => ({ ...event, job })));
    const result = readNight(runsDir, night);
    expect(result.found && result.rows.map(row => row.job)).toEqual(['A', 'Z', 'a', 'z']);
  });

  it('distinguishes missing and empty files', () => {
    expect(readNight(runsDir, night)).toEqual({ found: false });
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({
      found: true, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('rejects invalid night names before resolving a file path', () => {
    writeEvents([event]);
    for (const invalid of [`./${night}`, `../${night}`, `${night}.jsonl`, '2026-1-01', `${night}\n`]) {
      expect(readNight(runsDir, invalid)).toEqual({ found: false });
    }
  });

  it('propagates filesystem errors other than missing files', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
