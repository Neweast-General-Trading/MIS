import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftOAuthService } from './microsoft-oauth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly microsoftOAuthService: MicrosoftOAuthService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('microsoft/login')
  microsoftLogin(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    res.redirect(this.microsoftOAuthService.buildMicrosoftLoginUrl(returnTo));
  }

  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('returnTo') returnTo: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      res.redirect(
        this.microsoftOAuthService.buildLoginErrorRedirect(
          errorDescription || error,
          returnTo,
        ),
      );
      return;
    }

    if (!code || !state) {
      res.redirect(
        this.microsoftOAuthService.buildLoginErrorRedirect(
          'Missing Microsoft login code',
          returnTo,
        ),
      );
      return;
    }

    try {
      const { profile, returnTo: safeReturnTo } =
        await this.microsoftOAuthService.completeMicrosoftLogin(code, state);
      const loginResult = await this.authService.loginWithMicrosoftEmail(profile.email);
      const redirectUrl = new URL(this.microsoftOAuthService.sanitizeReturnTo(safeReturnTo));
      redirectUrl.hash = [
        `accessToken=${encodeURIComponent(loginResult.accessToken)}`,
        `email=${encodeURIComponent(loginResult.user.email)}`,
        `displayName=${encodeURIComponent(loginResult.user.displayName)}`,
      ].join('&');
      res.redirect(redirectUrl.toString());
    } catch (err) {
      const message =
        err instanceof UnauthorizedException
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Microsoft login failed';
      res.redirect(this.microsoftOAuthService.buildLoginErrorRedirect(message, returnTo));
    }
  }

  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }
    const token = authHeader.slice(7).trim();
    let email: string | undefined;
    try {
      const payload = await this.jwtService.verifyAsync<{ email?: string }>(token);
      email = payload?.email;
    } catch {
      throw new UnauthorizedException('Invalid or expired session.');
    }
    if (!email) {
      throw new UnauthorizedException('Token did not contain a user email.');
    }
    return this.authService.profileByEmail(email);
  }
}
