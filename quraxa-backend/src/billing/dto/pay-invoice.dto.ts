import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PayInvoiceDto {
    @IsNotEmpty()
    @IsIn(['CASH', 'CARD', 'MIXED'])
    payment_method: 'CASH' | 'CARD' | 'MIXED';

    @IsNotEmpty()
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsString()
    reference?: string;
}
