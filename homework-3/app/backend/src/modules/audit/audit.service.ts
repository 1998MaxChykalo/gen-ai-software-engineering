import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { uuid7 } from '../../common/ids/uuid7';

export type TransactionClient = Prisma.TransactionClient;

export interface AuditEventInput {
  actorId: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  justification?: string;
  requestId?: string;
}

/**
 * Append-only audit trail (specification.md MLO-9 / Task 24).
 *
 * `record` must always be called with the same Prisma transaction client as
 * the domain mutation it documents, so a rolled-back mutation leaves no
 * audit row (atomicity). Before/after values may contain full monetary
 * figures in the DB (the DB is the protected store); this module never logs
 * them — see src/common/logging.
 */
@Injectable()
export class AuditService {
  async record(tx: TransactionClient, event: AuditEventInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        id: uuid7(),
        actorId: event.actorId,
        actorRole: event.actorRole,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        before: event.before !== undefined ? JSON.stringify(event.before) : null,
        after: event.after !== undefined ? JSON.stringify(event.after) : null,
        justification: event.justification ?? null,
        requestId: event.requestId ?? null,
      },
    });
  }
}
