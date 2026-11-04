import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

const STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'] as const;

export class UpdateClaimStatusDto {
    @IsNotEmpty()
    @IsIn(STATUSES)
    status: (typeof STATUSES)[number];

    @IsOptional()
    @IsNumberString()
    approved_amount?: string;

    @IsOptional()
    @IsString()
    rejection_reason?: string;
}
