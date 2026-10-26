/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Official PhonePe Payment Gateway Integration Utility (Standard Checkout PG v1)
 * 
 * Strictly follows official PhonePe Developer Documentation:
 * - Payment Request Endpoint: /pg/v1/pay
 * - Check Status Endpoint: /pg/v1/status/{merchantId}/{merchantTransactionId}
 * - Checksum algorithm: SHA256(data + saltKey) + "###" + saltIndex
 * - Safe credential isolation: secrets are read ONLY from server-side environment variables.
 */

import crypto from 'crypto';

export interface PhonePeConfigStatus {
  isConfigured: boolean;
  environment: 'SANDBOX' | 'PRODUCTION';
  merchantId: string; // Masked for safety
  saltIndex: number;
  missingVariables: string[];
  hostUrl: string;
}

export interface PhonePeInitiateResult {
  success: boolean;
  orderId: string;
  merchantTransactionId: string;
  redirectUrl?: string;
  code?: string;
  message?: string;
  error?: string;
  missingVariables?: string[];
}

export interface PhonePeStatusResult {
  success: boolean;
  merchantTransactionId: string;
  transactionId?: string;
  amountInPaise?: number;
  amountInRupees?: number;
  state?: 'COMPLETED' | 'FAILED' | 'PENDING' | 'CANCELLED';
  responseCode?: string;
  paymentInstrument?: {
    type?: string;
    utr?: string;
    cardType?: string;
    pgTransactionId?: string;
    arn?: string;
  };
  raw?: any;
  error?: string;
}

// PhonePe API Hosts
const PHONEPE_HOSTS = {
  SANDBOX: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  PRODUCTION: 'https://api.phonepe.com/apis/hermes'
};

/**
 * Returns safe environment configuration for PhonePe without leaking secrets.
 */
export function getPhonePeConfig(): {
  merchantId: string;
  saltKey: string;
  saltIndex: string;
  env: 'SANDBOX' | 'PRODUCTION';
  hostUrl: string;
  isConfigured: boolean;
  missingVariables: string[];
} {
  const merchantId = (process.env.PHONEPE_MERCHANT_ID || '').trim();
  const saltKey = (process.env.PHONEPE_SALT_KEY || '').trim();
  const saltIndex = (process.env.PHONEPE_SALT_INDEX || '1').trim();
  const envRaw = (process.env.PHONEPE_ENV || 'SANDBOX').trim().toUpperCase();
  const env: 'SANDBOX' | 'PRODUCTION' = envRaw === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

  const missingVariables: string[] = [];
  if (!merchantId) missingVariables.push('PHONEPE_MERCHANT_ID');
  if (!saltKey) missingVariables.push('PHONEPE_SALT_KEY');
  if (!saltIndex) missingVariables.push('PHONEPE_SALT_INDEX');

  const isConfigured = missingVariables.length === 0;
  const hostUrl = env === 'PRODUCTION' ? PHONEPE_HOSTS.PRODUCTION : PHONEPE_HOSTS.SANDBOX;

  return {
    merchantId,
    saltKey,
    saltIndex,
    env,
    hostUrl,
    isConfigured,
    missingVariables
  };
}

/**
 * Returns safe diagnostic status for administrator inspection.
 */
export function getPhonePeConfigStatus(): PhonePeConfigStatus {
  const config = getPhonePeConfig();
  const maskedMerchantId = config.merchantId.length > 4 
    ? config.merchantId.slice(0, 4) + '...' + config.merchantId.slice(-3)
    : (config.merchantId ? '***' : 'NOT_SET');

  return {
    isConfigured: config.isConfigured,
    environment: config.env,
    merchantId: maskedMerchantId,
    saltIndex: Number(config.saltIndex) || 1,
    missingVariables: config.missingVariables,
    hostUrl: config.hostUrl
  };
}

/**
 * Generates an SHA256 checksum with salt index according to official PhonePe specifications.
 * Format: SHA256(dataString + saltKey) + "###" + saltIndex
 */
export function generatePhonePeChecksum(dataString: string, saltKey: string, saltIndex: string | number): string {
  const stringToHash = dataString + saltKey;
  const sha256 = crypto.createHash('sha256').update(stringToHash, 'utf8').digest('hex');
  return `${sha256}###${saltIndex}`;
}

