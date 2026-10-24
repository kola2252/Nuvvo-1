import app from "../server";

// Export the existing Express app for Vercel catch-all serverless routing
export default function handler(req: any, res: any) {
  // 1. Resolve true request URL when rewritten by Vercel
  const matchedPath = 
    req.headers?.['x-matched-path'] || 
    req.headers?.['x-vercel-matched-path'] || 
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-original-url'];

  if (typeof matchedPath === 'string' && matchedPath.startsWith('/api')) {
    req.url = matchedPath;
  } else if (req.query?.path) {
    const subPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
    req.url = `/api/${subPath}`;
  } else if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}

export { app };
