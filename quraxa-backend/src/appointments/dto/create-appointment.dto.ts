import { IsNotEmpty, IsNumber, IsOptional, IsIn, IsString } from 'class-validator';

export class CreateAppointmentDto {
    @IsNotEmpty()
    @IsNumber()
    session_id: number;

    @IsNotEmpty()
    @IsNumber()
    patient_id: number;

    @IsOptional()
    @IsIn(['WALK_IN', 'PHONE', 'ONLINE'])
    booking_channel?: 'WALK_IN' | 'PHONE' | 'ONLINE';

    @IsOptional()
    @IsString()
    notes?: string;
}