import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class UpdateClaimDto {
    @IsOptional()
    @IsString()
    policy_number?: string;

    @IsOptional()
    @IsNumberString()
    claimed_amount?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
