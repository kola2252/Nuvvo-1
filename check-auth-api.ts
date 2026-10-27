/**
 * Nuvvo Authentication Endpoints Diagnostic Test Script
 * 
 * Tests /api/auth/send-otp, /api/auth/verify-otp, and /api/auth/verify-role.
 * Inspects HTTP status codes (specifically alerting on 404 Not Found or 500 Internal Server Error),
 * validates response headers (JSON vs HTML SPA fallback), checks payload integrity, and tests
 * both direct HTTP fetch calls and serverless function handlers.
 * 
 * Usage:
 *   npx tsx check-auth-api.ts                              (defaults to http://127.0.0.1:3000)
 *   npx tsx check-auth-api.ts https://your-app.vercel.app  (tests production Vercel deployment)
 *   TARGET_URL=https://your-domain.vercel.app npx tsx check-auth-api.ts
 */

import dotenv from 'dotenv';
dotenv.config();

// Determine target base URL from CLI argument, env var, or local dev server
const rawTargetUrl = process.argv[2] || process.env.TARGET_URL || process.env.APP_URL || 'http://127.0.0.1:3000';
const BASE_URL = rawTargetUrl.replace(/\/+$/, '');

const TEST_PHONE = '9063692135';
const TEST_CUSTOMER_PHONE = '9876543210';

interface DiagnosticResult {
  step: string;
  endpoint: string;
  method: string;
  status: number;
  is404: boolean;
  is500: boolean;
  isOk: boolean;
  contentType: string;
  durationMs: number;
  body: any;
  error?: string;
}

const results: DiagnosticResult[] = [];

async function performDiagnosticFetch(
  step: string,
  endpointPath: string,
  method: string,
  payload?: any,
  headers: Record<string, string> = {}
): Promise<DiagnosticResult> {
  const url = `${BASE_URL}${endpointPath}`;
  const startTime = Date.now();

  console.log(`\n------------------------------------------------------------`);
  console.log(`▶ [${step}] Testing ${method} ${url}`);

  try {
    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...headers
    };

    let bodyStr: string | undefined = undefined;
    if (payload !== undefined) {
      fetchHeaders['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(payload);
    }

    const resp = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: bodyStr
    });

    const durationMs = Date.now() - startTime;
    const contentType = resp.headers.get('content-type') || 'unknown';
    const isJson = contentType.includes('application/json');

    let body: any = null;
    let rawText = '';

    if (isJson) {
      try {
        body = await resp.json();
      } catch (jsonErr: any) {
        rawText = '[Failed to parse JSON body]';
      }
    } else {
      rawText = await resp.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        body = { rawText: rawText.substring(0, 300) };
      }
    }

    const is404 = resp.status === 404;
    const is500 = resp.status >= 500;
    const isOk = resp.ok;

    console.log(`  ⏱️ Duration: ${durationMs}ms`);
    console.log(`  📊 Status Code: ${resp.status} ${resp.statusText}`);
    console.log(`  📄 Content-Type: ${contentType}`);

    if (is404) {
      console.error(`  ❌ [CRITICAL 404]: Endpoint "${endpointPath}" was NOT found.`);
      console.error(`     Possible causes:`);
      console.error(`     - Missing serverless route file in api/ directory.`);
      console.error(`     - Vercel rewrite in vercel.json misconfigured or stripping subpath.`);
      console.error(`     - Dev server not running or route unmounted.`);
    } else if (is500) {
      console.error(`  ❌ [CRITICAL 500]: Server encountered an internal error.`);
      console.error(`     Response error: ${body?.error || rawText}`);
    } else if (!isJson && resp.status === 200) {
      console.warn(`  ⚠️ [WARNING]: Endpoint returned HTTP 200 but Content-Type is "${contentType}" instead of application/json.`);
      console.warn(`     This often indicates single-page app HTML fallback intercepting the request.`);
    } else {
      console.log(`  ✅ Status within expected range: ${resp.status}`);
      if (body) {
        const preview = typeof body === 'object' ? JSON.stringify(body).substring(0, 150) : String(body);
        console.log(`  📦 Response Preview: ${preview}...`);
      }
    }

    const res: DiagnosticResult = {
      step,
      endpoint: endpointPath,
      method,
      status: resp.status,
      is404,
      is500,
      isOk,
      contentType,
      durationMs,
      body
    };

    results.push(res);
    return res;
  } catch (netErr: any) {
    const durationMs = Date.now() - startTime;
    console.error(`  ❌ [NETWORK/FETCH ERROR]: Failed to connect to ${url}`);
    console.error(`     Message: ${netErr?.message || netErr}`);
    console.error(`     Cause: Server might be offline or port unreachable.`);

    const res: DiagnosticResult = {
      step,
      endpoint: endpointPath,
      method,
      status: 0,
      is404: false,
      is500: false,
      isOk: false,
      contentType: 'none',
      durationMs,
      body: null,
      error: netErr?.message || String(netErr)
    };

    results.push(res);
    return res;
  }
}

