import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export interface SecretCheck {
  isConfigured: boolean;
  length: number;
  note?: string;
}

export interface OtpDiagnosticReport {
  status: "ready" | "degraded" | "unready";
  timestamp: string;
  runtime: {
    nodeVersion: string;
    platform: string;
    nodeEnv: string;
    isVercel: boolean;
    vercelEnv: string;
    vercelRegion: string;
  };
  secrets: {
    sessionSecret: SecretCheck & { isCustomSecret: boolean; isStrong: boolean };
    supabaseServiceRoleKey: SecretCheck;
    supabaseSecretKey: SecretCheck;
    twilioAccountSid: SecretCheck & { hasValidPrefix?: boolean };
    twilioAuthToken: SecretCheck;
    twilioPhoneNumber: SecretCheck & { isValidFormat?: boolean };
    fast2SmsApiKey: SecretCheck;
    adminPhone: { isConfigured: boolean; masked: string };
    adminSecurityPin: SecretCheck;
  };
  moduleReadiness: {
    cryptoLoaded: boolean;
    randomIntFunctional: boolean;
    pbkdf2Functional: boolean;
    hmacSha256Functional: boolean;
    timingSafeEqualFunctional: boolean;
    allCryptoChecksPassed: boolean;
  };
  otpServiceConfiguration: {
    twilioBlockedOrDisabled: boolean;
    isTwilioConfigured: boolean;
    isFast2SmsConfigured: boolean;
    isRealSmsProviderActive: boolean;
    effectiveOtpDeliveryMode: "temporary_in_app_otp" | "sms_gateway";
    statelessChallengeTokenSigningReady: boolean;
    explanation: string;
  };
}

