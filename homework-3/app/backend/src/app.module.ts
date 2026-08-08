import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { JwtConfigModule } from './common/auth/jwt-config.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { GoalsModule } from './modules/goals/goals.module';
import { ForecastModule } from './modules/forecast/forecast.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }]),
    PrismaModule,
    JwtConfigModule,
    AuditModule,
    AuthModule,
    ProfileModule,
    GoalsModule,
    ForecastModule,
    ScenariosModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
