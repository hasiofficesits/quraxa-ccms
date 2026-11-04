import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSessionDto {
    @IsNotEmpty()
    @IsNumber()
    doctor_id: number;

    @IsOptional()
    @IsNumber()
    room_id?: number;

    @IsNotEmpty()
    @IsString()
    session_date: string; // "2026-07-15"

    @IsNotEmpty()
    @IsString()
    start_time: string; // "18:00"

    @IsNotEmpty()
    @IsString()
    end_time: string; // "21:00"

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
}