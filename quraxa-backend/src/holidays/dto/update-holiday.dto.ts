import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const TYPES = ['PUBLIC', 'BANK', 'MERCANTILE', 'POYA', 'OTHER'] as const;

export class UpdateHolidayDto {
    @IsOptional()
    @IsString()
    date?: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsIn(TYPES)
    type?: (typeof TYPES)[number];

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
