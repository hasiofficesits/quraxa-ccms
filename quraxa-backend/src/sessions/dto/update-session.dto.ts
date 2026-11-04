import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSessionDto {
    @IsOptional()
    @IsNumber()
    doctor_id?: number;

    @IsOptional()
    @IsNumber()
    room_id?: number;

    @IsOptional()
    @IsString()
    session_date?: string; // "2026-07-15"

    @IsOptional()
    @IsString()
    start_time?: string; // "18:00"

    @IsOptional()
    @IsString()
    end_time?: string; // "21:00"

    @IsOptional()
    @IsNumber()
    @Min(1)
    max_patients?: number;

    @IsOptional()
    @IsNumber()
    channel_fee?: number;

    @IsOptional()
    @IsNumber()
    hospital_fee?: number;

    @IsOptional()
    @IsNumber()
    commission_rate?: number;

    @IsOptional()
    @IsIn(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
