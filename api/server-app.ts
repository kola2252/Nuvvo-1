/**
 * Unified Server Application Loader for Vercel Serverless Functions.
 * Safely resolves the Express application from the local pre-bundled ESM artifact (api/server.js or root server.js).
 */
import app from "./server.js";

export default app;
export { app };
