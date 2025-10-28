import express, { Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config';
import logger, { morganStream } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { securityHeaders, rateLimiter } from './middleware/security';

// Import routes (will be created later)
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import providerRoutes from './routes/provider';
import visitRoutes from './routes/visit';
import folderRoutes from './routes/folder';
import medicalRoutes from './routes/medical';
import actionItemRoutes from './routes/actionItem';
import trustedAccessRoutes from './routes/trustedAccess';

/**
 * Create and configure Express application
 */
const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(securityHeaders);

  // CORS configuration
  app.use(
    cors({
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP request logging
  if (config.env === 'development') {
    app.use(morgan('dev', { stream: morganStream }));
  } else {
    app.use(morgan('combined', { stream: morganStream }));
  }

  // Rate limiting
  app.use('/api/', rateLimiter);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'LumiMD API is running',
      timestamp: new Date().toISOString(),
      environment: config.env,
    });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/providers', providerRoutes);
  app.use('/api/visits', visitRoutes);
  app.use('/api/folders', folderRoutes);
  app.use('/api/medical', medicalRoutes);
  app.use('/api/action-items', actionItemRoutes);
  app.use('/api/trusted-access', trustedAccessRoutes);

  // Import folder controller for tags endpoint
  const visitFolderController = require('./controllers/visitFolderController').default;
  const { authenticate } = require('./middleware/auth');
  app.get('/api/tags', authenticate, visitFolderController.getUserTags);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
};

export default createApp;
