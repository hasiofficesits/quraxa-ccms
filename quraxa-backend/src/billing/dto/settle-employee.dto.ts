import {
    IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';

export class SettleEmployeeDto {
    @IsNotEmpty()
    @IsNumber()
    user_id: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsString()
    period_start?: string;

    @IsOptional()
    @IsString()
    period_end?: string;

    @IsOptional()
    @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE'])
    payment_method?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';

    @IsOptional()
    @IsString()
    notes?: string;
}
