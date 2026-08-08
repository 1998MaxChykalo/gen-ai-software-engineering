import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const PCT_PATTERN = /^-?\d+(\.\d{1,4})?$/;

export class IncomeItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ enum: ['active', 'passive'] }) @IsIn(['active', 'passive']) kind!:
    'active' | 'passive';
  @ApiProperty() @IsInt() @Min(0) amountMinor!: number;
  @ApiProperty({ default: 'EUR' }) @IsString() currency!: string;
  @ApiProperty({ example: '2.5' }) @Matches(PCT_PATTERN) annualGrowthRatePct!: string;
}

export class ExpenseItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ enum: ['fixed', 'variable'] }) @IsIn(['fixed', 'variable']) kind!:
    'fixed' | 'variable';
  @ApiProperty() @IsInt() @Min(0) amountMinor!: number;
  @ApiProperty({ default: 'EUR' }) @IsString() currency!: string;
}

export class AssetItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ enum: ['cash', 'investment', 'real_estate'] })
  @IsIn(['cash', 'investment', 'real_estate'])
  kind!: 'cash' | 'investment' | 'real_estate';
  @ApiProperty() @IsInt() @Min(0) valueMinor!: number;
  @ApiProperty({ default: 'EUR' }) @IsString() currency!: string;
  @ApiProperty({ example: '5.0' }) @Matches(PCT_PATTERN) annualReturnRatePct!: string;
}

export class LiabilityItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ enum: ['loan', 'mortgage', 'credit_card'] })
  @IsIn(['loan', 'mortgage', 'credit_card'])
  kind!: 'loan' | 'mortgage' | 'credit_card';
  @ApiProperty() @IsInt() @Min(0) balanceMinor!: number;
  @ApiProperty({ default: 'EUR' }) @IsString() currency!: string;
  @ApiProperty({ example: '6.5' }) @Matches(PCT_PATTERN) annualInterestRatePct!: string;
  @ApiProperty() @IsInt() @Min(0) monthlyPaymentMinor!: number;
}

export class AssumptionsDto {
  @ApiProperty({ example: '2.0' }) @Matches(PCT_PATTERN) inflationRatePct!: string;
  @ApiProperty({ example: '5.0' }) @Matches(PCT_PATTERN) defaultReturnRatePct!: string;
  @ApiProperty({ example: '2.5' }) @Matches(PCT_PATTERN) incomeGrowthRatePct!: string;
}

export class ProfileUpsertDto {
  @ApiProperty() @IsInt() version!: number;

  @ApiProperty({ type: [IncomeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncomeItemDto)
  incomes!: IncomeItemDto[];

  @ApiProperty({ type: [ExpenseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemDto)
  expenses!: ExpenseItemDto[];

  @ApiProperty({ type: [AssetItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetItemDto)
  assets!: AssetItemDto[];

  @ApiProperty({ type: [LiabilityItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiabilityItemDto)
  liabilities!: LiabilityItemDto[];

  @ApiProperty({ type: AssumptionsDto })
  @ValidateNested()
  @Type(() => AssumptionsDto)
  assumptions!: AssumptionsDto;
}
