import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.at !== 'string' ||
    event.at.trim() !== event.at ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.at) ||
    typeof event.job !== 'string' || event.job.trim() === '' ||
    (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') ||
    (typeof event.owner !== 'string' && event.owner !== null) ||
    ('error' in event && typeof event.error !== 'string')
  ) return null;

  const time = Date.parse(event.at);
  const day = event.at.slice(0, 10);
  const calendarDate = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== day
  ) return null;

  return {
    at: event.at,
    time,
    job: event.job,
    status: event.status,
    owner: event.owner,
    ...(typeof event.error === 'string' ? { error: event.error } : {}),
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return { found: false };

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { found: false };
    }
    throw error;
  }

  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  let badLines = 0;
  const events: RunEvent[] = [];
  for (const line of lines) {
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }
  // Array.sort is stable: equal instants retain their order in the file.
  events.sort((a, b) => a.time - b.time);

  const jobs = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        lastStatus: event.status,
        lastError: null,
        firstAt: event.at,
        lastAt: event.at,
        hasFailure: false,
      };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.hasFailure = true;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }

  return {
    found: true,
    rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
    counts,
  };
};
