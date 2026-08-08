import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

/**
 * Single, globally-shared JWT configuration. Every feature module needs the
 * *same* configured JwtService (same secret) to both sign (AuthService) and
 * verify (JwtAuthGuard) tokens — importing a bare, unconfigured `JwtModule`
 * per feature module would instead give each module its own default-config
 * JwtService, causing signature-verification failures across modules.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-only-secret-change-me'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class JwtConfigModule {}
