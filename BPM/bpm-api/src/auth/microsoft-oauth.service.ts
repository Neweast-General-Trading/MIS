import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

interface PendingLogin {
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

@Injectable()
export class MicrosoftOAuthService {
  private readonly pendingLogins = new Map<string, PendingLogin>();

  private get tenantId() {
    return process.env.AZURE_TENANT_ID?.trim() || '49398592-1c41-4c6f-b59c-7efea4675def';
  }

  private get clientId() {
    return process.env.AZURE_CLIENT_ID?.trim() || '1b7c74bc-8564-4585-8f4c-40b51f2d6d60';
  }

  private get clientSecret() {
    return process.env.AZURE_CLIENT_SECRET?.trim() || '';
  }

  private get redirectUri() {
    return (
      process.env.AZURE_REDIRECT_URI?.trim() ||
      'https://bpm.neweast.cloud/auth/microsoft/callback'
    ).replace(/\/$/, '');
  }

  private get scopes() {
    return (process.env.AZURE_SCOPES || 'openid profile email User.Read')
      .split(/\s+/)
      .filter(Boolean);
  }

  private base64UrlEncode(buffer: Buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private createPkcePair() {
    const verifier = this.base64UrlEncode(randomBytes(32));
    const challenge = this.base64UrlEncode(createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [key, value] of this.pendingLogins.entries()) {
      if (value.expiresAt <= now) this.pendingLogins.delete(key);
    }
  }

  sanitizeReturnTo(returnTo?: string) {
    const fallback =
      process.env.CLIENT_URL?.trim() || 'https://bpm.neweast.cloud/sign-in';
    if (!returnTo?.trim()) {
      return fallback;
    }
    try {
      const url = new URL(returnTo);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return fallback;
      }
      const allowedHost = new URL(fallback).hostname;
      if (url.hostname !== allowedHost && !url.hostname.endsWith('.neweast.cloud')) {
        return fallback;
      }
      return url.toString();
    } catch {
      return fallback;
    }
  }

  private storeMicrosoftLogin(returnTo: string) {
    this.cleanupExpired();
    const state = this.base64UrlEncode(randomBytes(24));
    const { verifier, challenge } = this.createPkcePair();
    this.pendingLogins.set(state, {
      verifier,
      returnTo: this.sanitizeReturnTo(returnTo),
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return { state, challenge };
  }

  private consumeMicrosoftLogin(state: string) {
    this.cleanupExpired();
    const entry = this.pendingLogins.get(state);
    if (!entry) return null;
    this.pendingLogins.delete(state);
    return entry;
  }

  buildMicrosoftLoginUrl(returnTo?: string) {
    const { state, challenge } = this.storeMicrosoftLogin(returnTo ?? '');
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: this.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  buildLoginErrorRedirect(message: string, returnTo?: string) {
    const url = new URL(this.sanitizeReturnTo(returnTo));
    url.searchParams.set('loginError', String(message || 'Login failed').slice(0, 240));
    return url.toString();
  }

  async completeMicrosoftLogin(code: string, state: string) {
    const pending = this.consumeMicrosoftLogin(state);
    if (!pending) {
      throw new Error('Login session expired — please try again.');
    }

    const accessToken = await this.exchangeCodeForToken(code, pending.verifier);
    const profile = await this.fetchMicrosoftProfile(accessToken);
    return { profile, returnTo: pending.returnTo };
  }

  private async exchangeCodeForToken(code: string, verifier: string) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
      scope: this.scopes.join(' '),
    });

    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Microsoft token exchange failed');
    }

    return data.access_token;
  }

  private async fetchMicrosoftProfile(accessToken: string) {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Invalid Microsoft access token');
    }

    const account = (await response.json()) as {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };

    const email = (account.mail || account.userPrincipalName || '').trim().toLowerCase();
    if (!email) {
      throw new Error('Microsoft account email is missing');
    }

    return {
      email,
      displayName: account.displayName?.trim() || email,
    };
  }
}