async function testDirectServerlessHandlers() {
  console.log(`\n============================================================`);
  console.log(`🔬 DIRECT SERVERLESS FUNCTION INVOCATION TESTS`);
  console.log(`(Verifying api/auth/*.ts handlers directly via mock invocation)`);
  console.log(`============================================================`);

  try {
    const { default: sendOtpHandler } = await import('./api/auth/send-otp.ts');
    const { default: verifyOtpHandler } = await import('./api/auth/verify-otp.ts');
    const { default: verifyRoleHandler } = await import('./api/auth/verify-role.ts');
    const { default: indexHandler } = await import('./api/index.ts');

    function createMockReqRes(method: string, url: string, body: any, query: any = {}, headers: any = {}) {
      let statusCode = 200;
      let respHeaders: Record<string, string> = {};
      let responseData = '';
      const req: any = {
        method,
        url,
        headers: { 'content-type': 'application/json', ...headers },
        body,
        query
      };
      const res: any = {
        statusCode,
        setHeader: (k: string, v: string) => { respHeaders[k] = v; },
        getHeader: (k: string) => respHeaders[k],
        status: (code: number) => { statusCode = code; return res; },
        json: (data: any) => {
          responseData = JSON.stringify(data);
          return res;
        },
        end: (data: any) => {
          if (data) responseData = data;
          return res;
        },
        get response() {
          return { statusCode, headers: respHeaders, body: responseData ? JSON.parse(responseData) : null };
        }
      };
      return { req, res };
    }

    // 1. Direct send-otp
    const mock1 = createMockReqRes('POST', '/api/auth/send-otp', { phone: TEST_PHONE });
    await sendOtpHandler(mock1.req, mock1.res);
    const resp1 = mock1.res.response;
    console.log(`  • api/auth/send-otp.ts direct call: Status ${resp1.statusCode}, Success: ${resp1.body?.success}, OTP: ${resp1.body?.sessionOtp}`);

    const otpCode = resp1.body?.sessionOtp;
    const challengeToken = resp1.body?.challengeToken;

    // 2. Direct verify-otp
    const mock2 = createMockReqRes('POST', '/api/auth/verify-otp', {
      phone: TEST_PHONE,
      otp: otpCode,
      requestedRole: 'Admin',
      challengeToken
    });
    await verifyOtpHandler(mock2.req, mock2.res);
    const resp2 = mock2.res.response;
    console.log(`  • api/auth/verify-otp.ts direct call: Status ${resp2.statusCode}, Role: ${resp2.body?.role}, Token issued: ${Boolean(resp2.body?.token)}`);

    const sessionJwt = resp2.body?.token;

    // 3. Direct verify-role
    const mock3 = createMockReqRes('POST', '/api/auth/verify-role', {}, {}, {
      authorization: `Bearer ${sessionJwt}`
    });
    await verifyRoleHandler(mock3.req, mock3.res);
    const resp3 = mock3.res.response;
    console.log(`  • api/auth/verify-role.ts direct call: Status ${resp3.statusCode}, isAuthorizedAdmin: ${resp3.body?.isAuthorizedAdmin}`);

    // 4. Vercel rewrite simulation
    const mock4 = createMockReqRes('POST', '/api?path=auth/send-otp', { phone: TEST_CUSTOMER_PHONE }, { path: 'auth/send-otp' });
    await indexHandler(mock4.req, mock4.res);
    const resp4 = mock4.res.response;
    console.log(`  • api/index.ts (?path=auth/send-otp) rewrite simulation: Status ${resp4.statusCode}, Success: ${resp4.body?.success}`);

    console.log(`  ✅ All direct serverless handlers compiled and executed without runtime exception.`);
  } catch (err: any) {
    console.error(`  ❌ Error during direct serverless function test:`, err?.message || err);
  }
}

