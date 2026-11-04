import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const TYPES = ['PUBLIC', 'BANK', 'MERCANTILE', 'POYA', 'OTHER'] as const;

export class CreateHolidayDto {
    @IsNotEmpty()
    @IsString()
    date: string;

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsIn(TYPES)
    type?: (typeof TYPES)[number];
}
