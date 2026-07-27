import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const GOAL_TYPES = [
  'house',
  'car',
  'emergency_fund',
  'net_worth',
  'financial_independence',
  'retirement',
  'vacation',
  'custom',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export class ContributionDto {
  @ApiProperty({ enum: ['one_time', 'recurring_monthly'] })
  @IsIn(['one_time', 'recurring_monthly'])
  kind!: 'one_time' | 'recurring_monthly';

  @ApiProperty() @IsInt() @Min(1) amountMinor!: number;

  @ApiProperty({ example: '2026-01' }) @Matches(MONTH_PATTERN) startMonth!: string;

  @ApiPropertyOptional({ example: '2027-01' })
  @IsOptional()
  @Matches(MONTH_PATTERN)
  endMonth?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  allowDeficit?: boolean;
}

export class CreateGoalDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;

  @ApiProperty({ enum: GOAL_TYPES }) @IsIn(GOAL_TYPES) type!: GoalType;

  @ApiProperty() @IsInt() @Min(1) targetAmountMinor!: number;

  @ApiPropertyOptional({ example: '2030-06' })
  @IsOptional()
  @Matches(MONTH_PATTERN)
  targetMonth?: string;

  @ApiProperty() @IsInt() @Min(1) priority!: number;

  @ApiPropertyOptional({ type: ContributionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContributionDto)
  contribution?: ContributionDto;
}

export class UpdateGoalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;

  @ApiPropertyOptional({ enum: GOAL_TYPES }) @IsOptional() @IsIn(GOAL_TYPES) type?: GoalType;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) targetAmountMinor?: number;

  @ApiPropertyOptional({ example: '2030-06' })
  @IsOptional()
  @Matches(MONTH_PATTERN)
  targetMonth?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) priority?: number;

  @ApiPropertyOptional({ enum: ['active', 'paused'] })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';

  @ApiPropertyOptional({ type: ContributionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContributionDto)
  contribution?: ContributionDto | null;
}
