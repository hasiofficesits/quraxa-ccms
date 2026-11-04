import { IsNotEmpty, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DispenseItemDto {
    @IsNotEmpty()
    @IsNumber()
    medicine_id: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    quantity: number;
}

export class DispenseDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DispenseItemDto)
    items: DispenseItemDto[];
}