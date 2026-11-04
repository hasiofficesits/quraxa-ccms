import { IsNotEmpty, IsNumber, IsArray } from 'class-validator';

export class OrderTestsDto {
    @IsNotEmpty()
    @IsNumber()
    consultation_id: number;

    @IsArray()
    test_ids: number[];
}