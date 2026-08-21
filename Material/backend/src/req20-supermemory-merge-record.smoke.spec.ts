/**
 * REQ-20: Supermemory merge-record smoke test.
 *
 * When a requirement is marked merged, an implementation record is written to
 * Supermemory by the requirements pipeline. This deliberately minimal spec
 * exists so that merging REQ-20 produces a verifiable change in CI, letting us
 * confirm end-to-end that the merge event resulted in a Supermemory record.
 */

interface SupermemoryMergeRecord {
  requirementId: string;
  title: string;
  status: 'merged';
  mergedAt: string;
}

function buildMergeRecord(
  requirementId: string,
  title: string,
  mergedAt: Date,
): SupermemoryMergeRecord {
  return {
    requirementId,
    title,
    status: 'merged',
    mergedAt: mergedAt.toISOString(),
  };
}

describe('REQ-20 Supermemory merge-record smoke test', () => {
  it('builds the implementation record shape written on merge', () => {
    const mergedAt = new Date('2026-08-20T00:00:00.000Z');
    const record = buildMergeRecord(
      'REQ-20',
      'Supermemory merge-record smoke test',
      mergedAt,
    );

    expect(record).toEqual({
      requirementId: 'REQ-20',
      title: 'Supermemory merge-record smoke test',
      status: 'merged',
      mergedAt: '2026-08-20T00:00:00.000Z',
    });
  });
});
