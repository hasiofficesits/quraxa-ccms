import { IsOptional, IsString, IsNumber, IsBoolean, Min } from 'class-validator';

export class UpdateMedicineDto {
    @IsOptional()
    @IsString()
    medicine_code?: string;

    @IsOptional()
    @IsString()
    generic_name?: string;

    @IsOptional()
    @IsString()
    brand_name?: string;

    @IsOptional()
    @IsNumber()
    category_id?: number;

    @IsOptional()
    @IsString()
    strength?: string;

    @IsOptional()
    @IsString()
    unit?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    reorder_level?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    default_selling_price?: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
