/**
 * Unified Server Application Loader for Vercel Serverless Functions.
 * 
 * Safely resolves and loads the Express application from the pre-bundled artifact
 * by traversing the Vercel serverless function directory hierarchy at runtime.
 * Guarantees module resolution across all Vercel deployment modes (/var/task, /var/task/api,
 * nested output directories, or local development).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Get directory of this module safely in ESM
const currentDir = (() => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  return process.cwd();
})();

/**
 * Ordered list of candidate relative paths to locate the pre-bundled server artifact.
 * Correctly traverses Vercel's Lambda runtime (/var/task) regardless of whether
 * the function is executed from /var/task, /var/task/api, or nested build outputs.
 */
export function resolveServerPath(): string {
  const candidates: string[] = [
    // 1. Same directory (e.g. /var/task/api/server.js when running in api/)
    path.resolve(currentDir, "server.js"),
    // 2. Parent directory (e.g. /var/task/server.js when running in api/)
    path.resolve(currentDir, "..", "server.js"),
    // 3. Subdirectory 'api' from current directory (when running from /var/task root)
    path.resolve(currentDir, "api", "server.js"),
    // 4. Two levels up (nested Vercel output structure .vercel/output/functions/api/...)
    path.resolve(currentDir, "..", "..", "server.js"),
    // 5. CWD-relative paths (/var/task/api/server.js or /var/task/server.js)
    path.resolve(process.cwd(), "api", "server.js"),
    path.resolve(process.cwd(), "server.js"),
    // 6. CJS bundle fallbacks in dist/
    path.resolve(currentDir, "dist", "server.cjs"),
    path.resolve(currentDir, "..", "dist", "server.cjs"),
    path.resolve(process.cwd(), "dist", "server.cjs"),
    // 7. Source fallback if running in tsx development mode
    path.resolve(currentDir, "..", "server.ts"),
    path.resolve(process.cwd(), "server.ts")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to relative ./server.js if none exist yet on disk
  return path.resolve(currentDir, "server.js");
}

let cachedApp: any = null;
let loadPromise: Promise<any> | null = null;

export async function getOrLoadApp(): Promise<any> {
  if (cachedApp) return cachedApp;
  if (!loadPromise) {
    loadPromise = (async () => {
      const serverPath = resolveServerPath();
      const fileUrl = pathToFileURL(serverPath).href;
      try {
        const mod = await import(fileUrl);
        const resolved = mod.default || mod.app || mod;
        cachedApp = resolved;
        return resolved;
      } catch (err: any) {
        console.error(`[server-app] Failed to dynamically load server module from "${serverPath}":`, err?.message || err);
        throw err;
      }
    })();
  }
  return loadPromise;
}

// Eager non-blocking initialization on container start
try {
  const initialPath = resolveServerPath();
  if (fs.existsSync(initialPath)) {
    const fileUrl = pathToFileURL(initialPath).href;
    import(fileUrl)
      .then((mod) => {
        cachedApp = mod.default || mod.app || mod;
      })
      .catch((err) => {
        console.warn("[server-app] Non-fatal boot import warning (will retry on request):", err?.message || err);
      });
  }
} catch {}

/**
 * Universal Express App proxy dispatcher for Vercel Serverless Functions.
 * Traverses file hierarchy at runtime and proxies requests to the true Express instance.
 */
export async function app(req: any, res: any, next?: any): Promise<any> {
  const expressApp = await getOrLoadApp();
  return expressApp(req, res, next);
}

// Proxied callable application object supporting both function calls and Express property accesses
const appProxy = new Proxy(app, {
  get(target, prop, receiver) {
    if (prop === 'then' || prop === 'catch' || prop === 'finally') {
      return undefined;
    }
    if (cachedApp && prop in cachedApp) {
      const val = (cachedApp as any)[prop];
      return typeof val === 'function' ? val.bind(cachedApp) : val;
    }
    return Reflect.get(target, prop, receiver);
  }
});

export default appProxy;
export { appProxy as defaultApp };
