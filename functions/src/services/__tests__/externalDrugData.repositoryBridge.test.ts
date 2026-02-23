function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('externalDrugData repository bridge', () => {
  beforeEach(() => {
    process.env.EXTERNAL_DRUG_DATA_ENABLED = 'true';
    process.env.EXTERNAL_DRUG_DATA_BASE_URL = 'https://rxnav.nlm.nih.gov/REST';
    jest.resetModules();
  });

  it('returns cached warnings via injected cache repository', async () => {
    const { runExternalSafetyChecks } = await import('../externalDrugData');

    const cacheRepository = {
      getByUserAndCacheKey: jest.fn().mockResolvedValue({
        id: 'user-1_cache-key',
        createdAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
        warnings: [
          {
            type: 'drug_interaction',
            severity: 'high',
            message: 'Cached warning',
            details: 'Cached details',
            recommendation: 'Cached recommendation',
          },
        ],
      }),
      setByUserAndCacheKey: jest.fn(),
    };
    const fetchApproximateRxcui = jest
      .fn()
      .mockResolvedValueOnce('111')
      .mockResolvedValueOnce('222');
    const fetchInteractions = jest.fn();

    const warnings = await runExternalSafetyChecks(
      'user-1',
      { name: 'Drug A' },
      [{ name: 'Drug B' }],
      { cacheRepository, fetchApproximateRxcui, fetchInteractions },
    );

    expect(fetchApproximateRxcui).toHaveBeenCalledTimes(2);
    expect(cacheRepository.getByUserAndCacheKey).toHaveBeenCalledTimes(1);
    expect(fetchInteractions).not.toHaveBeenCalled();
    expect(cacheRepository.setByUserAndCacheKey).not.toHaveBeenCalled();
    expect(warnings).toEqual([
      {
        type: 'drug_interaction',
        severity: 'high',
        message: 'Cached warning',
        details: 'Cached details',
        recommendation: 'Cached recommendation',
      },
    ]);
  });

  it('writes interaction results through injected cache repository on cache miss', async () => {
    const { runExternalSafetyChecks } = await import('../externalDrugData');

    const cacheRepository = {
      getByUserAndCacheKey: jest.fn().mockResolvedValue(null),
      setByUserAndCacheKey: jest.fn().mockResolvedValue(undefined),
    };
    const fetchApproximateRxcui = jest
      .fn()
      .mockResolvedValueOnce('111')
      .mockResolvedValueOnce('222');
    const fetchInteractions = jest.fn().mockResolvedValue([
      {
        rxcui1: '111',
        rxcui2: '222',
        name1: 'Drug A',
        name2: 'Drug B',
        severity: 'high',
        description: 'Interaction description',
      },
    ]);

    const warnings = await runExternalSafetyChecks(
      'user-2',
      { name: 'Drug A' },
      [{ name: 'Drug B' }],
      { cacheRepository, fetchApproximateRxcui, fetchInteractions },
    );

    expect(cacheRepository.getByUserAndCacheKey).toHaveBeenCalledTimes(1);
    expect(fetchInteractions).toHaveBeenCalledWith(['111', '222']);
    expect(cacheRepository.setByUserAndCacheKey).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      type: 'drug_interaction',
      severity: 'high',
      source: 'external',
      conflictingMedication: 'Drug B',
    });
  });
});
