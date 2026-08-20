import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ToBoolean, ToInt } from '../common/transforms';

export class HerdTestDto {
  /** Concurrent GET /materials equivalents. */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'reads must be a whole number' })
  @Min(1, { message: 'reads must be at least 1' })
  @Max(1000, { message: 'reads cannot be more than 1000' })
  reads?: number;

  /** Writes fired in among them, each one invalidating the cached list. */
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'writes must be a whole number' })
  @Min(0, { message: 'writes cannot be negative' })
  @Max(50, { message: 'writes cannot be more than 50' })
  writes?: number;

  /**
   * false reproduces the problem: every miss runs its own query. true is the
   * fix. Sending both and comparing is the point of this endpoint.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'singleFlight must be true or false' })
  singleFlight?: boolean;
}
