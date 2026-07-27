import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '../../audit/audit.service';
import { uuid7 } from '../../../common/ids/uuid7';

export interface OutboxEventInput {
  userId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: 'PROFILE_CHANGED' | 'GOAL_CHANGED';
}

/**
 * Transactional outbox writer (specification.md Task 15, simplified per the
 * approved in-process-dispatcher deviation: no BullMQ/Redis relay — a
 * `ForecastDispatcherService` processes these rows synchronously right
 * after the enclosing transaction commits).
 *
 * Payloads carry entity IDs and an event type only — never monetary values
 * (specification.md §5.7 extends the no-money-in-logs rule to queue/outbox
 * payloads).
 */
@Injectable()
export class OutboxService {
  async writeEvent(tx: TransactionClient, event: OutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        id: uuid7(),
        userId: event.userId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: JSON.stringify({ entityId: event.aggregateId }),
      },
    });
  }
}
