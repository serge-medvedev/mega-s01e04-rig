export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Owner from the latest event, including an explicitly missing owner. */
  owner: string | null;
  /** Total accepted events for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent supplied error; later events without an error do not clear it. */
  lastError: string | null;
  /** Earliest/latest event timestamps, unchanged from the log (including offsets). */
  firstAt: string;
  lastAt: string;
  /** True if any event failed, even when a later event succeeded. */
  hasFailure: boolean;
};

/** Counts of accepted log events, not counts of jobs or final job statuses. */
export type RunCounts = Record<RunStatus, number>;

export type ReadNightResult =
  | { found: false }
  | {
      found: true;
      /** One row per job, sorted ascending by job using string comparison.
       * HTML and JSON consumers must use this same order.
       */
      rows: DigestRow[];
      /** Malformed JSON or events that do not satisfy the log schema. */
      badLines: number;
      counts: RunCounts;
    };

/**
 * Shared contract for the runtime readNight export in ./reader.js.
 * Read runsDir/<night>.jsonl synchronously. A missing file returns found: false;
 * an empty file returns found: true with no rows and zero counts/badLines.
 * Invalid lines are counted and skipped; a trailing newline is not a bad line.
 * Event order is chronological, with file order breaking timestamp ties.
 * Other filesystem errors propagate rather than being reported as missing nights.
 */
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
