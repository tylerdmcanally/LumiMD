jest.mock('axios');

describe('externalDrugData', () => {
  beforeEach(() => {
    process.env.EXTERNAL_DRUG_DATA_ENABLED = 'true';
    process.env.EXTERNAL_DRUG_DATA_BASE_URL = 'https://rxnav.nlm.nih.gov/REST';
    jest.resetModules();
  });

  it('returns external interaction warnings when RxCUI data is available', async () => {
    const axios = (await import('axios')) as unknown as { default?: any; get?: any };
    const mockedAxios = (axios.default ?? axios) as jest.Mocked<{ get: any }>;

    mockedAxios.get.mockImplementation((url: string, config: any) => {
      if (url.toString().includes('approximateTerm.json')) {
        const term = config?.params?.term;
        const rxcui = term && term.toLowerCase().includes('drug b') ? '67890' : '12345';
        return Promise.resolve({
          data: { approximateGroup: { candidate: [{ rxcui, score: '100' }] } },
        } as any);
      }
      if (url.toString().includes('interaction/list.json')) {
        return Promise.resolve({
          data: {
            interactionTypeGroup: [
              {
                sourceName: 'RxNav',
                interactionType: [
                  {
                    interactionPair: [
                      {
                        severity: 'high',
                        description: 'Test interaction description',
                        interactionConcept: [
                          { minConceptItem: { rxcui: '12345', name: 'Drug A' } },
                          { minConceptItem: { rxcui: '67890', name: 'Drug B' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        } as any);
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const { runExternalSafetyChecks } = await import('../externalDrugData');
    const warnings = await runExternalSafetyChecks(
      'user-1',
      { name: 'Drug A' },
      [{ name: 'Drug B' }]
    );

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].type).toBe('drug_interaction');
    expect(warnings[0].severity).toBe('high');
    expect(warnings[0].source).toBe('external');
  });
});
