import {
    IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WalkInSaleItemDto {
    @IsNotEmpty()
    @IsNumber()
    medicine_id: number;

    @IsOptional()
    @IsString()
    dose?: string;

    @IsOptional()
    @IsString()
    frequency?: string;

    @IsOptional()
    @IsString()
    duration?: string;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    quantity: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    unit_price: number;
}

export class WalkInTestDto {
    @IsNotEmpty()
    @IsNumber()
    test_id: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    quantity?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    unit_price?: number;
}

export class WalkInServiceDto {
    @IsNotEmpty()
    @IsString()
    description: string;

    @IsOptional()
    @IsIn(['HOSPITAL_FEE', 'CONSULTATION', 'OTHER'])
    item_type?: 'HOSPITAL_FEE' | 'CONSULTATION' | 'OTHER';

    @IsOptional()
    @IsNumber()
    @Min(1)
    quantity?: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    unit_price: number;
}

export class WalkInSaleDto {
    @IsOptional()
    @IsNumber()
    patient_id?: number;

    @IsOptional()
    @IsIn(['CASH', 'CARD', 'MIXED', 'PENDING'])
    payment_method?: 'CASH' | 'CARD' | 'MIXED' | 'PENDING';

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WalkInSaleItemDto)
    items?: WalkInSaleItemDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WalkInTestDto)
    tests?: WalkInTestDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WalkInServiceDto)
    services?: WalkInServiceDto[];
}
