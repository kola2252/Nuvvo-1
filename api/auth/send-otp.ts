import app from "../server-app.ts";

export default function handler(req: any, res: any) {
  // Ensure the URL matches the Express route expectation regardless of how Vercel invokes it
  req.url = "/api/auth/send-otp";
  return app(req, res);
}

export { app };
