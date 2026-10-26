import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessUserEntity } from 'src/access-control/entities/user.entity';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessUserEntity]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'bpm-dev-jwt-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MicrosoftOAuthService],
  exports: [AuthService],
})
export class AuthModule {}
