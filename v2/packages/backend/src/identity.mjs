import { betterAuth } from 'better-auth';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { getMigrations } from 'better-auth/db/migration';
import { randomUUID } from 'node:crypto';
import { withImmediateTransaction } from './db.mjs';
import { SofrehGuardError } from './privacy.mjs';
import { normalizeLocale } from '../../shared/src/i18n.mjs';

// Authentication and password/session cryptography belong to Better Auth.
// Application roles are assigned once, separately from editable auth profiles.
export async function createIdentityProvider({ db, baseURL, secret }) {
  const origin = new URL(baseURL).origin;
  if (!secret || secret.length < 32) throw new Error('An authentication secret of at least 32 characters is required.');
  const options = {
    database: db,
    baseURL: origin,
    secret,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30, customRules: { '/sign-up/email': { window: 60, max: 6 } } },
    trustedOrigins: [origin],
    advanced: { cookiePrefix: 'sofreh', ipAddress: { ipAddressHeaders: ['x-sofreh-client-ip'] } },
    telemetry: { enabled: false }
  };
  const migration = await getMigrations(options);
  await migration.runMigrations();
  const auth = betterAuth(options);
  await auth.$context;

  async function sessionFor(req) {
    return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  }
  function accountFor(identity) {
    if (!identity) return null;
    const row = db.prepare('SELECT id, role, display_name, preferred_locale FROM users WHERE id = ?').get(identity.user.id);
    return row ? { id: row.id, role: row.role, displayName: row.display_name, preferredLocale: row.preferred_locale } : null;
  }
  return {
    origin,
    async handle(req, res) {
      // Never trust an internet-supplied forwarding header. A deployment behind
      // a proxy needs an explicitly reviewed trusted-proxy configuration.
      req.headers['x-sofreh-client-ip'] = req.socket.remoteAddress;
      return toNodeHandler(auth)(req, res);
    },
    async userFor(req) { return accountFor(await sessionFor(req)); },
    async profile(req) {
      const identity = await sessionFor(req);
      if (!identity) throw new SofrehGuardError('UNAUTHENTICATED', 'Please sign in.', 401);
      const account = accountFor(identity);
      const kitchen = account?.role === 'COOK' ? db.prepare('SELECT id FROM cook_profiles WHERE user_id = ?').get(account.id) : null;
      return { name: identity.user.name, email: identity.user.email, account, kitchenId: kitchen?.id ?? null };
    },
    async setup(req, input) {
      const identity = await sessionFor(req);
      if (!identity) throw new SofrehGuardError('UNAUTHENTICATED', 'Please sign in.', 401);
      if (!['CUSTOMER', 'COOK'].includes(input.role)) throw new SofrehGuardError('INVALID_ROLE', 'Choose customer or cook.', 400);
      withImmediateTransaction(db, () => {
        const existing = accountFor(identity);
        if (existing && existing.role !== input.role) throw new SofrehGuardError('ROLE_ALREADY_SET', 'The account role is already set.', 409);
        if (!existing) db.prepare(`INSERT INTO users (id, role, display_name, phone_private, email_private, preferred_locale, auth_token, created_at_iso)
          VALUES (?, ?, ?, '', ?, ?, ?, ?)`).run(identity.user.id, input.role, identity.user.name, identity.user.email,
          normalizeLocale(input.locale), `disabled-${randomUUID()}`, new Date().toISOString());
      });
      return this.profile(req);
    }
  };
}
