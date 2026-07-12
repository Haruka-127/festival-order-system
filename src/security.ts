import { config } from "./config";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isValidSameOriginRequest(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === config.publicOrigin;
  } catch {
    return false;
  }
}

export function isValidWebSocketOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === config.publicOrigin;
  } catch {
    return false;
  }
}

export function applySecurityHeaders(headers: Record<string, string | number>, _pathname: string, scriptNonce?: string): void {
  headers["X-Content-Type-Options"] = "nosniff";
  headers["X-Frame-Options"] = "DENY";
  headers["Referrer-Policy"] = "no-referrer";
  headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
  headers["Cross-Origin-Resource-Policy"] = "same-origin";
  headers["Cross-Origin-Opener-Policy"] = "same-origin";
  headers["Origin-Agent-Cluster"] = "?1";
  const scriptSource = scriptNonce ? `'nonce-${scriptNonce}'` : "'none'";
  const websocketOrigin = config.publicOrigin.replace(/^http/, "ws");
  headers["Content-Security-Policy"] = `default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src ${scriptSource}; connect-src 'self' ${websocketOrigin}`;

  headers["Cache-Control"] = "no-store";
  if (config.cookieOptions.secure) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
}

type Attempt = { failures: number[] };

export class LoginRateLimiter {
  private attempts = new Map<string, Attempt>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxKeys = 10_000,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const attempt = this.attempts.get(key);
    if (!attempt) return false;
    attempt.failures = attempt.failures.filter(time => now - time < this.windowMs);
    if (attempt.failures.length === 0) this.attempts.delete(key);
    return attempt.failures.length >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    if (!this.attempts.has(key) && this.attempts.size >= this.maxKeys) {
      const oldest = this.attempts.keys().next().value;
      if (oldest) this.attempts.delete(oldest);
    }
    const attempt = this.attempts.get(key) ?? { failures: [] };
    attempt.failures = attempt.failures.filter(time => now - time < this.windowMs);
    attempt.failures.push(now);
    this.attempts.delete(key);
    this.attempts.set(key, attempt);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}

export function isPositiveInteger(value: string, max = Number.MAX_SAFE_INTEGER): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= max;
}