export function generateOtpDiagnostics(): OtpDiagnosticReport {
  // 1. Secrets check without leaking raw values
  const sessionSecretVal = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || "";
  const isCustomSessionSecret = Boolean(process.env.SESSION_SECRET);
  const sessionSecretLength = sessionSecretVal.length;
  const isSessionSecretStrong = sessionSecretLength >= 24;

  const twilioSid = process.env.TWILIO_ACCOUNT_SID || "";
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || "";
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER || "";
  const fast2SmsKey = process.env.FAST2SMS_API_KEY || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
  const adminPhoneVal = process.env.ADMIN_PHONE || "9063692135";
  const adminPinVal = process.env.ADMIN_SECURITY_PIN || "2026";

  const disableTwilio =
    process.env.DISABLE_TWILIO === "true" || process.env.BLOCK_TWILIO === "true";

  const isTwilioFullyConfigured =
    !disableTwilio &&
    Boolean(twilioSid.trim() && twilioToken.trim() && twilioPhone.trim());
  const isFast2SmsConfigured = Boolean(fast2SmsKey.trim());
  const isRealSmsProviderActive = isTwilioFullyConfigured || isFast2SmsConfigured;

  // Mask admin phone safely: show only last 4 digits
  const cleanAdminPhone = adminPhoneVal.replace(/\D/g, "");
  const maskedAdminPhone =
    cleanAdminPhone.length >= 4
      ? "*".repeat(Math.max(0, cleanAdminPhone.length - 4)) + cleanAdminPhone.slice(-4)
      : "****";

  // 2. Cryptographic subsystem readiness checks
  let randomIntFunctional = false;
  let pbkdf2Functional = false;
  let hmacSha256Functional = false;
  let timingSafeEqualFunctional = false;

  try {
    const testInt = crypto.randomInt(100000, 1000000);
    randomIntFunctional = testInt >= 100000 && testInt < 1000000;
  } catch {
    randomIntFunctional = false;
  }

  try {
    const testSalt = crypto.randomBytes(8).toString("hex");
    const testHash = crypto.pbkdf2Sync("test-pass", testSalt, 100, 16, "sha256").toString("hex");
    pbkdf2Functional = Boolean(testHash && testHash.length === 32);
  } catch {
    pbkdf2Functional = false;
  }

  try {
    const testSig = crypto
      .createHmac("sha256", sessionSecretVal || "nuvvo_test_salt")
      .update("healthcheck_payload")
      .digest("base64url");
    hmacSha256Functional = Boolean(testSig && testSig.length > 20);
  } catch {
    hmacSha256Functional = false;
  }

  try {
    const bufA = Buffer.from("nuvvo_sig_a");
    const bufB = Buffer.from("nuvvo_sig_a");
    timingSafeEqualFunctional = crypto.timingSafeEqual(bufA, bufB);
  } catch {
    timingSafeEqualFunctional = false;
  }

  const allCryptoChecksPassed =
    randomIntFunctional &&
    pbkdf2Functional &&
    hmacSha256Functional &&
    timingSafeEqualFunctional;

  const statelessChallengeTokenSigningReady =
    allCryptoChecksPassed && Boolean(sessionSecretVal);

  const effectiveOtpDeliveryMode = isRealSmsProviderActive
    ? "sms_gateway"
    : "temporary_in_app_otp";

  const explanation = isRealSmsProviderActive
    ? "Real SMS provider is configured. OTP codes will be dispatched via SMS gateway."
    : disableTwilio
    ? "Twilio is explicitly blocked/disabled (DISABLE_TWILIO=true / BLOCK_TWILIO=true). Generating temporary 5-minute single-use OTPs for secure verification."
    : "No external SMS gateway configured (no Twilio/Fast2SMS credentials). System operates in temporary single-use OTP mode with HMAC challenge tokens.";

  const status: "ready" | "degraded" | "unready" = !allCryptoChecksPassed
    ? "unready"
    : !isCustomSessionSecret && (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production")
    ? "degraded"
    : "ready";

  return {
    status,
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV || "development",
      isVercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV || "local",
      vercelRegion: process.env.VERCEL_REGION || "local",
    },
    secrets: {
      sessionSecret: {
        isConfigured: Boolean(process.env.SESSION_SECRET),
        isCustomSecret: isCustomSessionSecret,
        length: sessionSecretLength,
        isStrong: isSessionSecretStrong,
        note: isCustomSessionSecret
          ? "Explicit SESSION_SECRET environment variable detected."
          : "Using secure built-in fallback secret. Recommended to define SESSION_SECRET in Vercel project settings.",
      },
      supabaseServiceRoleKey: {
        isConfigured: Boolean(supabaseServiceKey),
        length: supabaseServiceKey.length,
      },
      supabaseSecretKey: {
        isConfigured: Boolean(supabaseSecretKey),
        length: supabaseSecretKey.length,
      },
      twilioAccountSid: {
        isConfigured: Boolean(twilioSid),
        length: twilioSid.length,
        hasValidPrefix: twilioSid.startsWith("AC"),
      },
      twilioAuthToken: {
        isConfigured: Boolean(twilioToken),
        length: twilioToken.length,
      },
      twilioPhoneNumber: {
        isConfigured: Boolean(twilioPhone),
        length: twilioPhone.length,
        isValidFormat: Boolean(twilioPhone && /^\+?[0-9]{10,15}$/.test(twilioPhone.trim())),
      },
      fast2SmsApiKey: {
        isConfigured: Boolean(fast2SmsKey),
        length: fast2SmsKey.length,
      },
      adminPhone: {
        isConfigured: Boolean(adminPhoneVal),
        masked: maskedAdminPhone,
      },
      adminSecurityPin: {
        isConfigured: Boolean(adminPinVal),
        length: adminPinVal.length,
      },
    },
    moduleReadiness: {
      cryptoLoaded: Boolean(crypto),
      randomIntFunctional,
      pbkdf2Functional,
      hmacSha256Functional,
      timingSafeEqualFunctional,
      allCryptoChecksPassed,
    },
    otpServiceConfiguration: {
      twilioBlockedOrDisabled: disableTwilio,
      isTwilioConfigured: isTwilioFullyConfigured,
      isFast2SmsConfigured,
      isRealSmsProviderActive,
      effectiveOtpDeliveryMode,
      statelessChallengeTokenSigningReady,
      explanation,
    },
  };
}

