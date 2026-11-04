import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateConsultationDto {
    @IsNotEmpty()
    @IsNumber()
    visit_id: number;

    @IsOptional()
    @IsString()
    symptoms?: string;

    @IsOptional()
    @IsString()
    diagnosis?: string;

    @IsOptional()
    @IsString()
    clinical_notes?: string;

    @IsOptional()
    @IsString()
    follow_up_date?: string;
}