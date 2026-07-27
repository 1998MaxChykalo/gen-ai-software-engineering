/**
 * Seeds the demo persona described in the task brief:
 * demo@horizon.app / HorizonDemo1! — a median-family profile with three
 * goals — then triggers the initial forecast snapshot.
 *
 * Run via `npm run seed` (see package.json).
 */
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ForecastService } from '../src/modules/forecast/forecast.service';
import { uuid7 } from '../src/common/ids/uuid7';

const DEMO_EMAIL = 'demo@horizon.app';
const DEMO_PASSWORD = 'HorizonDemo1!';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const forecastService = app.get(ForecastService);

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Demo user already exists (${DEMO_EMAIL}); re-running forecast only.`);
    await forecastService.runForecast(existing.id);
    await app.close();
    return;
  }

  const userId = uuid7();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id: userId, email: DEMO_EMAIL, passwordHash, role: 'user' } });
    await tx.profile.create({
      data: {
        id: uuid7(),
        userId,
        inflationRateBps: 200,
        defaultReturnRateBps: 500,
        incomeGrowthRateBps: 250,
      },
    });

    await tx.incomeSource.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Salary (net)',
        kind: 'active',
        amountMinor: 380000n,
        annualGrowthRateBps: 250,
      },
    });
    await tx.incomeSource.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Rental income',
        kind: 'passive',
        amountMinor: 0n,
        annualGrowthRateBps: 0,
      },
    });

    await tx.expense.create({
      data: { id: uuid7(), userId, name: 'Fixed monthly expenses', kind: 'fixed', amountMinor: 230000n },
    });
    await tx.expense.create({
      data: { id: uuid7(), userId, name: 'Variable spending', kind: 'variable', amountMinor: 60000n },
    });

    await tx.asset.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Cash savings',
        kind: 'cash',
        valueMinor: 1500000n,
        annualReturnRateBps: 0,
      },
    });
    await tx.asset.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Investment portfolio',
        kind: 'investment',
        valueMinor: 2200000n,
        annualReturnRateBps: 500,
      },
    });

    await tx.liability.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Car loan',
        kind: 'loan',
        balanceMinor: 900000n,
        annualInterestRateBps: 650,
        monthlyPaymentMinor: 28000n,
      },
    });

    const emergencyFundId = uuid7();
    await tx.goal.create({
      data: {
        id: emergencyFundId,
        userId,
        name: 'Emergency fund',
        type: 'emergency_fund',
        targetAmountMinor: 1000000n,
        priority: 1,
        status: 'active',
      },
    });
    await tx.goalContribution.create({
      data: {
        id: uuid7(),
        goalId: emergencyFundId,
        kind: 'recurring_monthly',
        amountMinor: 30000n,
        startMonth: currentMonth(),
      },
    });

    const houseGoalId = uuid7();
    await tx.goal.create({
      data: {
        id: houseGoalId,
        userId,
        name: 'House down payment',
        type: 'house',
        targetAmountMinor: 6000000n,
        priority: 2,
        status: 'active',
      },
    });
    await tx.goalContribution.create({
      data: {
        id: uuid7(),
        goalId: houseGoalId,
        kind: 'recurring_monthly',
        amountMinor: 70000n,
        startMonth: currentMonth(),
      },
    });

    await tx.goal.create({
      data: {
        id: uuid7(),
        userId,
        name: 'Vacation',
        type: 'vacation',
        targetAmountMinor: 300000n,
        targetMonth: nextSummerMonth(),
        priority: 3,
        status: 'active',
      },
    });
  });

  await forecastService.runForecast(userId);

  // eslint-disable-next-line no-console
  console.log(`Seeded demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD} and computed the initial forecast snapshot.`);
  await app.close();
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextSummerMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const july = new Date(Date.UTC(year, 6, 1));
  const target = july.getTime() > now.getTime() ? july : new Date(Date.UTC(year + 1, 6, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
