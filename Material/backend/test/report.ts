/**
 * Tiny reporter for the e2e suites.
 *
 * A green "PASS" tells you the assertions held; it does not tell you *what was
 * measured*. These helpers print the numbers each test observed, so a run is
 * readable evidence rather than a checkmark.
 *
 * Each report is a single console call: Jest brackets every call with its own
 * "console.log … at …" header, so logging line by line is unreadable.
 */

export interface BurstNumbers {
  requests: number;
  writes?: number;
  durationMs: number;
  loads: number;
  hits: number;
  coalesced: number;
  invalidations?: number;
  statuses: Record<string, number>;
}

export function reportHeader(title: string, ...lines: string[]): void {
  const body = lines.map((line) => `  ${line}`);
  console.log([title, '─'.repeat(title.length), ...body, ''].join('\n'));
}

export function reportBurst(title: string, numbers: BurstNumbers): void {
  const spared = numbers.hits + numbers.coalesced;
  const readers = numbers.loads + spared;

  const rows: [string, string | number][] = [
    [
      'requests fired',
      numbers.requests + (numbers.writes ? ` (+${numbers.writes} writes)` : ''),
    ],
    ['wall clock', `${numbers.durationMs}ms`],
    ['HTTP statuses', JSON.stringify(numbers.statuses)],
    ['DB queries (loads)', numbers.loads],
    ['served from cache', numbers.hits],
    ['coalesced (saved)', numbers.coalesced],
  ];

  if (numbers.invalidations !== undefined) {
    rows.push(['invalidations', numbers.invalidations]);
  }

  rows.push([
    'verdict',
    `${readers} readers -> ${numbers.loads} quer${numbers.loads === 1 ? 'y' : 'ies'}` +
      (spared ? `, ${spared} served without one` : ''),
  ]);

  reportHeader(
    title,
    ...rows.map(([key, value]) => `${key.padEnd(20)} ${value}`),
  );
}
