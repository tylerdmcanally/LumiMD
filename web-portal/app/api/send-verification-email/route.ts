import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Handle both escaped (\n) and literal newlines
      privateKey: privateKey?.includes('\\n')
        ? privateKey.replace(/\\n/g, '\n')
        : privateKey,
    }),
  });
}

const adminAuth = getAuth();
const adminDb = getFirestore();

const resend = new Resend(process.env.RESEND_API_KEY);

const requestSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('[send-verification-email] RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    const body = await request.json();
    const { userId, email } = requestSchema.parse(body);

    // Verify user is requesting their own verification
    if (decodedToken.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate verification token (valid for 24 hours)
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    // Store verification token in Firestore
    await adminDb.collection('emailVerifications').doc(userId).set({
      email,
      token: verificationToken,
      expiresAt,
      createdAt: Date.now(),
      verified: false,
    });

    // Get app URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://lumimd.app';
    const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}&uid=${userId}`;

    // Send email via Resend
    const { data, error: resendError } = await resend.emails.send({
      from: 'LumiMD <no-reply@lumimd.app>',
      to: email,
      subject: 'Verify your LumiMD email address',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">LumiMD</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">Verify Your Email Address</h2>
                        
                        <p style="margin: 0 0 20px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                          Welcome to LumiMD! Please verify your email address to unlock all features, including caregiver sharing.
                        </p>
                        
                        <p style="margin: 0 0 30px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                          Click the button below to verify your email:
                        </p>
                        
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center">
                              <a href="${verificationUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 30px 0 0; color: #6b6b6b; font-size: 14px; line-height: 1.6;">
                          Or copy and paste this link into your browser:
                        </p>
                        <p style="margin: 10px 0 0; color: #667eea; font-size: 14px; word-break: break-all;">
                          ${verificationUrl}
                        </p>
                        
                        <p style="margin: 30px 0 0; color: #6b6b6b; font-size: 14px; line-height: 1.6;">
                          This link will expire in 24 hours. If you didn't create a LumiMD account, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e5e5e5;">
                        <p style="margin: 0; color: #6b6b6b; font-size: 14px;">
                          © ${new Date().getFullYear()} LumiMD. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (resendError) {
      console.error('[send-verification-email] Resend error:', resendError);
      return NextResponse.json(
        { error: 'Failed to send verification email' },
        { status: 500 }
      );
    }

    console.log('[send-verification-email] Email sent successfully:', data);

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (error: any) {
    console.error('[send-verification-email] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
