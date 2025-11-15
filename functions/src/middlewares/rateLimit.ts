import rateLimit from 'express-rate-limit';
import * as functions from 'firebase-functions';

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    code: 'rate_limit_exceeded',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    functions.logger.warn(`[rate-limit] IP ${req.ip} exceeded general rate limit`);
    res.status(429).json({
      code: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later.',
    });
  },
});

/**
 * Strict rate limiter for write operations (POST, PUT, PATCH, DELETE)
 * 20 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 writes per windowMs
  message: {
    code: 'rate_limit_exceeded',
    message: 'Too many write requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    functions.logger.warn(`[rate-limit] IP ${req.ip} exceeded write rate limit`);
    res.status(429).json({
      code: 'rate_limit_exceeded',
      message: 'Too many write requests, please try again later.',
    });
  },
});

/**
 * Auth rate limiter - prevent brute force attacks
 * 5 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    code: 'auth_rate_limit_exceeded',
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    functions.logger.warn(`[rate-limit] IP ${req.ip} exceeded auth rate limit`);
    res.status(429).json({
      code: 'auth_rate_limit_exceeded',
      message: 'Too many authentication attempts, please try again later.',
    });
  },
});

/**
 * Share creation limiter - prevent spam invitations
 * 10 share invitations per hour per user
 */
export const shareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    code: 'share_rate_limit_exceeded',
    message: 'Too many share invitations, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    functions.logger.warn(`[rate-limit] IP ${req.ip} exceeded share creation limit`);
    res.status(429).json({
      code: 'share_rate_limit_exceeded',
      message: 'Too many share invitations, please try again later.',
    });
  },
});