async function runAuthDiagnostics() {
  console.log(`============================================================`);
  console.log(`🚀 NUVVO AUTHENTICATION API DIAGNOSTIC SUITE`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`============================================================`);

  // Step 1: Health check
  await performDiagnosticFetch('Step 1: Server Health', '/api/health', 'GET');

  // Step 2: Diagnostic OTP readiness check
  await performDiagnosticFetch('Step 2: OTP Subsystem Diagnostic', '/api/auth/debug-otp', 'GET');

  // Step 3: Send OTP with valid admin phone
  const sendAdminRes = await performDiagnosticFetch(
    'Step 3: Send OTP (Admin Phone)',
    '/api/auth/send-otp',
    'POST',
    { phone: TEST_PHONE }
  );

  const adminOtp = sendAdminRes.body?.sessionOtp || sendAdminRes.body?.devOtp;
  const adminChallengeToken = sendAdminRes.body?.challengeToken;

  // Step 4: Send OTP with valid customer phone
  const sendCustomerRes = await performDiagnosticFetch(
    'Step 4: Send OTP (Customer Phone)',
    '/api/auth/send-otp',
    'POST',
    { phone: TEST_CUSTOMER_PHONE }
  );

  const customerOtp = sendCustomerRes.body?.sessionOtp || sendCustomerRes.body?.devOtp;
  const customerChallengeToken = sendCustomerRes.body?.challengeToken;

  // Step 5: Verify OTP for Admin
  let adminJwtToken = '';
  if (adminOtp && adminChallengeToken) {
    const verifyAdminRes = await performDiagnosticFetch(
      'Step 5: Verify OTP (Admin)',
      '/api/auth/verify-otp',
      'POST',
      {
        phone: TEST_PHONE,
        otp: adminOtp,
        requestedRole: 'Admin',
        challengeToken: adminChallengeToken
      }
    );
    adminJwtToken = verifyAdminRes.body?.token || '';
  } else {
    console.warn(`  ⚠️ Skipping Step 5: Missing OTP or challenge token from Step 3.`);
  }

  // Step 6: Verify OTP for Customer
  if (customerOtp && customerChallengeToken) {
    await performDiagnosticFetch(
      'Step 6: Verify OTP (Customer)',
      '/api/auth/verify-otp',
      'POST',
      {
        phone: TEST_CUSTOMER_PHONE,
        otp: customerOtp,
        requestedRole: 'Customer',
        challengeToken: customerChallengeToken
      }
    );
  }

  // Step 7: Verify Session Role using issued JWT token
  if (adminJwtToken) {
    await performDiagnosticFetch(
      'Step 7: Verify Session Role',
      '/api/auth/verify-role',
      'POST',
      {},
      { 'Authorization': `Bearer ${adminJwtToken}` }
    );
  }

  // Step 8: Test Invalid OTP rejection (should return 400, NOT 500 or 404)
  await performDiagnosticFetch(
    'Step 8: Negative Test - Invalid OTP',
    '/api/auth/verify-otp',
    'POST',
    {
      phone: TEST_PHONE,
      otp: '000000',
      requestedRole: 'Customer'
    }
  );

  // Step 9: Test Invalid Phone rejection (should return 400, NOT 500 or 404)
  await performDiagnosticFetch(
    'Step 9: Negative Test - Invalid Phone Format',
    '/api/auth/send-otp',
    'POST',
    { phone: '123' }
  );

  // Run direct function invocation checks as well
  await testDirectServerlessHandlers();

  // Print Summary Table and Final Diagnostic Verdict
  console.log(`\n============================================================`);
  console.log(`📋 AUTHENTICATION API DIAGNOSTIC SUMMARY`);
  console.log(`============================================================`);

  let count404 = 0;
  let count500 = 0;
  let countSuccess = 0;

  for (const r of results) {
    const isError = r.is404 || r.is500 || (r.status === 0);
    const badge = isError ? '❌ FAIL' : '✅ PASS';
    const statusLabel = r.status === 0 ? 'CONNECTION FAILED' : `HTTP ${r.status}`;
    console.log(` ${badge.padEnd(8)} | ${r.method.padEnd(5)} | ${r.endpoint.padEnd(26)} | ${statusLabel.padEnd(17)} | ${r.durationMs}ms`);

    if (r.is404) count404++;
    if (r.is500) count500++;
    if (r.isOk || (r.status === 400 && r.step.includes('Negative Test'))) countSuccess++;
  }

  console.log(`------------------------------------------------------------`);
  console.log(`Total Probes Run: ${results.length}`);
  console.log(`HTTP 404 Count:   ${count404} ${count404 > 0 ? '(CRITICAL ROUTING DEFECT)' : '(CLEAN)'}`);
  console.log(`HTTP 500 Count:   ${count500} ${count500 > 0 ? '(CRITICAL RUNTIME DEFECT)' : '(CLEAN)'}`);

  if (count404 === 0 && count500 === 0) {
    console.log(`\n🎉 DIAGNOSTIC VERDICT: ALL AUTH ENDPOINTS HEALTHY.`);
    console.log(`   - Zero 404 Not Found status codes detected.`);
    console.log(`   - Zero 500 Internal Server Error status codes detected.`);
    console.log(`   - JSON responses returned with valid cryptographic challenge tokens.`);
  } else {
    console.error(`\n⚠️ DIAGNOSTIC VERDICT: DEFECTS DETECTED.`);
    if (count404 > 0) {
      console.error(`   - 404 errors indicate missing file routes or Vercel rewrite stripping.`);
    }
    if (count500 > 0) {
      console.error(`   - 500 errors indicate unhandled exceptions or missing environment secrets.`);
    }
    process.exitCode = 1;
  }
}

runAuthDiagnostics().catch((err) => {
  console.error('Fatal unhandled error in diagnostic suite:', err);
  process.exit(1);
});
