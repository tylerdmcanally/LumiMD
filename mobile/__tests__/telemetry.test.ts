const mockMemoryStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockMemoryStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemoryStore.set(key, value);
    }),
  },
}));

describe('telemetry privacy guardrails', () => {
  const originalEnv = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED;
  const loadTelemetry = () => require('../lib/telemetry') as typeof import('../lib/telemetry');

  beforeEach(() => {
    jest.resetModules();
    mockMemoryStore.clear();
    (global as any).__DEV__ = true;
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_ANALYTICS_ENABLED = originalEnv;
  });

  it('does not emit telemetry when analytics config is disabled', async () => {
    process.env.EXPO_PUBLIC_ANALYTICS_ENABLED = 'false';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const telemetry = loadTelemetry();
    expect(telemetry.isTelemetryConfigured()).toBe(false);

    await telemetry.setTelemetryConsent(true);
    telemetry.trackEvent('home_recovery_attempt', {
      source: 'pull_to_refresh',
      hadFailures: false,
      failedCards: 'none',
    });

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('does not emit telemetry when consent is not granted', async () => {
    process.env.EXPO_PUBLIC_ANALYTICS_ENABLED = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const telemetry = loadTelemetry();
    await telemetry.initializeTelemetryConsent();

    telemetry.trackEvent('home_recovery_result', {
      source: 'pull_to_refresh',
      rejectedCount: 0,
      erroredCount: 0,
      success: true,
    });

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('emits only sanitized data for configured+consented telemetry', async () => {
    process.env.EXPO_PUBLIC_ANALYTICS_ENABLED = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const telemetry = loadTelemetry();
    await telemetry.setTelemetryConsent(true);

    telemetry.trackEvent('home_recovery_attempt', {
      source: 'pull_to_refresh',
      hadFailures: true,
      failedCards: 'patient@example.com',
    });

    expect(logSpy).toHaveBeenCalled();
    const payload = logSpy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.source).toBe('pull_to_refresh');
    expect(payload.hadFailures).toBe(true);
    expect(payload.failedCards).toBeUndefined();

    logSpy.mockRestore();
  });
});
