import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from project root first (shared values),
// then overlay backend-specific overrides from backend/.env
const rootEnvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath, override: false });

const backendEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: backendEnvPath, override: true });

interface Config {
  env: string;
  port: number;
  apiUrl: string;
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  encryption: {
    key: string;
    iv: string;
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3: {
      bucket: string;
      region: string;
    };
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  openai: {
    apiKey: string;
    organizationId?: string;
  };
  sentry: {
    dsn?: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  session: {
    timeoutMinutes: number;
  };
  cors: {
    origins: string[];
  };
  upload: {
    maxFileSizeMB: number;
    allowedAudioFormats: string[];
  };
  bull: {
    concurrency: number;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || '',
    iv: process.env.ENCRYPTION_IV || '',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3: {
      bucket: process.env.AWS_S3_BUCKET || '',
      region: process.env.AWS_S3_BUCKET_REGION || 'us-east-1',
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    organizationId: process.env.OPENAI_ORGANIZATION_ID,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  session: {
    timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '15', 10),
  },

  cors: {
    origins: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },

  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
    allowedAudioFormats: process.env.ALLOWED_AUDIO_FORMATS?.split(',') || [
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
    ],
  },

  bull: {
    concurrency: parseInt(process.env.BULL_CONCURRENCY || '5', 10),
  },
};

// Validate critical configuration
const validateConfig = () => {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'OPENAI_API_KEY',
  ];

  const missing = requiredVars.filter((varName) => {
    const value = process.env[varName];
    return !value || value === '';
  });

  if (missing.length > 0 && config.env !== 'test') {
    console.warn(
      `Warning: Missing required environment variables: ${missing.join(', ')}`
    );
  }
};

validateConfig();

export default config;
