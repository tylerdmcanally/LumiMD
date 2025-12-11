/**
 * Jest Test Setup
 * Mocks for Firebase Admin SDK and common test utilities
 */

// Mock firebase-admin before any imports
jest.mock('firebase-admin', () => {
    const createFirestoreMock = (): Record<string, unknown> => {
        const mock: Record<string, unknown> = {
            collection: jest.fn(() => mock),
            doc: jest.fn(() => mock),
            get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
            set: jest.fn(() => Promise.resolve()),
            update: jest.fn(() => Promise.resolve()),
            delete: jest.fn(() => Promise.resolve()),
            where: jest.fn(() => mock),
            orderBy: jest.fn(() => mock),
            limit: jest.fn(() => mock),
        };
        return mock;
    };
    const firestoreMock = createFirestoreMock();

    return {
        initializeApp: jest.fn(),
        credential: {
            applicationDefault: jest.fn(),
            cert: jest.fn(),
        },
        firestore: jest.fn(() => firestoreMock),
        storage: jest.fn(() => ({
            bucket: jest.fn(() => ({
                file: jest.fn(() => ({
                    getSignedUrl: jest.fn(() => Promise.resolve(['https://signed-url.example.com'])),
                })),
            })),
        })),
        auth: jest.fn(() => ({
            verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'test-user-id' })),
            createCustomToken: jest.fn(() => Promise.resolve('custom-token')),
        })),
    };
});

// Mock firebase-functions logger
jest.mock('firebase-functions', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
    config: jest.fn(() => ({})),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.ASSEMBLYAI_API_KEY = 'test-assembly-key';

// Global test utilities
global.console = {
    ...console,
    // Suppress console logs during tests unless debugging
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Increase timeout for async operations
jest.setTimeout(10000);
