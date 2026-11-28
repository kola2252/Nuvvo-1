/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Serverless SSE handler for /api/catalog/stream.
 * Implements safe, bounded Server-Sent Events designed specifically for Vercel/AWS Lambda serverless lifecycle.
 */

export default function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  } catch {}

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  try {
    res.statusCode = 200;
    res.write(`: nuvvo-catalog-live-stream-ok\n\n`);
    res.write(`retry: 15000\n\n`);
    res.write(`event: ready\ndata: ${JSON.stringify({ status: "connected", timestamp: Date.now() })}\n\n`);
  } catch {
    return res.end();
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 3000);

  const autoClose = setTimeout(() => {
    clearInterval(heartbeat);
    try {
      res.write(`retry: 15000\n\n`);
      res.end();
    } catch {}
  }, 7500);

  if (req && typeof req.on === 'function') {
    req.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(autoClose);
    });
  }
}
