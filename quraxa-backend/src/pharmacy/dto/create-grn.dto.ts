import {
    IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GrnBatchDto {
    @IsNotEmpty()
    @IsNumber()
    medicine_id: number;

    @IsNotEmpty()
    @IsString()
    batch_number: string;

    @IsNotEmpty()
    @IsString()
    expiry_date: string;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    quantity: number;

    @IsNotEmpty()
    @IsNumber()
    cost_price: number;

    @IsNotEmpty()
    @IsNumber()
    selling_price: number;
}

export class CreateGrnDto {
    @IsNotEmpty()
    @IsNumber()
    supplier_id: number;

    @IsOptional()
    @IsString()
    invoice_number?: string;

    @IsNotEmpty()
    @IsString()
    received_date: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GrnBatchDto)
    batches: GrnBatchDto[];
}