import {
    IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';

export class SettleDoctorDto {
    @IsNotEmpty()
    @IsNumber()
    session_id: number;

    // The figures the user confirmed on screen (pre-filled from the preview,
    // editable before paying). Persisted as-is — see billing.service.ts for
    // how the originally-calculated values are still kept in the audit log.
    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    total_patients: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    channel_fee: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    gross_amount: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    commission_rate: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    doctor_share: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    hospital_share: number;

    @IsOptional()
    @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE'])
    payment_method?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';

    @IsOptional()
    @IsString()
    notes?: string;
}