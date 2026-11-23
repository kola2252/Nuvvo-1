/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Email Dispatcher for Nuvvo.
 * Supports Nodemailer (via Gmail App Password or custom SMTP) and Supabase Auth.
 */

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const SMTP_CONFIG_FILE = path.join(process.cwd(), '.server_smtp_config.json');

export interface SmtpConfig {
  user: string;
  pass: string;
  host: string;
  port: number;
  from: string;
}

export function loadSmtpConfig(): SmtpConfig {
  let fileConfig: Partial<SmtpConfig> = {};
  try {
    if (fs.existsSync(SMTP_CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(SMTP_CONFIG_FILE, 'utf8')) || {};
    }
  } catch {}

  const user = (fileConfig.user || process.env.EMAIL_USER || process.env.SMTP_USER || "officialnuvvo@gmail.com").trim();
  const pass = (fileConfig.pass || process.env.EMAIL_PASS || process.env.SMTP_PASS || "").trim();
  const host = (fileConfig.host || process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(fileConfig.port || process.env.SMTP_PORT) || (host.includes("gmail") ? 465 : 587);
  const from = (fileConfig.from || process.env.EMAIL_FROM || user || "Nuvvo Food Delivery <no-reply@nuvvo.delivery>").trim();

  return { user, pass, host, port, from };
}

export function saveSmtpConfig(config: Partial<SmtpConfig>): SmtpConfig {
  const current = loadSmtpConfig();
  const updated: SmtpConfig = {
    user: (config.user ?? current.user).trim(),
    pass: (config.pass ?? current.pass).trim(),
    host: (config.host ?? current.host).trim() || "smtp.gmail.com",
    port: Number(config.port) || current.port || 465,
    from: (config.from ?? current.from).trim() || current.user
  };
  try {
    fs.writeFileSync(SMTP_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    console.warn("Failed to persist SMTP config:", e);
  }
  return updated;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  configured: boolean;
  error?: string;
  provider?: 'nodemailer_smtp' | 'supabase_auth' | 'not_configured';
}

/**
 * Checks if SMTP email sending is configured via environment variables or persistent settings.
 */
export function isSmtpConfigured(): boolean {
  const cfg = loadSmtpConfig();
  return Boolean(cfg.user && cfg.pass);
}

/**
 * Creates Nodemailer transport based on environment variables or persistent settings.
 */
export function createEmailTransporter() {
  const cfg = loadSmtpConfig();

  if (!cfg.user || !cfg.pass) {
    return null;
  }

  const secure = cfg.port === 465;

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass.replace(/\s+/g, ''), // Strip spaces if Gmail App Password was copied with spaces
    },
    tls: {
      rejectUnauthorized: false // Avoid self-signed or proxy TLS handshake rejections in cloud environments
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
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

export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
  restaurantName?: string;
  isVeg?: boolean;
}

export interface OrderEmailPayload {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderEmailItem[];
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  packagingFee?: number;
  tax?: number;
  tip?: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus?: string;
  deliveryAddress: {
    flatNo?: string;
    area?: string;
    landmark?: string;
    city?: string;
    fullAddress?: string;
  };
  deliveryInstructions?: string;
  date?: string;
  eta?: number;
}

/**
 * Sends a professional, responsive HTML order confirmation and itemized receipt
 * using the configured SMTP settings from environment variables (.env).
 */
export async function sendOrderConfirmationEmail(payload: OrderEmailPayload): Promise<EmailSendResult> {
  const {
    orderId,
    customerName,
    customerEmail,
    items,
    subtotal,
    discount = 0,
    deliveryFee = 0,
    packagingFee = 0,
    tax = 0,
    tip = 0,
    finalAmount,
    paymentMethod,
    paymentStatus = "Confirmed",
    deliveryAddress,
    deliveryInstructions,
    date = new Date().toISOString(),
    eta = 25
  } = payload;

  if (!customerEmail || !customerEmail.includes("@")) {
    return {
      success: false,
      configured: false,
      error: "A valid customer email is required to send the order confirmation receipt."
    };
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    console.warn(`[SMTP Notice] SMTP not configured. Order confirmation email for #${orderId} logged without sending.`);
    return {
      success: false,
      configured: false,
      provider: 'not_configured',
      error: "SMTP credentials are not configured in environment (EMAIL_USER / EMAIL_PASS). Order confirmation skipped."
    };
  }

  const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || "orders@nuvvo.delivery";
  const displayOrderId = orderId.startsWith("order_") ? orderId.replace("order_", "#").toUpperCase() : `#${orderId.toUpperCase()}`;
  const formattedDate = new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });

  const addressLine = deliveryAddress.fullAddress || 
    [deliveryAddress.flatNo, deliveryAddress.area, deliveryAddress.landmark ? `Near ${deliveryAddress.landmark}` : "", deliveryAddress.city]
      .filter(Boolean)
      .join(", ") || "Delivery Address on File";

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="font-weight: 700; color: #1e293b; font-size: 14px;">
          ${item.isVeg ? '<span style="color: #16a34a; font-size: 11px; margin-right: 4px;">🟢 Veg</span>' : '<span style="color: #dc2626; font-size: 11px; margin-right: 4px;">🔴 Non-Veg</span>'}
          ${item.name}
        </div>
        ${item.restaurantName ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${item.restaurantName}</div>` : ""}
      </td>
      <td align="center" style="padding: 12px 8px; border-bottom: 1px solid #f1f5f9; color: #475569; font-weight: 600; font-size: 13px;">
        × ${item.quantity}
      </td>
      <td align="right" style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #0f172a; font-size: 14px; font-family: monospace;">
        ₹${(item.price * item.quantity).toFixed(2)}
      </td>
    </tr>
  `).join("");

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Receipt - ${displayOrderId}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); padding: 32px 28px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">NUVVO</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.95;">Food Delivery & Cloud Kitchen</p>
              
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); backdrop-filter: blur(8px); border-radius: 9999px; padding: 6px 16px; margin-top: 16px; font-size: 12px; font-weight: 800;">
                ✓ Order Confirmed • ETA ~${eta} mins
              </div>
            </td>
          </tr>

          <!-- Order Summary Card -->
          <tr>
            <td style="padding: 28px 24px;">
              <p style="margin: 0 0 4px 0; color: #64748b; font-size: 13px;">Hi <strong style="color: #0f172a;">${customerName}</strong>,</p>
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 20px; font-weight: 800;">Thank you for your order!</h2>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.5;">
                We've received your payment and our kitchen has started preparing your fresh meal. Here is your itemized receipt for order <strong>${displayOrderId}</strong>.
              </p>

              <!-- Order Meta Strip -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; margin-bottom: 24px; padding: 12px 16px;">
                <tr>
                  <td width="50%" style="font-size: 12px; color: #7c2d12; line-height: 1.5;">
                    <div><strong>Order ID:</strong> ${displayOrderId}</div>
                    <div><strong>Date:</strong> ${formattedDate}</div>
                  </td>
                  <td width="50%" align="right" style="font-size: 12px; color: #7c2d12; line-height: 1.5;">
                    <div><strong>Payment:</strong> ${paymentMethod} (${paymentStatus})</div>
                    <div><strong>Estimated Delivery:</strong> ~${eta} mins</div>
                  </td>
                </tr>
              </table>

              <!-- Itemized Table -->
              <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Itemized Receipt</h3>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <thead>
                  <tr style="border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800;">
                    <th align="left" style="padding-bottom: 8px;">Item Description</th>
                    <th align="center" style="padding-bottom: 8px; width: 60px;">Qty</th>
                    <th align="right" style="padding-bottom: 8px; width: 90px;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Bill Breakdown -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="color: #64748b; font-size: 13px; padding-bottom: 6px;">Item Subtotal</td>
                  <td align="right" style="color: #0f172a; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">₹${subtotal.toFixed(2)}</td>
                </tr>
                ${discount > 0 ? `
                <tr>
                  <td style="color: #16a34a; font-size: 13px; padding-bottom: 6px;">Discounts & Rewards</td>
                  <td align="right" style="color: #16a34a; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">-₹${discount.toFixed(2)}</td>
                </tr>` : ""}
                <tr>
                  <td style="color: #64748b; font-size: 13px; padding-bottom: 6px;">Delivery Partner Fee</td>
                  <td align="right" style="color: #0f172a; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">${deliveryFee > 0 ? `₹${deliveryFee.toFixed(2)}` : '<span style="color:#16a34a;">FREE</span>'}</td>
                </tr>
                ${packagingFee > 0 ? `
                <tr>
                  <td style="color: #64748b; font-size: 13px; padding-bottom: 6px;">Packaging Fee</td>
                  <td align="right" style="color: #0f172a; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">₹${packagingFee.toFixed(2)}</td>
                </tr>` : ""}
                ${tax > 0 ? `
                <tr>
                  <td style="color: #64748b; font-size: 13px; padding-bottom: 6px;">Taxes & GST (5%)</td>
                  <td align="right" style="color: #0f172a; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">₹${tax.toFixed(2)}</td>
                </tr>` : ""}
                ${tip > 0 ? `
                <tr>
                  <td style="color: #ea580c; font-size: 13px; padding-bottom: 6px;">Delivery Partner Tip</td>
                  <td align="right" style="color: #ea580c; font-size: 13px; font-weight: 600; padding-bottom: 6px; font-family: monospace;">₹${tip.toFixed(2)}</td>
                </tr>` : ""}
                <tr style="border-top: 1px dashed #cbd5e1;">
                  <td style="color: #0f172a; font-size: 16px; font-weight: 900; padding-top: 10px;">Total Paid</td>
                  <td align="right" style="color: #ea580c; font-size: 18px; font-weight: 900; padding-top: 10px; font-family: monospace;">₹${finalAmount.toFixed(2)}</td>
                </tr>
              </table>

              <!-- Delivery Information Section -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 4px;">📍 Delivery Location</div>
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4;">${addressLine}</div>
                    ${deliveryInstructions ? `
                      <div style="margin-top: 8px; font-size: 12px; color: #c2410c; background-color: #fff7ed; padding: 6px 10px; border-radius: 8px; border-left: 3px solid #ea580c;">
                        <strong>Instructions:</strong> "${deliveryInstructions}"
                      </div>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- Track Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://ais-dev-doqwgurnhhm6f2nyj4d7mf-343969814096.asia-southeast1.run.app" style="display: inline-block; background: linear-gradient(135deg, #ea580c, #f97316); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
                      Track Your Live Delivery →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 6px 0; color: #64748b; font-size: 12px; font-weight: 600;">
                Questions about your order? Contact Nuvvo Support at support@nuvvo.delivery
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                &copy; ${new Date().getFullYear()} Nuvvo Food Delivery • Chirala Hub, Andhra Pradesh. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const mailOptions = {
    from: `"Nuvvo Food Delivery" <${senderEmail}>`,
    to: customerEmail,
    subject: `Order Confirmed: ${displayOrderId} - ₹${finalAmount.toFixed(2)} (ETA ~${eta} mins)`,
    text: `Hello ${customerName},\n\nYour order ${displayOrderId} has been confirmed!\nTotal Paid: ₹${finalAmount.toFixed(2)}\nPayment Method: ${paymentMethod} (${paymentStatus})\nDelivery Address: ${addressLine}\n\nEstimated Delivery Time: ~${eta} mins.\n\nThank you for choosing Nuvvo!`,
    html: emailHtml
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Success] Order confirmation email dispatched for order ${displayOrderId} to ${customerEmail} (MessageId: ${info.messageId})`);
    return {
      success: true,
      configured: true,
      provider: 'nodemailer_smtp',
      messageId: info.messageId
    };
  } catch (err: any) {
    console.error(`[SMTP Error] Failed to send order confirmation email for order ${displayOrderId}:`, err?.message || err);
    return {
      success: false,
      configured: true,
      provider: 'nodemailer_smtp',
      error: `Failed to dispatch order receipt: ${err?.message || "Unknown SMTP error"}`
    };
  }
}
