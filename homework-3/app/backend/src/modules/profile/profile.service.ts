import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { uuid7 } from '../../common/ids/uuid7';
import { DomainErrors } from '../../common/errors/domain-error';
import { bpsToPctString, pctStringToBps } from '../../common/util/rate';
import { AuditService, type TransactionClient } from '../audit/audit.service';
import { OutboxService } from '../forecast/outbox/outbox.service';
import { ForecastDispatcherService } from '../forecast/dispatcher/forecast-dispatcher.service';
import type { ProfileUpsertDto } from './dto/profile.dto';

const SUPPORTED_CURRENCY = 'EUR';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly dispatcher: ForecastDispatcherService,
  ) {}

  async getProfile(userId: string) {
    const [profile, incomes, expenses, assets, liabilities] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId } }),
      this.prisma.incomeSource.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.asset.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.liability.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return this.toResponse(profile, incomes, expenses, assets, liabilities);
  }

  async replaceProfile(userId: string, dto: ProfileUpsertDto) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    if (dto.version !== profile.version) {
      throw DomainErrors.profileVersionConflict();
    }

    for (const item of [...dto.incomes, ...dto.expenses, ...dto.assets, ...dto.liabilities]) {
      if (item.currency !== SUPPORTED_CURRENCY) {
        throw DomainErrors.currencyNotSupported(item.currency);
      }
    }

    const [existingIncomes, existingExpenses, existingAssets, existingLiabilities] =
      await Promise.all([
        this.prisma.incomeSource.findMany({ where: { userId, archivedAt: null } }),
        this.prisma.expense.findMany({ where: { userId, archivedAt: null } }),
        this.prisma.asset.findMany({ where: { userId, archivedAt: null } }),
        this.prisma.liability.findMany({ where: { userId, archivedAt: null } }),
      ]);

    await this.prisma.$transaction(async (tx) => {
      await this.syncIncomes(tx, userId, dto, existingIncomes);
      await this.syncExpenses(tx, userId, dto, existingExpenses);
      await this.syncAssets(tx, userId, dto, existingAssets);
      await this.syncLiabilities(tx, userId, dto, existingLiabilities);

      await tx.profile.update({
        where: { userId },
        data: {
          version: { increment: 1 },
          inflationRateBps: pctStringToBps(dto.assumptions.inflationRatePct),
          defaultReturnRateBps: pctStringToBps(dto.assumptions.defaultReturnRatePct),
          incomeGrowthRateBps: pctStringToBps(dto.assumptions.incomeGrowthRatePct),
        },
      });

      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Profile',
        entityId: profile.id,
        action: 'PROFILE_UPDATED',
        before: { version: profile.version },
        after: { version: profile.version + 1 },
      });

      await this.outboxService.writeEvent(tx, {
        userId,
        aggregateType: 'Profile',
        aggregateId: profile.id,
        eventType: 'PROFILE_CHANGED',
      });
    });

    await this.dispatcher.processForUser(userId);

    return this.getProfile(userId);
  }

  private async syncIncomes(
    tx: TransactionClient,
    userId: string,
    dto: ProfileUpsertDto,
    existing: { id: string }[],
  ): Promise<void> {
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = new Set<string>();

    for (const item of dto.incomes) {
      if (item.id && existingIds.has(item.id)) {
        keptIds.add(item.id);
        await tx.incomeSource.update({
          where: { id: item.id },
          data: {
            name: item.name,
            kind: item.kind,
            amountMinor: BigInt(item.amountMinor),
            currency: item.currency,
            annualGrowthRateBps: pctStringToBps(item.annualGrowthRatePct),
          },
        });
      } else {
        const id = uuid7();
        keptIds.add(id);
        await tx.incomeSource.create({
          data: {
            id,
            userId,
            name: item.name,
            kind: item.kind,
            amountMinor: BigInt(item.amountMinor),
            currency: item.currency,
            annualGrowthRateBps: pctStringToBps(item.annualGrowthRatePct),
          },
        });
      }
    }

    const toArchive = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
    if (toArchive.length > 0) {
      await tx.incomeSource.updateMany({
        where: { id: { in: toArchive } },
        data: { archivedAt: new Date() },
      });
    }
  }

  private async syncExpenses(
    tx: TransactionClient,
    userId: string,
    dto: ProfileUpsertDto,
    existing: { id: string }[],
  ): Promise<void> {
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = new Set<string>();

    for (const item of dto.expenses) {
      if (item.id && existingIds.has(item.id)) {
        keptIds.add(item.id);
        await tx.expense.update({
          where: { id: item.id },
          data: {
            name: item.name,
            kind: item.kind,
            amountMinor: BigInt(item.amountMinor),
            currency: item.currency,
          },
        });
      } else {
        const id = uuid7();
        keptIds.add(id);
        await tx.expense.create({
          data: {
            id,
            userId,
            name: item.name,
            kind: item.kind,
            amountMinor: BigInt(item.amountMinor),
            currency: item.currency,
          },
        });
      }
    }

    const toArchive = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
    if (toArchive.length > 0) {
      await tx.expense.updateMany({
        where: { id: { in: toArchive } },
        data: { archivedAt: new Date() },
      });
    }
  }

  private async syncAssets(
    tx: TransactionClient,
    userId: string,
    dto: ProfileUpsertDto,
    existing: { id: string }[],
  ): Promise<void> {
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = new Set<string>();

    for (const item of dto.assets) {
      if (item.id && existingIds.has(item.id)) {
        keptIds.add(item.id);
        await tx.asset.update({
          where: { id: item.id },
          data: {
            name: item.name,
            kind: item.kind,
            valueMinor: BigInt(item.valueMinor),
            currency: item.currency,
            annualReturnRateBps: pctStringToBps(item.annualReturnRatePct),
          },
        });
      } else {
        const id = uuid7();
        keptIds.add(id);
        await tx.asset.create({
          data: {
            id,
            userId,
            name: item.name,
            kind: item.kind,
            valueMinor: BigInt(item.valueMinor),
            currency: item.currency,
            annualReturnRateBps: pctStringToBps(item.annualReturnRatePct),
          },
        });
      }
    }

    const toArchive = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
    if (toArchive.length > 0) {
      await tx.asset.updateMany({
        where: { id: { in: toArchive } },
        data: { archivedAt: new Date() },
      });
    }
  }

  private async syncLiabilities(
    tx: TransactionClient,
    userId: string,
    dto: ProfileUpsertDto,
    existing: { id: string }[],
  ): Promise<void> {
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = new Set<string>();

    for (const item of dto.liabilities) {
      if (item.id && existingIds.has(item.id)) {
        keptIds.add(item.id);
        await tx.liability.update({
          where: { id: item.id },
          data: {
            name: item.name,
            kind: item.kind,
            balanceMinor: BigInt(item.balanceMinor),
            currency: item.currency,
            annualInterestRateBps: pctStringToBps(item.annualInterestRatePct),
            monthlyPaymentMinor: BigInt(item.monthlyPaymentMinor),
          },
        });
      } else {
        const id = uuid7();
        keptIds.add(id);
        await tx.liability.create({
          data: {
            id,
            userId,
            name: item.name,
            kind: item.kind,
            balanceMinor: BigInt(item.balanceMinor),
            currency: item.currency,
            annualInterestRateBps: pctStringToBps(item.annualInterestRatePct),
            monthlyPaymentMinor: BigInt(item.monthlyPaymentMinor),
          },
        });
      }
    }

    const toArchive = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
    if (toArchive.length > 0) {
      await tx.liability.updateMany({
        where: { id: { in: toArchive } },
        data: { archivedAt: new Date() },
      });
    }
  }

  private toResponse(
    profile: {
      version: number;
      inflationRateBps: number;
      defaultReturnRateBps: number;
      incomeGrowthRateBps: number;
    },
    incomes: {
      id: string;
      name: string;
      kind: string;
      amountMinor: bigint;
      currency: string;
      annualGrowthRateBps: number;
    }[],
    expenses: { id: string; name: string; kind: string; amountMinor: bigint; currency: string }[],
    assets: {
      id: string;
      name: string;
      kind: string;
      valueMinor: bigint;
      currency: string;
      annualReturnRateBps: number;
    }[],
    liabilities: {
      id: string;
      name: string;
      kind: string;
      balanceMinor: bigint;
      currency: string;
      annualInterestRateBps: number;
      monthlyPaymentMinor: bigint;
    }[],
  ) {
    return {
      version: profile.version,
      incomes: incomes.map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
        amountMinor: Number(i.amountMinor),
        currency: i.currency,
        annualGrowthRatePct: bpsToPctString(i.annualGrowthRateBps),
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        amountMinor: Number(e.amountMinor),
        currency: e.currency,
      })),
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        valueMinor: Number(a.valueMinor),
        currency: a.currency,
        annualReturnRatePct: bpsToPctString(a.annualReturnRateBps),
      })),
      liabilities: liabilities.map((l) => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        balanceMinor: Number(l.balanceMinor),
        currency: l.currency,
        annualInterestRatePct: bpsToPctString(l.annualInterestRateBps),
        monthlyPaymentMinor: Number(l.monthlyPaymentMinor),
      })),
      assumptions: {
        inflationRatePct: bpsToPctString(profile.inflationRateBps),
        defaultReturnRatePct: bpsToPctString(profile.defaultReturnRateBps),
        incomeGrowthRatePct: bpsToPctString(profile.incomeGrowthRateBps),
      },
    };
  }
}
