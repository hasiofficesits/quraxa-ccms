import {
    IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceLineDto {
    @IsNotEmpty()
    @IsIn(['CONSULTATION', 'HOSPITAL_FEE', 'MEDICINE', 'TEST', 'OTHER'])
    item_type: 'CONSULTATION' | 'HOSPITAL_FEE' | 'MEDICINE' | 'TEST' | 'OTHER';

    @IsNotEmpty()
    @IsString()
    description: string;

    @IsOptional()
    @IsNumber()
    reference_id?: number;

    @IsOptional()
    @IsNumber()
    batch_id?: number;

    @IsNotEmpty()
    @IsNumber()
    quantity: number;

    @IsNotEmpty()
    @IsNumber()
    unit_price: number;
}

export class CreateInvoiceDto {
    @IsOptional()
    @IsNumber()
    patient_id?: number;

    @IsOptional()
    @IsNumber()
    visit_id?: number;

    @IsNotEmpty()
    @IsIn(['CHANNEL', 'PHARMACY', 'MIXED'])
    invoice_type: 'CHANNEL' | 'PHARMACY' | 'MIXED';

    @IsOptional()
    @IsNumber()
    discount?: number;

    @IsOptional()
    @IsNumber()
    tax?: number;

    @IsOptional()
    @IsIn(['CASH', 'CARD', 'MIXED', 'PENDING'])
    payment_method?: 'CASH' | 'CARD' | 'MIXED' | 'PENDING';

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineDto)
    items: InvoiceLineDto[];
}