/**
 * Initiates a server-side standard checkout session with PhonePe.
 * 
 * @param orderId Nuvvo order ID
 * @param amountInRupees Server-verified amount in INR
 * @param customerPhone Customer mobile number
 * @param customerId Customer identifier
 * @param appBaseUrl Application base URL for return redirects and webhooks
 */
export async function createPhonePePaymentRequest(
  orderId: string,
  amountInRupees: number,
  customerPhone: string,
  customerId: string,
  appBaseUrl: string
): Promise<PhonePeInitiateResult> {
  const config = getPhonePeConfig();

  // Guard: Fail safely with clear diagnostic when credentials are not configured
  if (!config.isConfigured) {
    return {
      success: false,
      orderId,
      merchantTransactionId: '',
      code: 'PHONEPE_NOT_CONFIGURED',
      message: 'PhonePe Payment Gateway is not yet configured. Please set PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, and PHONEPE_SALT_INDEX in your Vercel project environment variables.',
      missingVariables: config.missingVariables
    };
  }

  // Enforce strictly verified amount in paise (minimum 100 paise = 1 INR)
  const amountInPaise = Math.max(100, Math.round(Number(amountInRupees) * 100));

  // Construct a clean, unique merchant transaction ID
  const cleanOrderId = String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(-18);
  const merchantTransactionId = `MT_${cleanOrderId}_${Date.now().toString().slice(-6)}`;

  // Normalize phone number (must be 10 digits without leading 0 or +91 for Indian mobile)
  const digits = String(customerPhone || '').replace(/\D/g, '');
  let mobileNumber = digits.slice(-10);
  if (mobileNumber.length < 10) {
    mobileNumber = '9876543210'; // Safe fallback format
  }

  // Clean customer / merchant user ID
  const merchantUserId = (customerId || `CUST_${mobileNumber}`).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 36);

  // Clean URLs
  const cleanBase = appBaseUrl.replace(/\/+$/, '');
  const redirectUrl = `${cleanBase}/api/payment/phonepe/redirect?orderId=${encodeURIComponent(orderId)}&txnId=${encodeURIComponent(merchantTransactionId)}`;
  const callbackUrl = `${cleanBase}/api/payment/phonepe/callback`;

  // Construct the official PhonePe JSON request payload
  const requestPayload = {
    merchantId: config.merchantId,
    merchantTransactionId,
    merchantUserId,
    amount: amountInPaise,
    redirectUrl,
    redirectMode: 'POST',
    callbackUrl,
    mobileNumber,
    paymentInstrument: {
      type: 'PAY_PAGE'
    }
  };

  const jsonString = JSON.stringify(requestPayload);
  const base64Payload = Buffer.from(jsonString, 'utf8').toString('base64');

  // Checksum calculation: SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex
  const checksum = generatePhonePeChecksum(
    base64Payload + '/pg/v1/pay',
    config.saltKey,
    config.saltIndex
  );

  const endpointUrl = `${config.hostUrl}/pg/v1/pay`;

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-VERIFY': checksum
      },
      body: JSON.stringify({
        request: base64Payload
      })
    });

    const responseData = await response.json().catch(() => null);

    if (response.ok && responseData && responseData.success) {
      const redirectUrlResult = responseData.data?.instrumentResponse?.redirectInfo?.url;
      if (redirectUrlResult) {
        return {
          success: true,
          orderId,
          merchantTransactionId,
          redirectUrl: redirectUrlResult,
          code: responseData.code || 'PAYMENT_INITIATED',
          message: responseData.message || 'Payment initiated successfully'
        };
      }
    }

    const errorMsg = responseData?.message || responseData?.code || `HTTP error ${response.status}`;
    console.warn('[PhonePe Initiate] Non-success response:', {
      status: response.status,
      code: responseData?.code,
      message: responseData?.message
    });

    return {
      success: false,
      orderId,
      merchantTransactionId,
      code: responseData?.code || 'PHONEPE_API_ERROR',
      message: errorMsg,
      error: errorMsg
    };
  } catch (err: any) {
    console.error('[PhonePe Initiate] Network/API exception:', err?.message || err);
    return {
      success: false,
      orderId,
      merchantTransactionId,
      code: 'PHONEPE_CONNECTION_FAILED',
      message: `Failed to connect to PhonePe gateway: ${err?.message || 'Network error'}`,
      error: err?.message
    };
  }
}

