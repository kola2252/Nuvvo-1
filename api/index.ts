import app from "../server.ts";

// Export the existing Express app for Vercel to treat as a serverless function entry point
export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api')) {
    const matchedPath = req.headers?.['x-matched-path'] || req.headers?.['x-vercel-matched-path'];
    if (typeof matchedPath === 'string' && matchedPath.startsWith('/api')) {
      req.url = matchedPath;
    } else {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
  }
  return app(req, res);
}
export { app };
