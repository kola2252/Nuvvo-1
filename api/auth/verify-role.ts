import app from "../server-app.ts";

export default function handler(req: any, res: any) {
  req.url = "/api/auth/verify-role";
  return app(req, res);
}

export { app };