/**
 * Server-to-server payment status verification using PhonePe's official Check Status API.
 * 
 * Never trusts client-side redirect query parameters as proof of payment.
 * Endpoint: /pg/v1/status/{merchantId}/{merchantTransactionId}
 */
export async function verifyPhonePePaymentStatus(
  merchantTransactionId: string
): Promise<PhonePeStatusResult> {
  const config = getPhonePeConfig();

  if (!config.isConfigured) {
    return {
      success: false,
      merchantTransactionId,
      state: 'FAILED',
      error: 'PhonePe credentials are not configured on the server.'
    };
  }

  const endpointPath = `/pg/v1/status/${config.merchantId}/${merchantTransactionId}`;
  
  // Status check string to hash: endpointPath + saltKey
  const checksum = generatePhonePeChecksum(
    endpointPath,
    config.saltKey,
    config.saltIndex
  );

  const url = `${config.hostUrl}${endpointPath}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': config.merchantId
      }
    });

    const responseData = await response.json().catch(() => null);

    if (responseData && responseData.data) {
      const data = responseData.data;
      const amountInPaise = Number(data.amount || 0);
      const amountInRupees = amountInPaise / 100;
      const state = (data.state || '').toUpperCase();
      const code = responseData.code || '';

      // COMPLETED or PAYMENT_SUCCESS represents true confirmed payment
      const isPaid = responseData.success === true && (state === 'COMPLETED' || code === 'PAYMENT_SUCCESS');
      const isFailed = state === 'FAILED' || code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED';

      let resolvedState: 'COMPLETED' | 'FAILED' | 'PENDING' | 'CANCELLED' = 'PENDING';
      if (isPaid) resolvedState = 'COMPLETED';
      else if (isFailed) resolvedState = 'FAILED';

      return {
        success: isPaid,
        merchantTransactionId,
        transactionId: data.transactionId,
        amountInPaise,
        amountInRupees,
        state: resolvedState,
        responseCode: code,
        paymentInstrument: data.paymentInstrument || {},
        raw: responseData
      };
    }

    return {
      success: false,
      merchantTransactionId,
      state: 'FAILED',
      responseCode: responseData?.code,
      error: responseData?.message || `HTTP ${response.status}`
    };
  } catch (err: any) {
    console.error('[PhonePe Status Check] Exception:', err?.message || err);
    return {
      success: false,
      merchantTransactionId,
      state: 'PENDING',
      error: err?.message || 'Failed to verify transaction status with PhonePe.'
    };
  }
}

/**
 * Validates PhonePe Server-to-Server (S2S) callback webhook checksum.
 * 
 * Form: SHA256(base64Response + saltKey) + "###" + saltIndex
 */
export function verifyPhonePeCallbackChecksum(
  base64Response: string,
  receivedXVerifyHeader?: string
): { isValid: boolean; payload?: any; error?: string } {
  const config = getPhonePeConfig();

  if (!config.isConfigured) {
    return { isValid: false, error: 'PhonePe credentials not configured.' };
  }

  if (!base64Response || !receivedXVerifyHeader) {
    return { isValid: false, error: 'Missing response body or X-VERIFY header.' };
  }

  const expectedChecksum = generatePhonePeChecksum(
    base64Response,
    config.saltKey,
    config.saltIndex
  );

  // Timing-safe comparison to prevent timing attacks
  const receivedBuf = Buffer.from(receivedXVerifyHeader);
  const expectedBuf = Buffer.from(expectedChecksum);

  if (receivedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
    return { isValid: false, error: 'Checksum mismatch in X-VERIFY header.' };
  }

  try {
    const decodedJson = Buffer.from(base64Response, 'base64').toString('utf8');
    const parsedPayload = JSON.parse(decodedJson);
    return { isValid: true, payload: parsedPayload };
  } catch (parseErr: any) {
    return { isValid: false, error: `Invalid Base64 JSON payload: ${parseErr?.message}` };
  }
}
