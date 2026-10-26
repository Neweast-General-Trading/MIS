import { ForbiddenException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { normalizeEmail } from './access-user-email.util';

function isProductionAuthMode(): boolean {
  if (process.env.REQUIRE_JWT_AUTH === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

function allowLegacyEmailHeader(): boolean {
  if (isProductionAuthMode()) return false;
  return process.env.ALLOW_X_USER_EMAIL === 'true';
}

/**
 * Resolve the authenticated user email for BPM API requests.
 * Production requires a valid Bearer JWT; legacy x-user-email is dev-only.
 */
export function resolveRequestUserEmail(
  req: Pick<Request, 'headers'>,
  jwtService: JwtService,
  options?: { accessTokenFromQuery?: string },
): string {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  let authHeader =
    (typeof headers.authorization === 'string'
      ? headers.authorization
      : undefined) ??
    (typeof headers.Authorization === 'string'
      ? headers.Authorization
      : undefined);

  const queryToken = options?.accessTokenFromQuery?.trim();
  if (!authHeader?.startsWith('Bearer ') && queryToken) {
    authHeader = `Bearer ${queryToken}`;
  }

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwtService.verify<{ email?: string }>(
        authHeader.slice(7).trim(),
      );
      const email = normalizeEmail(payload?.email);
      if (email) return email;
    } catch {
      throw new ForbiddenException('Invalid or expired session.');
    }
  }

  if (allowLegacyEmailHeader()) {
    const raw = headers['x-user-email'];
    const legacyEmail =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (legacyEmail?.trim()) {
      return normalizeEmail(legacyEmail);
    }
  }

  throw new ForbiddenException('Missing authentication (sign in required).');
}
