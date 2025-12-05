import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.lumimd.app';

interface EmailRequest {
  ownerName: string;
  ownerEmail: string;
  inviteeEmail: string;
  inviteLink: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error('[send-invite-email] RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    const body: EmailRequest = await request.json();
    const { ownerName, ownerEmail, inviteeEmail, inviteLink, message } = body;

    // Validate required fields
    if (!ownerName || !ownerEmail || !inviteeEmail || !inviteLink) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate email content
    const messageSection = message
      ? `<p style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-radius: 8px; font-style: italic; color: #666;">
          "${message}"
        </p>`
      : '';

    const emailHtml = `
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
      <strong>${ownerName}</strong> (${ownerEmail}) wants to share their health information with you through LumiMD.
    </p>

    ${messageSection}

    <p style="font-size: 16px; color: #555; margin: 20px 0;">
      As a caregiver, you'll be able to view their medical visits, medications, and action items in read-only mode. This helps you stay informed and provide better support.
    </p>

    <div style="margin: 30px 0; text-align: center;">
      <a href="${inviteLink}" 
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

    const emailText = `
You've been invited to view health information

${ownerName} (${ownerEmail}) wants to share their health information with you through LumiMD.
${message ? `\n\n"${message}"\n` : ''}
As a caregiver, you'll be able to view their medical visits, medications, and action items in read-only mode. This helps you stay informed and provide better support.

Accept the invitation by clicking this link:
${inviteLink}

If you don't have a LumiMD account, you'll be prompted to create one when you click the link above. The invitation will automatically connect once you sign up.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: 'LumiMD <onboarding@resend.dev>', // Use your verified domain when available
      to: inviteeEmail,
      subject: `${ownerName} wants to share their health information with you`,
      html: emailHtml,
      text: emailText,
    });

    if (error) {
      console.error('[send-invite-email] Resend error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to send email' },
        { status: 500 }
      );
    }

    console.log('[send-invite-email] Email sent successfully', {
      emailId: data?.id,
      inviteeEmail,
    });

    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (error) {
    console.error('[send-invite-email] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

