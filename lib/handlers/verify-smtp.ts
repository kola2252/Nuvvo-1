/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Serverless API Endpoint: /api/verify-smtp
 * 
 * Uses Nodemailer to connect to the configured SMTP credentials,
 * verify server handshake & authentication, and transmit a test email,
 * returning a detailed success or error JSON response to the client.
 */

import nodemailer from "nodemailer";
import { parseRequestBody, sendJsonResponse } from "../auth-utils";
import { loadSmtpConfig, saveSmtpConfig } from "../email-service";

export default async function handler(req: any, res: any) {
  // CORS Preflight handling
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  const logs: Array<{ timestamp: string; level: string; message: string }> = [];

  const addLog = (level: "info" | "warn" | "error" | "debug", message: string) => {
    let cleanMessage = String(message || "");
    if (process.env.EMAIL_PASS) {
      cleanMessage = cleanMessage.replace(new RegExp(process.env.EMAIL_PASS.replace(/\s+/g, ""), "gi"), "[REDACTED]");
    }
    if (process.env.SMTP_PASS) {
      cleanMessage = cleanMessage.replace(new RegExp(process.env.SMTP_PASS.replace(/\s+/g, ""), "gi"), "[REDACTED]");
    }
    logs.push({
      timestamp: new Date().toISOString(),
      level,
      message: cleanMessage
    });
  };

  try {
    addLog("info", "Starting SMTP verification request on /api/verify-smtp.");

    // Parse request body and query parameters
    const body = await parseRequestBody(req);
    const query = req.query || {};

    // 1. Gather SMTP credentials from persistent config, request overrides, or environment variables
    const currentCfg = loadSmtpConfig();
    const emailUser = (body?.user || query?.user || currentCfg.user || process.env.EMAIL_USER || process.env.SMTP_USER || "").trim();
    const emailPass = (body?.pass || query?.pass || currentCfg.pass || process.env.EMAIL_PASS || process.env.SMTP_PASS || "").trim();
    const smtpHost = (body?.host || query?.host || currentCfg.host || process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const smtpPort = Number(body?.port || query?.port || currentCfg.port || process.env.SMTP_PORT) || (smtpHost.includes("gmail") ? 465 : 587);
    const emailFrom = (body?.from || query?.from || currentCfg.from || process.env.EMAIL_FROM || emailUser || "Nuvvo Food Delivery <no-reply@nuvvo.delivery>").trim();
    const isSecure = smtpPort === 465;

    // Persist configuration if requested
    if (body?.save && emailUser && emailPass) {
      saveSmtpConfig({ user: emailUser, pass: emailPass, host: smtpHost, port: smtpPort, from: emailFrom });
      addLog("info", "Saved SMTP configuration persistently on server.");
    }

    const recipient = String(body?.to || query?.to || query?.email || body?.email || "arjungorrepato@gmail.com").trim();
    const shouldSendEmail = body?.send !== false && query?.send !== "false";

    // Diagnostic transport metadata
    const transportConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      configured: Boolean(emailUser && emailPass),
      maskedUser: emailUser ? (emailUser.includes("@") ? `${emailUser[0]}***@${emailUser.split("@")[1]}` : `${emailUser.slice(0, 3)}***`) : null,
      fromAddress: emailFrom
    };

    // 2. Validate that credentials exist
    if (!emailUser || !emailPass) {
      addLog("warn", "SMTP credentials missing in environment variables.");
      return sendJsonResponse(res, 200, {
        success: false,
        status: "unconfigured",
        message: "SMTP credentials are not yet configured on the server.",
        details: {
          missingVariables: [
            ...(!emailUser ? ["EMAIL_USER"] : []),
            ...(!emailPass ? ["EMAIL_PASS"] : [])
          ],
          requiredVariables: ["EMAIL_USER", "EMAIL_PASS", "SMTP_HOST", "SMTP_PORT"],
          transport: transportConfig,
          instructions: "Please configure EMAIL_USER and EMAIL_PASS in your Vercel Project Settings or local .env file."
        },
        logs
      });
    }

    addLog("info", `Initializing Nodemailer transport for ${smtpHost}:${smtpPort} (secure=${isSecure}).`);

    // 3. Create Nodemailer transporter
    const cleanPass = emailPass.replace(/\s+/g, ""); // Strip spaces from Google App Password
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      auth: {
        user: emailUser,
        pass: cleanPass
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    });

    // 4. Test connection & authentication
    addLog("info", "Executing transporter.verify() connection handshake...");
    try {
      await transporter.verify();
      addLog("info", `SMTP handshake and authentication succeeded with ${smtpHost}.`);
    } catch (verifyError: any) {
      addLog("error", `SMTP handshake failed: ${verifyError?.message || verifyError}`);
      return sendJsonResponse(res, 502, {
        success: false,
        status: "connection_failed",
        error: `SMTP connection failed: ${verifyError?.message || verifyError}`,
        details: {
          errorCode: verifyError?.code || "EAUTH",
          command: verifyError?.command || null,
          responseCode: verifyError?.responseCode || null,
          smtpResponse: verifyError?.response || null,
          transport: transportConfig,
          recommendation: smtpHost.includes("gmail")
            ? "For Gmail, ensure 2-Step Verification is active and you are using a 16-character App Password (not your personal Google account password)."
            : "Please verify SMTP host, port, username, and password credentials."
        },
        logs
      });
    }

    // 5. Send test email if requested (default)
    let sendResult: any = null;
    if (shouldSendEmail && recipient) {
      addLog("info", `Transmitting test email to ${recipient}...`);
      const timestamp = new Date().toISOString();

      const mailOptions = {
        from: emailFrom,
        to: recipient,
        subject: `[Nuvvo] SMTP Test Email - Verification Successful (${new Date().toLocaleTimeString()})`,
        text: `Nuvvo SMTP Service Verification\n\nYour SMTP email service is functioning properly!\n\nDetails:\n- Host: ${smtpHost}\n- Port: ${smtpPort}\n- Sender: ${emailFrom}\n- Recipient: ${recipient}\n- Timestamp: ${timestamp}\n\nCustomer OTP registration emails and password reset verification codes will deliver reliably.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Nuvvo SMTP Test Email</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 30px 15px;">
              <tr>
                <td align="center">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    <tr>
                      <td align="center" style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 28px 20px; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">NUVVO</h1>
                        <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.95;">SMTP Verification Test</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 32px 28px;">
                        <div style="display: inline-block; background-color: #e0e7ff; color: #4338ca; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px;">
                          ✓ SMTP CONNECTIVITY VERIFIED
                        </div>
                        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Test Email Delivery Succeeded</h2>
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                          This test email confirms that your Nodemailer transport is connected, authorized, and delivering emails through your configured SMTP server.
                        </p>
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
                          <h3 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Verification Details</h3>
                          <table width="100%" style="font-size: 13px; color: #334155; line-height: 1.8;">
                            <tr><td style="font-weight: 600; width: 110px;">SMTP Host:</td><td style="font-family: monospace;">${smtpHost}:${smtpPort}</td></tr>
                            <tr><td style="font-weight: 600;">Security:</td><td>${isSecure ? "SSL/TLS (Port 465)" : "STARTTLS (Port 587)"}</td></tr>
                            <tr><td style="font-weight: 600;">Sender:</td><td style="font-family: monospace;">${emailFrom}</td></tr>
                            <tr><td style="font-weight: 600;">Recipient:</td><td style="font-family: monospace;">${recipient}</td></tr>
                            <tr><td style="font-weight: 600;">Timestamp:</td><td>${timestamp}</td></tr>
                          </table>
                        </div>
                        <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
                          Your application is ready to send live customer registration OTPs and password reset verification codes.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f1f5f9; padding: 16px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #64748b; font-size: 11px;">
                          &copy; ${new Date().getFullYear()} Nuvvo Food Delivery. System Health & Diagnostics.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        addLog("info", `Test email message accepted by SMTP server. Message ID: ${info.messageId}`);
        sendResult = {
          dispatched: true,
          messageId: info.messageId,
          recipient,
          accepted: info.accepted || [recipient],
          rejected: info.rejected || [],
          response: info.response || "250 OK"
        };
      } catch (sendError: any) {
        addLog("error", `Failed to send email message: ${sendError?.message || sendError}`);
        return sendJsonResponse(res, 502, {
          success: false,
          status: "send_failed",
          error: `SMTP connection established, but email dispatch failed: ${sendError?.message || sendError}`,
          details: {
            errorMessage: sendError?.message || String(sendError),
            errorCode: sendError?.code || "SEND_FAILED",
            command: sendError?.command || null,
            responseCode: sendError?.responseCode || null,
            smtpResponse: sendError?.response || null,
            recipient,
            transport: transportConfig
          },
          logs
        });
      }
    }

    addLog("info", "SMTP verification completed successfully.");
    return sendJsonResponse(res, 200, {
      success: true,
      status: "verified",
      message: sendResult?.dispatched
        ? `SMTP connection verified and test email sent successfully to ${recipient}.`
        : "SMTP connection verified successfully.",
      transport: transportConfig,
      delivery: sendResult,
      logs
    });
  } catch (err: any) {
    addLog("error", `Unhandled error during SMTP verification: ${err?.message || err}`);
    return sendJsonResponse(res, 500, {
      success: false,
      status: "server_error",
      error: `An unexpected server error occurred: ${err?.message || err}`,
      logs
    });
  }
}
