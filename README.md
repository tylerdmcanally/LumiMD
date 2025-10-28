# LumiMD - Medical Companion App Core

A comprehensive medical companion application built with React Native and Node.js, designed to help patients manage their healthcare journey.

## 🏗️ Architecture

### Frontend (React Native)
- **Core Components**: Located in `src/features/` and `src/shared/`
- **Navigation**: React Navigation with stack navigator
- **State Management**: React Context for authentication and app state
- **Services**: API clients and business logic in `src/shared/services/`

### Backend (Node.js/Express)
- **API Server**: RESTful API built with Express.js
- **Database**: SQLite with Prisma ORM
- **Authentication**: JWT-based authentication
- **Security**: HIPAA-compliant data handling with encryption

## 📱 Core Features

### Medical Visit Management
- Record and transcribe medical visits
- Organize visits into folders
- Generate visit summaries and action items
- Secure audio storage with AWS S3

### Health Profile
- Comprehensive health information management
- Medication tracking with interaction checking
- Caregiver invitation system
- HIPAA-compliant data encryption

### Provider Integration
- Find and connect with healthcare providers
- Appointment booking capabilities
- Provider search and filtering

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- React Native development environment
- iOS Simulator or Android Emulator

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

3. **Initialize database:**
   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Start the backend:**
   ```bash
   cd backend
   npm run dev
   ```

5. **Start the mobile app:**
   ```bash
   npm start
   # In another terminal:
   npm run ios    # for iOS
   npm run android # for Android
   ```

## 📁 Project Structure

```
lumimd-core/
├── src/                          # React Native app source
│   ├── features/                 # Feature-specific components
│   │   ├── auth/                 # Authentication screens
│   │   ├── home/                 # Home dashboard
│   │   ├── visits/               # Medical visit management
│   │   ├── folders/              # Visit organization
│   │   ├── profile/              # User profile and settings
│   │   └── action-items/         # Medical action items
│   └── shared/                   # Shared components and services
│       ├── components/           # Reusable UI components
│       ├── services/             # API clients and business logic
│       ├── context/              # React Context providers
│       ├── constants/            # App constants and themes
│       └── types/                # TypeScript type definitions
├── backend/                      # Node.js API server
│   ├── src/
│   │   ├── controllers/          # API route handlers
│   │   ├── services/             # Business logic
│   │   ├── middleware/           # Express middleware
│   │   ├── routes/               # API routes
│   │   └── utils/                # Utility functions
│   └── prisma/                   # Database schema and migrations
└── docs/                         # Documentation
    ├── architecture/             # System architecture docs
    ├── features/                 # Feature documentation
    └── history/                  # Development history
```

## 🔧 Development

### Available Scripts

- `npm start` - Start Metro bundler
- `npm run ios` - Run on iOS simulator
- `npm run android` - Run on Android emulator
- `npm test` - Run tests
- `npm run lint` - Run ESLint

### Backend Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run backend tests
- `npm run prisma:studio` - Open Prisma Studio

## 🔒 Security & Compliance

- **HIPAA Compliance**: All medical data is encrypted at rest and in transit
- **Authentication**: Secure JWT-based authentication
- **Data Encryption**: AES-256 encryption for sensitive data
- **Audit Logging**: Comprehensive audit trails for all actions
- **Input Validation**: Robust input validation and sanitization

## 📚 Documentation

- [Architecture Overview](docs/architecture/ARCHITECTURE_OVERVIEW.md)
- [Complete User Workflow](docs/features/COMPLETE_USER_WORKFLOW.md)
- [Medical Disclaimer Compliance](docs/features/MEDICAL_DISCLAIMER_COMPLIANCE.md)
- [Medication Safety Features](docs/features/MEDICATION_SAFETY_SUMMARY.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is private and proprietary. All rights reserved.

## 🆘 Support

For support and questions, please contact the development team.