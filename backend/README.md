# LumiMD Backend API

**Your trusted health companion** - HIPAA-compliant healthcare management API

## Overview

The LumiMD backend is a secure, HIPAA-compliant REST API built with Node.js, Express, TypeScript, and PostgreSQL. It provides comprehensive healthcare visit management, AI-powered transcription and summarization, and trusted family member access.

## Features

- ✅ **User Authentication** - JWT-based auth with refresh tokens
- ✅ **Medical Profile Management** - Conditions, medications, allergies, emergency contacts
- ✅ **Visit Recording** - Audio recording upload and management
- ✅ **AI Processing** - OpenAI Whisper transcription + GPT-4 summarization
- ✅ **Provider Management** - Track healthcare providers
- ✅ **Action Items & Reminders** - Follow-up appointments, lab work, medication changes
- ✅ **Trusted Access** - Share visits with family members/caregivers
- ✅ **HIPAA Compliance** - Encryption at rest and in transit, audit logging
- ✅ **Security** - Rate limiting, helmet, CORS, input validation

## Tech Stack

- **Runtime**: Node.js v18+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with refresh tokens
- **File Storage**: AWS S3
- **Background Jobs**: Bull + Redis
- **AI Services**: OpenAI (Whisper + GPT-4)
- **Security**: Helmet, bcrypt, rate-limit
- **Logging**: Winston
- **Error Tracking**: Sentry
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js v18 or higher
- PostgreSQL 14+
- Redis (for background jobs)
- AWS Account (for S3 storage)
- OpenAI API Key

### Installation

1. **Install dependencies**

```bash
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5433/lumimd"

# JWT Secrets (generate secure keys!)
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your-32-byte-encryption-key-in-hex
ENCRYPTION_IV=your-16-byte-iv-in-hex

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# AWS
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-bucket-name
```

3. **Set up database**

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

4. **Start development server**

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### Generate Encryption Keys

```bash
# Generate 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate 16-byte IV
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   ├── models/          # Data models (unused, Prisma handles this)
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript type definitions
│   ├── jobs/            # Background job processors
│   ├── app.ts           # Express app configuration
│   └── index.ts         # Server entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/               # Test files
├── package.json
├── tsconfig.json
└── .env
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/verify-otp` - Verify OTP

### User Profile

- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/upload-photo` - Upload profile photo
- `DELETE /api/users/account` - Delete user account

### Providers

- `GET /api/providers` - List providers
- `POST /api/providers` - Create provider
- `GET /api/providers/:id` - Get provider
- `PUT /api/providers/:id` - Update provider
- `DELETE /api/providers/:id` - Delete provider

### Visits

- `GET /api/visits` - List visits
- `POST /api/visits/start` - Start new visit
- `POST /api/visits/:id/upload` - Upload audio
- `GET /api/visits/:id` - Get visit details
- `GET /api/visits/:id/summary` - Get AI summary
- `GET /api/visits/:id/transcript` - Get transcript
- `POST /api/visits/:id/share` - Share visit

### Medical Profile

- `GET /api/medical/conditions` - List conditions
- `POST /api/medical/conditions` - Add condition
- `GET /api/medical/medications` - List medications
- `POST /api/medical/medications` - Add medication
- `GET /api/medical/allergies` - List allergies
- `POST /api/medical/allergies` - Add allergy

### Action Items

- `GET /api/action-items` - List action items
- `POST /api/action-items` - Create action item
- `POST /api/action-items/:id/complete` - Mark complete

### Trusted Access

- `GET /api/trusted-access` - List trusted users
- `POST /api/trusted-access/invite` - Invite trusted user
- `PUT /api/trusted-access/:id` - Update access level
- `DELETE /api/trusted-access/:id` - Revoke access

## Development

### Scripts

```bash
npm run dev         # Start development server with auto-reload
npm run build       # Build for production
npm run start       # Start production server
npm test            # Run tests
npm run lint        # Lint code
npm run format      # Format code with Prettier
```

### Database Commands

```bash
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate     # Run database migrations
npm run prisma:studio      # Open Prisma Studio
```

## Security Features

### HIPAA Compliance

- **Encryption at Rest**: All PHI is encrypted using AES-256-GCM
- **Encryption in Transit**: TLS 1.3 enforced
- **Audit Logging**: All PHI access is logged
- **Access Controls**: Role-based access with JWT
- **Session Timeout**: 15-minute automatic timeout
- **Data Backup**: Regular automated backups

### Authentication

- JWT access tokens (15 min expiry)
- Refresh tokens (7 day expiry)
- Bcrypt password hashing (12 rounds)
- Rate limiting on auth endpoints

### Security Headers

- Helmet.js for security headers
- CORS configuration
- XSS protection
- Content Security Policy
- HSTS enabled

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for access tokens | Yes |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Yes |
| `ENCRYPTION_KEY` | 32-byte encryption key (hex) | Yes |
| `ENCRYPTION_IV` | 16-byte IV (hex) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes |
| `AWS_S3_BUCKET` | S3 bucket name | Yes |
| `REDIS_HOST` | Redis host | No (default: localhost) |
| `SENTRY_DSN` | Sentry DSN for error tracking | No |

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS/TLS
- [ ] Set up database backups
- [ ] Configure Sentry for error tracking
- [ ] Set up log rotation
- [ ] Configure AWS S3 bucket policies
- [ ] Set up Redis for sessions
- [ ] Enable rate limiting
- [ ] Configure CORS for production domains
- [ ] Set up monitoring and alerts

## License

Proprietary - All rights reserved

## Support

For support, please contact: [Your contact information]
