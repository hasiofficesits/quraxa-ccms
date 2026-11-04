import {
    IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PrescriptionItemDto {
    @IsOptional()
    @IsNumber()
    medicine_id?: number;

    @IsNotEmpty()
    @IsString()
    medicine_name: string;

    @IsOptional()
    @IsString()
    dose?: string;

    @IsOptional()
    @IsString()
    frequency?: string;

    @IsOptional()
    @IsString()
    duration?: string;

    @IsOptional()
    @IsNumber()
    quantity?: number;

    @IsOptional()
    @IsString()
    instructions?: string;
}

export class CreatePrescriptionDto {
    @IsNotEmpty()
    @IsNumber()
    consultation_id: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PrescriptionItemDto)
    items: PrescriptionItemDto[];
}