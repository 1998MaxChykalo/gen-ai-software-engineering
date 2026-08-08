import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Loose wire-shape DTO: `deltas` is validated at the class-validator layer
 * only for "array of at most 10 plain objects"; each element's specific
 * shape (discriminated on `type`) is validated at runtime by
 * `validateDeltas` (see ../scenario-delta.types.ts) — see that file for why.
 */
export class ScenarioEvaluateDto {
  @ApiProperty({
    type: 'array',
    maxItems: 10,
    description:
      'Discriminated union on `type`: income_pct_change | expense_amount_change | one_time_purchase | invest_cash | loan_early_payoff',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  deltas!: Record<string, unknown>[];
}

export class SaveScenarioDto extends ScenarioEvaluateDto {
  @ApiProperty() @IsString() name!: string;
}
