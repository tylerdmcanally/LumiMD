/**
 * Push Notification Service
 * Handles sending push notifications via Expo Push Notification Service
 */

import axios, { AxiosInstance } from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { UserDomainService } from './domain/users/UserDomainService';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushNotificationPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface PushNotificationResponse {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}

export class NotificationService {
  private client: AxiosInstance;
  private readonly userService: Pick<UserDomainService, 'listPushTokens' | 'unregisterPushToken'>;

  constructor(
    dependencies: {
      client?: AxiosInstance;
      userService?: Pick<UserDomainService, 'listPushTokens' | 'unregisterPushToken'>;
    } = {},
  ) {
    this.client =
      dependencies.client ??
      axios.create({
        baseURL: EXPO_PUSH_API_URL,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        timeout: 10000,
      });
    this.userService =
      dependencies.userService ??
      new UserDomainService(new FirestoreUserRepository(admin.firestore()));
  }

  /**
   * Send a push notification to a single device
   */
  async sendNotification(payload: PushNotificationPayload): Promise<PushNotificationResponse> {
    try {
      const response = await this.client.post<{ data: PushNotificationResponse }>('', payload);
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        functions.logger.error('[Notifications] Error sending push notification:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });
        return {
          status: 'error',
          message: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Send push notifications to multiple devices (batched)
   */
  async sendNotifications(
    payloads: PushNotificationPayload[],
  ): Promise<PushNotificationResponse[]> {
    if (payloads.length === 0) {
      return [];
    }

    try {
      const response = await this.client.post<{ data: PushNotificationResponse[] }>('', payloads);
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        functions.logger.error('[Notifications] Error sending batch push notifications:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });
        // Return error responses for all payloads
        return payloads.map(() => ({
          status: 'error' as const,
          message: error.message,
        }));
      }
      throw error;
    }
  }

  /**
   * Get all push tokens for a user
   */
  async getUserPushTokens(userId: string): Promise<Array<{ token: string; platform: string }>> {
    try {
      const records = await this.userService.listPushTokens(userId);

      const tokenMap = new Map<string, { token: string; platform: string }>();
      records.forEach((data) => {
        const token = data.token as string | undefined;
        if (!token) return;
        tokenMap.set(token, {
          token,
          platform: (data.platform as string) || 'ios',
        });
      });
      return Array.from(tokenMap.values());
    } catch (error) {
      functions.logger.error(`[Notifications] Error fetching push tokens for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Remove invalid push tokens (e.g., DeviceNotRegistered)
   */
  async removeInvalidToken(userId: string, token: string): Promise<void> {
    try {
      const result = await this.userService.unregisterPushToken(userId, token);
      if (result.deletedCount > 0) {
        functions.logger.info(`[Notifications] Removed invalid token for user ${userId}`);
      }
    } catch (error) {
      functions.logger.error(`[Notifications] Error removing invalid token:`, error);
    }
  }

  /**
   * Send visit ready notification to user
   */
  async notifyVisitReady(
    userId: string,
    visitId: string,
    badgeCount?: number,
  ): Promise<void> {
    try {
      const tokens = await this.getUserPushTokens(userId);
      if (tokens.length === 0) {
        functions.logger.info(`[Notifications] No push tokens found for user ${userId}`);
        return;
      }

      const payloads: PushNotificationPayload[] = tokens.map(({ token }) => ({
        to: token,
        title: 'Visit Summary Ready',
        body: 'Your visit summary is ready for review.',
        data: {
          type: 'visit-ready',
          visitId,
        },
        badge: badgeCount ?? 1,
        sound: 'default',
        priority: 'high',
      }));

      const responses = await this.sendNotifications(payloads);

      // Handle errors and remove invalid tokens
      responses.forEach((response, index) => {
        if (response.status === 'error') {
          const errorType = response.details?.error;
          if (errorType === 'DeviceNotRegistered') {
            // Remove invalid token
            void this.removeInvalidToken(userId, tokens[index].token);
          }
        }
      });

      const successCount = responses.filter((r) => r.status === 'ok').length;
      functions.logger.info(
        `[Notifications] Sent visit-ready notification to user ${userId}. ${successCount}/${tokens.length} successful.`,
      );
    } catch (error) {
      functions.logger.error(`[Notifications] Error sending visit-ready notification:`, error);
    }
  }
}

let notificationServiceInstance: NotificationService | null = null;

export const getNotificationService = (): NotificationService => {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
};
