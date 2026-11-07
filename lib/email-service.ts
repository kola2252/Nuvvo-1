/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Email Dispatcher for Nuvvo.
 * Supports Nodemailer (via Gmail App Password or custom SMTP) and Supabase Auth.
 */

import nodemailer from "nodemailer";

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  configured: boolean;
  error?: string;
  provider?: 'nodemailer_smtp' | 'supabase_auth' | 'not_configured';
}

/**
 * Checks if SMTP email sending is configured via environment variables.
 */
export function isSmtpConfigured(): boolean {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  return Boolean(user && pass);
}

/**
 * Creates Nodemailer transport based on environment variables.
 */
export function createEmailTransporter() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT) || (host.includes("gmail") ? 465 : 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user.trim(),
      pass: pass.trim().replace(/\s+/g, ''), // Strip spaces if Gmail App Password was copied with spaces
    },
    tls: {
      rejectUnauthorized: false // Avoid self-signed or proxy TLS handshake rejections in cloud environments
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });
}

/**
 * Verifies SMTP connection credentials using transporter.verify().
 */
export async function testSmtpConnection(): Promise<{ success: boolean; configured: boolean; message?: string; error?: string }> {
  if (!isSmtpConfigured()) {
    return {
      success: false,
      configured: false,
      error: "EMAIL_USER and EMAIL_PASS (or SMTP_USER and SMTP_PASS) are not set in environment variables."
    };
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    return {
      success: false,
      configured: false,
      error: "Failed to initialize email transporter."
    };
  }

  try {
    await transporter.verify();
    return {
      success: true,
      configured: true,
      message: `SMTP connection established successfully to ${process.env.SMTP_HOST || "smtp.gmail.com"}.`
    };
  } catch (err: any) {
    return {
      success: false,
      configured: true,
      error: `SMTP verification failed: ${err?.message || err}. Please verify your email and app password.`
    };
  }
}

/**
 * Sends a real 6-digit verification code to the customer's email.
 */
export async function sendEmailOtp(
  recipientEmail: string, 
  otpCode: string, 
  userName?: string
): Promise<EmailSendResult> {
  const transporter = createEmailTransporter();

  if (!transporter) {
    return {
      success: false,
      configured: false,
      provider: 'not_configured',
      error: "Email delivery credentials (EMAIL_USER & EMAIL_PASS) are not configured in Vercel/Environment. Please configure Gmail App Password or custom SMTP."
    };
  }

  const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@nuvvo.delivery";
  const greetingName = userName ? `Hello ${userName},` : "Hello,";

  const mailOptions = {
    from: `"Nuvvo Food Delivery" <${senderEmail}>`,
    to: recipientEmail,
    subject: `Your Nuvvo Verification Code: ${otpCode}`,
    text: `${greetingName}\n\nYour 6-digit verification code for Nuvvo registration is: ${otpCode}\n\nThis code is valid for 10 minutes. Please do not share this code with anyone.\n\nThank you,\nNuvvo Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuvvo Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 15px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <!-- Header -->
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 28px 20px; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">NUVVO</h1>
                    <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.9;">Food Delivery & Cloud Kitchen</p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding: 32px 28px;">
                    <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px; font-weight: 700;">Email Verification</h2>
                    <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.5;">
                      ${greetingName} Thank you for joining Nuvvo. Please use the verification pass code below to complete your registration:
                    </p>
                    
                    <div style="background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
                      <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ea580c;">
                        ${otpCode}
                      </span>
                    </div>

                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px;">
                      ⏱️ <strong>Validity:</strong> This code is valid for <strong>10 minutes</strong>.
                    </p>
                    <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                      🔒 If you did not request this verification code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f1f5f9; padding: 16px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #64748b; font-size: 11px;">
                      &copy; ${new Date().getFullYear()} Nuvvo Food Delivery. All rights reserved.
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
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      configured: true,
      provider: 'nodemailer_smtp',
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error("[Nodemailer Error] Failed to send email:", err?.message || err);
    return {
      success: false,
      configured: true,
      provider: 'nodemailer_smtp',
      error: `SMTP delivery failed: ${err?.message || "Unknown error"}. Check EMAIL_USER and EMAIL_PASS.`,
    };
  }
}
