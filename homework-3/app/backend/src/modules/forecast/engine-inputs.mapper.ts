/**
 * Maps persisted profile/goal rows into the engine's pure input shape.
 * Lives outside `forecast/engine/` (it imports Prisma), consistent with the
 * engine's "no I/O, no dependencies" rule — this is the one allowed seam.
 */
import type { PrismaService } from '../../prisma/prisma.service';
import {
  centsFromBigInt,
  monthsBetween,
  type EngineAssumptions,
  type EngineInputs,
  type GoalPlanInput,
} from './engine';

export async function buildEngineInputs(
  prisma: PrismaService,
  userId: string,
  evaluationMonth: string,
  horizonMonths: number,
): Promise<EngineInputs> {
  const [profile, incomes, expenses, assets, liabilities, goals] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { userId } }),
    prisma.incomeSource.findMany({ where: { userId, archivedAt: null } }),
    prisma.expense.findMany({ where: { userId, archivedAt: null } }),
    prisma.asset.findMany({ where: { userId, archivedAt: null } }),
    prisma.liability.findMany({ where: { userId, archivedAt: null } }),
    prisma.goal.findMany({
      where: { userId, status: { not: 'archived' } },
      include: { contribution: true },
    }),
  ]);

  const assumptions: EngineAssumptions = {
    inflationRateBps: profile.inflationRateBps,
    defaultReturnRateBps: profile.defaultReturnRateBps,
    incomeGrowthRateBps: profile.incomeGrowthRateBps,
  };

  const goalPlans: GoalPlanInput[] = goals.map((goal) => {
    const contribution = goal.contribution;
    return {
      id: goal.id,
      targetAmountMinor: centsFromBigInt(goal.targetAmountMinor),
      targetMonth: goal.targetMonth,
      priority: goal.priority,
      status: goal.status === 'paused' ? 'paused' : 'active',
      contribution: contribution
        ? {
            kind: contribution.kind as 'one_time' | 'recurring_monthly',
            amountMinor: centsFromBigInt(contribution.amountMinor),
            startMonthIndex: Math.max(0, monthsBetween(evaluationMonth, contribution.startMonth)),
            endMonthIndex: contribution.endMonth
              ? monthsBetween(evaluationMonth, contribution.endMonth)
              : null,
          }
        : null,
    };
  });

  return {
    evaluationMonth,
    horizonMonths,
    incomes: incomes.map((i) => ({
      id: i.id,
      kind: i.kind as 'active' | 'passive',
      amountMinor: centsFromBigInt(i.amountMinor),
      annualGrowthRateBps: i.annualGrowthRateBps,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      kind: e.kind as 'fixed' | 'variable',
      amountMinor: centsFromBigInt(e.amountMinor),
    })),
    assets: assets.map((a) => ({
      id: a.id,
      kind: a.kind as 'cash' | 'investment' | 'real_estate',
      valueMinor: centsFromBigInt(a.valueMinor),
      annualReturnRateBps: a.annualReturnRateBps,
    })),
    liabilities: liabilities.map((l) => ({
      id: l.id,
      kind: l.kind as 'loan' | 'mortgage' | 'credit_card',
      balanceMinor: centsFromBigInt(l.balanceMinor),
      annualInterestRateBps: l.annualInterestRateBps,
      monthlyPaymentMinor: centsFromBigInt(l.monthlyPaymentMinor),
    })),
    goals: goalPlans,
    assumptions,
  };
}
