/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/verify-email
 * 
 * Uses Nodemailer to verify SMTP connectivity and optionally dispatch
 * a test email using EMAIL_USER, EMAIL_PASS, and SMTP_HOST from .env.example.
 * 
 * Extensively captures and logs detailed SMTP connection handshakes, TLS negotiation,
 * authentication responses, and socket transmission events to assist debugging.
 * 
 * Supports both GET and POST requests.
 * Accessible locally via Express and on Vercel as a standalone serverless route.
 */

import nodemailer from "nodemailer";
import { parseRequestBody, sendJsonResponse } from "../auth-utils";
import { loadSmtpConfig, saveSmtpConfig } from "../email-service";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  // Memory buffer of all SMTP protocol log entries captured during this invocation
  const smtpLogs: Array<{
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    type: "protocol" | "handshake" | "auth" | "transmission" | "system";
    message: string;
    details?: any;
  }> = [];

  let runtimeCustomPass = "";

  const addLog = (
    level: "debug" | "info" | "warn" | "error",
    type: "protocol" | "handshake" | "auth" | "transmission" | "system",
    message: string,
    details?: any
  ) => {
    // Sanitize any potential secret strings before saving to log array
    let cleanMessage = String(message || "");
    if (process.env.EMAIL_PASS) {
      cleanMessage = cleanMessage.replace(new RegExp(process.env.EMAIL_PASS.replace(/\s+/g, ""), "gi"), "[REDACTED_PASS]");
    }
    if (process.env.SMTP_PASS) {
      cleanMessage = cleanMessage.replace(new RegExp(process.env.SMTP_PASS.replace(/\s+/g, ""), "gi"), "[REDACTED_PASS]");
    }
    if (runtimeCustomPass) {
      cleanMessage = cleanMessage.replace(new RegExp(runtimeCustomPass.replace(/\s+/g, ""), "gi"), "[REDACTED_PASS]");
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      type,
      message: cleanMessage,
      ...(details ? { details } : {})
    };
    smtpLogs.push(entry);

    if (level === "error") {
      console.error(`[Verify Email - ${type.toUpperCase()}]`, cleanMessage);
    } else if (level === "warn") {
      console.warn(`[Verify Email - ${type.toUpperCase()}]`, cleanMessage);
    } else {
      console.log(`[Verify Email - ${type.toUpperCase()}]`, cleanMessage);
    }
  };

  try {
    addLog("info", "system", "Initiating /api/verify-email request inspection.");

    // Parse request body and query parameters first to allow credential override or defaults
    const body = await parseRequestBody(req);
    const query = req.query || {};

    // 1. Gather configuration from persistent config, request overrides, or environment variables
    const currentCfg = loadSmtpConfig();
    const emailUser = (body?.user || query?.user || currentCfg.user || process.env.EMAIL_USER || process.env.SMTP_USER || "").trim();
    const emailPass = (body?.pass || query?.pass || currentCfg.pass || process.env.EMAIL_PASS || process.env.SMTP_PASS || "").trim();
    const smtpHost = (body?.host || query?.host || currentCfg.host || process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const smtpPort = Number(body?.port || query?.port || currentCfg.port || process.env.SMTP_PORT) || (smtpHost.includes("gmail") ? 465 : 587);
    const emailFrom = (body?.from || query?.from || currentCfg.from || process.env.EMAIL_FROM || emailUser || "Nuvvo Food Delivery <no-reply@nuvvo.delivery>").trim();
    if (emailPass) runtimeCustomPass = emailPass;
    const isSecure = smtpPort === 465;

    if (body?.save && emailUser && emailPass) {
      saveSmtpConfig({ user: emailUser, pass: emailPass, host: smtpHost, port: smtpPort, from: emailFrom });
      addLog("info", "system", "Saved SMTP configuration persistently on server.");
    }

    // Check if credentials are configured
    const isConfigured = Boolean(emailUser && emailPass);
    const isOverridden = Boolean(body?.user || body?.pass || body?.host);

    // Diagnostics metadata to include in all responses
    const transportConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      configured: isConfigured,
      authConfigured: isConfigured,
      userConfigured: Boolean(emailUser),
      passConfigured: Boolean(emailPass),
      isOverride: isOverridden,
      maskedUser: emailUser ? (emailUser.includes("@") ? `${emailUser[0]}***@${emailUser.split("@")[1]}` : `${emailUser.slice(0, 3)}***`) : null,
      fromAddress: emailFrom
    };

    // If credentials are not configured, return clear instructions and details without crashing
    if (!isConfigured) {
      const missingVars: string[] = [];
      if (!emailUser) missingVars.push("EMAIL_USER / Username");
      if (!emailPass) missingVars.push("EMAIL_PASS / Password");

      addLog("warn", "system", `SMTP credentials missing: ${missingVars.join(", ")}`);

      return sendJsonResponse(res, 200, {
        success: false,
        status: "unconfigured",
        message: "Email provider credentials are not yet configured in environment variables or request.",
        details: {
          missingVariables: missingVars,
          requiredVariables: ["EMAIL_USER", "EMAIL_PASS", "SMTP_HOST (optional, defaults to smtp.gmail.com)", "SMTP_PORT (optional, defaults to 465)"],
          transport: transportConfig,
          instructions: "To enable live email delivery, configure EMAIL_USER and EMAIL_PASS in your Vercel Project Settings or local environment variables as documented in .env.example, or specify test credentials directly in the admin tool."
        },
        logs: smtpLogs
      });
    }

    addLog("info", "handshake", `Preparing SMTP transport configuration for ${smtpHost}:${smtpPort} (secure=${isSecure}).`);

    // 2. Custom logger bridging Nodemailer debug/logger outputs directly into smtpLogs
    const customLogger = {
      level(levelName: string) {
        return levelName;
      },
      debug(obj: any, ...args: any[]) {
        const msg = typeof obj === "string" ? obj : (obj?.msg || JSON.stringify(obj));
        const formatted = args.length > 0 ? `${msg} ${args.join(" ")}` : msg;
        const type: "protocol" | "handshake" | "auth" | "transmission" = 
          formatted.includes("AUTH") ? "auth" :
          (formatted.includes("Connecting") || formatted.includes("TLS") || formatted.includes("handshake")) ? "handshake" :
          "protocol";
        addLog("debug", type, formatted);
      },
      info(obj: any, ...args: any[]) {
        const msg = typeof obj === "string" ? obj : (obj?.msg || JSON.stringify(obj));
        const formatted = args.length > 0 ? `${msg} ${args.join(" ")}` : msg;
        addLog("info", "handshake", formatted);
      },
      warn(obj: any, ...args: any[]) {
        const msg = typeof obj === "string" ? obj : (obj?.msg || JSON.stringify(obj));
        const formatted = args.length > 0 ? `${msg} ${args.join(" ")}` : msg;
        addLog("warn", "protocol", formatted);
      },
      error(obj: any, ...args: any[]) {
        const msg = typeof obj === "string" ? obj : (obj?.msg || obj?.message || JSON.stringify(obj));
        const formatted = args.length > 0 ? `${msg} ${args.join(" ")}` : msg;
        addLog("error", "protocol", formatted);
      }
    };

    // 3. Initialize Nodemailer transporter with debug & protocol logger enabled
    const cleanPass = emailPass.replace(/\s+/g, ""); // Strip spaces if Gmail App Password copied with spaces
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      auth: {
        user: emailUser,
        pass: cleanPass
      },
      tls: {
        rejectUnauthorized: false // Prevent handshake rejections in cloud or proxy environments
      },
      debug: true,
      logger: customLogger,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    });

    // 4. Test SMTP connection & Authentication via transporter.verify()
    addLog("info", "handshake", `Executing transporter.verify() handshake with ${smtpHost}:${smtpPort}...`);
    try {
      await transporter.verify();
      addLog("info", "auth", `SMTP handshake and authentication verified successfully with ${smtpHost}.`);
    } catch (verifyError: any) {
      addLog("error", "auth", `SMTP verification failed during handshake/authentication: ${verifyError?.message || verifyError}`, {
        code: verifyError?.code,
        command: verifyError?.command,
        response: verifyError?.response,
        responseCode: verifyError?.responseCode
      });

      return sendJsonResponse(res, 502, {
        success: false,
        status: "connection_failed",
        error: "Failed to establish or authenticate SMTP connection with the configured provider.",
        details: {
          errorMessage: verifyError?.message || String(verifyError),
          errorCode: verifyError?.code || "UNKNOWN_ERROR",
          command: verifyError?.command || null,
          responseCode: verifyError?.responseCode || null,
          smtpResponse: verifyError?.response || null,
          transport: transportConfig,
          recommendation: smtpHost.includes("gmail")
            ? "For Gmail, ensure 2-Step Verification is active and you are using a 16-character App Password (not your personal Google account password)."
            : "Please verify SMTP host, port, username, and password credentials."
        },
        logs: smtpLogs
      });
    }

    // 5. Determine recipient for test email
    // Prioritize recipient: body.to -> query.to -> verified test address -> sender email
    const requestedRecipient = body?.to || query?.to || query?.email || body?.email || "arjungorrepato@gmail.com";
    const recipient = String(requestedRecipient).trim();
    const shouldSendEmail = body?.send !== false && query?.send !== "false";

    let sendResult: any = null;

    // 6. Send test email if requested (default behavior)
    if (shouldSendEmail && recipient) {
      addLog("info", "transmission", `Initiating test email transmission to ${recipient}...`);
      const timestamp = new Date().toISOString();
      const mailOptions = {
        from: emailFrom,
        to: recipient,
        subject: `[Nuvvo] SMTP Test Email - Verification Successful (${new Date().toLocaleTimeString()})`,
        text: `Nuvvo Email Service Verification\n\nYour SMTP email service is functioning properly!\n\nDetails:\n- Host: ${smtpHost}\n- Port: ${smtpPort}\n- Sender: ${emailFrom}\n- Recipient: ${recipient}\n- Timestamp: ${timestamp}\n\nThis confirms that customer registration and OTP verification emails will deliver successfully.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Nuvvo SMTP Test Email</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 15px;">
              <tr>
                <td align="center">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                      <td align="center" style="background: linear-gradient(135deg, #16a34a, #22c55e); padding: 28px 20px; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">NUVVO</h1>
                        <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.95;">Email Dispatcher Diagnostic</p>
                      </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                      <td style="padding: 32px 28px;">
                        <div style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px;">
                          ✓ SMTP CONNECTIVITY VERIFIED
                        </div>
                        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Test Email Delivery Succeeded</h2>
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                          This test email confirms that your Nodemailer transport is connected, authorized, and actively delivering emails through your configured SMTP server.
                        </p>
                        
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
                          <h3 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Diagnostic Details</h3>
                          <table width="100%" style="font-size: 13px; color: #334155; line-height: 1.8;">
                            <tr>
                              <td style="font-weight: 600; width: 110px;">SMTP Host:</td>
                              <td style="font-family: monospace;">${smtpHost}:${smtpPort}</td>
                            </tr>
                            <tr>
                              <td style="font-weight: 600;">Security:</td>
                              <td>${isSecure ? "SSL/TLS (Port 465)" : "STARTTLS (Port 587)"}</td>
                            </tr>
                            <tr>
                              <td style="font-weight: 600;">Sender:</td>
                              <td style="font-family: monospace;">${emailFrom}</td>
                            </tr>
                            <tr>
                              <td style="font-weight: 600;">Recipient:</td>
                              <td style="font-family: monospace;">${recipient}</td>
                            </tr>
                            <tr>
                              <td style="font-weight: 600;">Timestamp:</td>
                              <td>${timestamp}</td>
                            </tr>
                          </table>
                        </div>

                        <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
                          Your Nuvvo application is ready to deliver real customer registration OTPs and password reset verification codes.
                        </p>
                      </td>
                    </tr>
                    <!-- Footer -->
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
        addLog("info", "transmission", `Test email message accepted by SMTP server. Message ID: ${info.messageId}`, {
          response: info.response,
          accepted: info.accepted,
          rejected: info.rejected
        });

        sendResult = {
          dispatched: true,
          messageId: info.messageId,
          recipient,
          accepted: info.accepted || [recipient],
          rejected: info.rejected || [],
          response: info.response || "250 OK"
        };
      } catch (sendError: any) {
        addLog("error", "transmission", `Failed to dispatch test email message: ${sendError?.message || sendError}`, {
          code: sendError?.code,
          command: sendError?.command,
          response: sendError?.response,
          responseCode: sendError?.responseCode
        });

        return sendJsonResponse(res, 502, {
          success: false,
          status: "send_failed",
          error: `SMTP connection succeeded, but email dispatch failed: ${sendError?.message || sendError}`,
          details: {
            errorMessage: sendError?.message || String(sendError),
            errorCode: sendError?.code || "SEND_FAILED",
            command: sendError?.command || null,
            responseCode: sendError?.responseCode || null,
            smtpResponse: sendError?.response || null,
            recipient,
            transport: transportConfig
          },
          logs: smtpLogs
        });
      }
    }

    addLog("info", "system", "SMTP verification completed successfully.");

    return sendJsonResponse(res, 200, {
      success: true,
      status: "verified",
      message: sendResult?.dispatched 
        ? `SMTP connection verified and test email sent successfully to ${recipient}.`
        : "SMTP connection verified successfully.",
      transport: transportConfig,
      delivery: sendResult,
      logs: smtpLogs
    });
  } catch (err: any) {
    addLog("error", "system", `Unhandled exception during verify-email execution: ${err?.message || err}`);
    return sendJsonResponse(res, 500, {
      success: false,
      status: "server_error",
      error: `An unexpected error occurred while verifying the email service: ${err?.message || err}`,
      logs: smtpLogs
    });
  }
}
