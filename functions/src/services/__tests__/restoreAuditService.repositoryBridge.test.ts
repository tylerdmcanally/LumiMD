import { recordRestoreAuditEvent } from '../restoreAuditService';

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('restoreAuditService repository bridge', () => {
  it('persists sanitized restore audit payloads through injected repository', async () => {
    const createEvent = jest.fn().mockResolvedValue('audit-123');

    const id = await recordRestoreAuditEvent(
      {
        resourceType: 'medication',
        resourceId: 'med-1',
        ownerUserId: 'owner-1',
        actorUserId: 'operator-1',
        actorIsOperator: true,
        reason: '<script>alert(1)</script>  follow-up review ',
        metadata: { source: 'ops', reasonCode: 'ticket-44' },
        createdAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
      },
      {
        restoreAuditRepository: {
          createEvent,
        },
      },
    );

    expect(id).toBe('audit-123');
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'medication',
        resourceId: 'med-1',
        ownerUserId: 'owner-1',
        actorUserId: 'operator-1',
        actorCategory: 'operator',
        reason: 'follow-up review',
        triageStatus: 'unreviewed',
        triageNote: null,
      }),
    );
  });
});
