import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { RequestHandler } from 'express';

export interface SecurityOptions {
  operatorToken?: string;
  publicOrigin?: string;
  production?: boolean;
  actionLimit?: number;
}

const cookieName = 'flowstead_session';
const sessionDuration = 8 * 60 * 60 * 1000;

function constantTimeEqual(left: string, right: string) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

export class Security {
  private readonly sessions = new Map<string, number>();
  private readonly limits = new Map<string, { start: number; count: number }>();
  constructor(readonly options: SecurityOptions) {}

  validOrigin = (req: IncomingMessage) => {
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site') return false;
    if (!origin) return true; // API clients don't necessarily send Origin; auth still applies.
    try {
      const parsed = new URL(origin);
      return ['http:', 'https:'].includes(parsed.protocol)
        && (origin === this.options.publicOrigin || parsed.host === req.headers.host);
    } catch { return false; }
  };

  authenticated = (req: IncomingMessage) => {
    if (!this.options.operatorToken) return true;
    const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim())
      .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!cookie) return false;
    const expires = this.sessions.get(cookie);
    if (!expires || expires <= Date.now()) { this.sessions.delete(cookie); return false; }
    return true;
  };

  authenticate: RequestHandler = (req, res, next) => {
    if (!this.authenticated(req)) { res.status(401).json({ ok: false, message: 'Operator authentication required.' }); return; }
    next();
  };

  checkOrigin: RequestHandler = (req, res, next) => {
    if (!this.validOrigin(req)) { res.status(403).json({ ok: false, message: 'Cross-origin requests are not permitted.' }); return; }
    next();
  };

  rateLimit: RequestHandler = (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of this.limits) if (now - entry.start > 60_000) this.limits.delete(key);
    const key = req.socket.remoteAddress ?? 'unknown';
    const entry = this.limits.get(key) ?? { start: now, count: 0 };
    entry.count++;
    this.limits.set(key, entry);
    if (entry.count > (this.options.actionLimit ?? 60)) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ ok: false, message: 'Too many actions. Try again in one minute.' }); return;
    }
    next();
  };

  login: RequestHandler = (req, res) => {
    const token: unknown = req.body?.token;
    if (!this.options.operatorToken) { res.json({ ok: true, message: 'Authentication is not configured in this demo.' }); return; }
    if (typeof token !== 'string' || token.length > 4096 || !constantTimeEqual(token, this.options.operatorToken)) {
      res.status(401).json({ ok: false, message: 'Invalid operator token.' }); return;
    }
    const now = Date.now();
    for (const [session, expiry] of this.sessions) if (expiry <= now) this.sessions.delete(session);
    // Bound sessions even when valid credentials are repeatedly presented.
    if (this.sessions.size >= 1000) this.sessions.delete(this.sessions.keys().next().value!);
    const session = randomBytes(32).toString('hex');
    this.sessions.set(session, now + sessionDuration);
    res.cookie(cookieName, session, { httpOnly: true, sameSite: 'strict', secure: !!this.options.production, maxAge: sessionDuration, path: '/' });
    res.json({ ok: true, message: 'Operator authenticated.' });
  };

  logout: RequestHandler = (req, res) => {
    const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim())
      .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (cookie) this.sessions.delete(cookie);
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: !!this.options.production, path: '/' });
    res.json({ ok: true, message: 'Signed out.' });
  };

  clear() { this.sessions.clear(); this.limits.clear(); }
}