// Serverless function entry point for Vercel and Express
export default async function handler(req: any, res: any) {
  // Enable CORS for universal frontend / dashboard inspection
  res.setHeader?.("Access-Control-Allow-Origin", "*");
  res.setHeader?.("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const report = generateOtpDiagnostics();

    // Specifically check and log the availability of SESSION_SECRET, TWILIO_ACCOUNT_SID, and TWILIO_AUTH_TOKEN
    // WITHOUT logging or exposing any sensitive values
    const sessionSecretStatus = report.secrets.sessionSecret.isConfigured
      ? `CONFIGURED (len=${report.secrets.sessionSecret.length}, strong=${report.secrets.sessionSecret.isStrong})`
      : "UNCONFIGURED (using built-in fallback)";
    
    const twilioSidStatus = report.secrets.twilioAccountSid.isConfigured
      ? `CONFIGURED (len=${report.secrets.twilioAccountSid.length}, startsWithAC=${report.secrets.twilioAccountSid.hasValidPrefix})`
      : "NOT_SET";

    const twilioAuthTokenStatus = report.secrets.twilioAuthToken.isConfigured
      ? `CONFIGURED (len=${report.secrets.twilioAuthToken.length})`
      : "NOT_SET";

    console.log(
      `[OTP Diagnostics] Vercel Runtime Check:\n` +
      `  • SESSION_SECRET: ${sessionSecretStatus}\n` +
      `  • TWILIO_ACCOUNT_SID: ${twilioSidStatus}\n` +
      `  • TWILIO_AUTH_TOKEN: ${twilioAuthTokenStatus}\n` +
      `  • Runtime Environment: Node ${report.runtime.nodeVersion} on ${report.runtime.platform} (VERCEL_ENV: ${report.runtime.vercelEnv}, Region: ${report.runtime.vercelRegion})\n` +
      `  • Effective OTP Delivery Mode: ${report.otpServiceConfiguration.effectiveOtpDeliveryMode}\n` +
      `  • Crypto Module Readiness: ${report.moduleReadiness.allCryptoChecksPassed ? 'READY' : 'FAILED'}`
    );

    const responsePayload = {
      success: true,
      service: "nuvvo-otp-diagnostics",
      summary: {
        SESSION_SECRET: {
          exists: report.secrets.sessionSecret.isConfigured,
          isCustom: report.secrets.sessionSecret.isCustomSecret,
          length: report.secrets.sessionSecret.length,
          isStrong: report.secrets.sessionSecret.isStrong,
        },
        TWILIO_ACCOUNT_SID: {
          exists: report.secrets.twilioAccountSid.isConfigured,
          length: report.secrets.twilioAccountSid.length,
          hasValidPrefix: report.secrets.twilioAccountSid.hasValidPrefix,
        },
        TWILIO_AUTH_TOKEN: {
          exists: report.secrets.twilioAuthToken.isConfigured,
          length: report.secrets.twilioAuthToken.length,
        },
      },
      data: report,
    };

    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(200).json(responsePayload);
    } else {
      res.statusCode = 200;
      res.setHeader?.("Content-Type", "application/json");
      return res.end?.(JSON.stringify(responsePayload));
    }
  } catch (err: any) {
    console.error("[OTP Diagnostics Error] Failed to generate diagnostics:", err?.message || err);
    const errorPayload = {
      success: false,
      error: "Failed to generate OTP diagnostics",
      message: err?.message || "Unknown error",
    };
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(500).json(errorPayload);
    } else {
      res.statusCode = 500;
      res.setHeader?.("Content-Type", "application/json");
      return res.end?.(JSON.stringify(errorPayload));
    }
  }
}
