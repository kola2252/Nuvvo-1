import app from "./server.js";

/**
 * Resolves the true request URL for Express when running in Vercel serverless environment.
 * Handles query parameter forwarding (?path=...), Vercel route matches, and preserves subroutes.
 */
function resolveRequestPath(req: any): string {
  // 1. If Vercel catch-all or rewrite forwarded query.path (e.g. ?path=auth/send-otp or ?path=dishes)
  if (req.query?.path) {
    const sub = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path);
    if (sub && sub !== 'index' && !sub.includes('[...path]')) {
      return `/api/${sub.replace(/^\/+/, '')}`;
    }
  }

  // 1b. Fallback: Parse path query directly from req.url if runtime omitted req.query
  if (typeof req.url === 'string' && req.url.includes('path=')) {
    try {
      const qIndex = req.url.indexOf('?');
      if (qIndex !== -1) {
        const params = new URLSearchParams(req.url.substring(qIndex + 1));
        const p = params.get('path');
        if (p && p !== 'index' && !p.includes('[...path]')) {
          return `/api/${p.replace(/^\/+/, '')}`;
        }
      }
    } catch {}
  }

  // 2. If Vercel route matches header contains the captured wildcard (e.g. "1=auth%2Fsend-otp")
  if (typeof req.headers?.['x-now-route-matches'] === 'string') {
    const match = req.headers['x-now-route-matches'].match(/(?:^|&)1=([^&]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).replace(/^\/+/, '');
      if (decoded && decoded !== 'index' && !decoded.includes('[...path]')) {
        return `/api/${decoded}`;
      }
    }
  }

  // 3. If x-matched-path or related headers contain a specific sub-route beyond bare "/api"
  const rawHeader = 
    req.headers?.['x-original-url'] ||
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-matched-path'] || 
    req.headers?.['x-vercel-matched-path'];

  if (
    typeof rawHeader === 'string' &&
    rawHeader.startsWith('/api/') &&
    rawHeader !== '/api/' &&
    rawHeader !== '/api/index' &&
    !rawHeader.includes('[...path]')
  ) {
    return rawHeader;
  }

  // 4. Check existing req.url
  if (typeof req.url === 'string' && req.url) {
    const pathOnly = req.url.split('?')[0];
    if (pathOnly.startsWith('/api/') && pathOnly !== '/api/' && pathOnly !== '/api/index' && !pathOnly.includes('[...path]')) {
      return pathOnly;
    }
    if (pathOnly && pathOnly !== '/' && pathOnly !== '/api' && pathOnly !== '/index' && !pathOnly.includes('[...path]')) {
      return `/api/${pathOnly.replace(/^\/+/, '')}`;
    }
  }

  return '/api';
}

// Export the existing Express app for Vercel to treat as a serverless function entry point
export default function handler(req: any, res: any) {
  const resolvedPath = resolveRequestPath(req);
  
  // Re-attach query string if original URL had one
  const queryIndex = typeof req.url === 'string' ? req.url.indexOf('?') : -1;
  const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '';
  
  req.url = resolvedPath + queryString;

  return app(req, res);
}

export { app };
