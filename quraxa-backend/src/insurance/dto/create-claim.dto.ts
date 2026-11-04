import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateClaimDto {
    @IsNotEmpty()
    @IsString()
    invoice_id: string;

    @IsNotEmpty()
    @IsString()
    insurer_id: string;

    @IsNotEmpty()
    @IsString()
    policy_number: string;

    @IsNotEmpty()
    @IsNumberString()
    claimed_amount: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
