import type { DigestRow } from '../digest/types.js';

export function DigestPage({ night, rows, badLines }: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p>{badLines} bad {badLines === 1 ? 'line' : 'lines'}</p>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>failure</th>
              <th>first at</th>
              <th>last at</th>
              <th>last error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries >= 3 ? <span class="warn">{row.retries} · high</span> : row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.hasFailure ? <span class="warn">yes</span> : '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
                <td>{row.lastError ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
