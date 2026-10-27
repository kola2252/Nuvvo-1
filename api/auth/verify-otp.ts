import app from "../../server.ts";

export default function handler(req: any, res: any) {
  req.url = "/api/auth/verify-otp";
  return app(req, res);
}

export { app };
