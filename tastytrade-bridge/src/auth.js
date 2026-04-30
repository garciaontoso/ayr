// Bearer token auth: Worker manda `Authorization: Bearer <BRIDGE_TOKEN>`.
// El token se compara con `process.env.BRIDGE_TOKEN` (set en docker-compose).

const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

if (!BRIDGE_TOKEN) {
  console.error("FATAL: BRIDGE_TOKEN env not set");
  process.exit(1);
}

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || m[1] !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
