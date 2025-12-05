/**
 * Email Service
 * Handles sending emails via Resend API
 */

import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_API_KEY =
  process.env.RESEND_API_KEY ||
  // Fallback to Firebase Functions config (for environments using functions:config:set)
  (functions.config()?.resend?.api_key as string | undefined) ||
  '';

export interface InviteEmailData {
  ownerName: string;
  ownerEmail: string;
  inviteeEmail: string;
  inviteLink: string;
  message?: string;
}

export interface EmailResponse {
  id?: string;
  error?: string;
}

export class EmailService {
  private client: AxiosInstance;

  constructor() {
    if (!RESEND_API_KEY) {
      functions.logger.warn(
        '[Email] RESEND_API_KEY not configured. Email sending will fail.',
      );
    }

    this.client = axios.create({
      baseURL: RESEND_API_URL,
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Send caregiver invitation email
   */
  async sendCaregiverInvite(data: InviteEmailData): Promise<EmailResponse> {
    if (!RESEND_API_KEY) {
      functions.logger.error('[Email] Cannot send email: RESEND_API_KEY not configured');
      return { error: 'Email service not configured' };
    }

    try {
      const emailHtml = this.generateInviteEmailHtml(data);
      const emailText = this.generateInviteEmailText(data);

      const response = await this.client.post<{ id: string }>('', {
        from: 'LumiMD <noreply@lumimd.com>',
        to: [data.inviteeEmail],
        subject: `${data.ownerName} wants to share their health information with you`,
        html: emailHtml,
        text: emailText,
      });

      functions.logger.info(`[Email] Sent caregiver invite to ${data.inviteeEmail}`, {
        emailId: response.data.id,
      });

      return { id: response.data.id };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        functions.logger.error('[Email] Error sending caregiver invite:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });
        return {
          error: error.response?.data?.message || error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Generate HTML email template for invitation
   */
  private generateInviteEmailHtml(data: InviteEmailData): string {
    const messageSection = data.message
      ? `<p style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-radius: 8px; font-style: italic; color: #666;">
          "${data.message}"
        </p>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h1 style="color: #2563eb; margin-top: 0; font-size: 28px; font-weight: 700;">
      You've been invited to view health information
    </h1>
    
    <p style="font-size: 16px; color: #555; margin: 20px 0;">
      <strong>${data.ownerName}</strong> (${data.ownerEmail}) wants to share their health information with you through LumiMD.
    </p>

    ${messageSection}

    <p style="font-size: 16px; color: #555; margin: 20px 0;">
      As a caregiver, you'll be able to view their medical visits, medications, and action items in read-only mode. This helps you stay informed and provide better support.
    </p>

    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.inviteLink}" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 14px; color: #888; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
      If you don't have a LumiMD account, you'll be prompted to create one when you click the link above. The invitation will automatically connect once you sign up.
    </p>

    <p style="font-size: 14px; color: #888; margin-top: 10px;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text email for invitation
   */
  private generateInviteEmailText(data: InviteEmailData): string {
    const messageSection = data.message ? `\n\n"${data.message}"\n` : '';

    return `
You've been invited to view health information

${data.ownerName} (${data.ownerEmail}) wants to share their health information with you through LumiMD.
${messageSection}
As a caregiver, you'll be able to view their medical visits, medications, and action items in read-only mode. This helps you stay informed and provide better support.

Accept the invitation by clicking this link:
${data.inviteLink}

If you don't have a LumiMD account, you'll be prompted to create one when you click the link above. The invitation will automatically connect once you sign up.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();
  }
}

let emailServiceInstance: EmailService | null = null;

export const getEmailService = (): EmailService => {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
};

