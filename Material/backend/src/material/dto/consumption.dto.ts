import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ToInt, Trim } from '../../common/transforms';

const MATERIAL_REQUIRED = 'Material is required';
const QUANTITY_INVALID = 'Quantity must be a positive number';
const MONTH_INVALID = 'Month must be in YYYY-MM format';

export class CreateConsumptionDto {
  @ToInt()
  @IsInt({ message: MATERIAL_REQUIRED })
  @Min(1, { message: MATERIAL_REQUIRED })
  materialId: number;

  /** Up to three decimals, matching the NUMERIC(14, 3) column. */
  @IsNumber({ maxDecimalPlaces: 3 }, { message: QUANTITY_INVALID })
  @IsPositive({ message: QUANTITY_INVALID })
  quantity: number;

  /** Defaults to today when omitted — most draws are logged the same day. */
  @IsOptional()
  @Trim()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Consumed-on must be a date in YYYY-MM-DD format',
  })
  consumedOn?: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Note must be text' })
  @MaxLength(500, { message: 'Note is too long' })
  note?: string;
}

/** ?month=YYYY-MM — one calendar month is the report's whole vocabulary. */
export class ConsumptionReportQueryDto {
  @Trim()
  @IsString({ message: MONTH_INVALID })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: MONTH_INVALID })
  month: string;
}
