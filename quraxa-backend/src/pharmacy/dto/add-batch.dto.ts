import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddBatchDto {
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

    @IsOptional()
    @IsNumber()
    supplier_id?: number;
}
