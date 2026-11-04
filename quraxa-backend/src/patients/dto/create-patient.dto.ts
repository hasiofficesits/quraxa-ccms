import { IsNotEmpty, IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';

export class CreatePatientDto {
    @IsNotEmpty()
    @IsString()
    full_name: string;

    @IsOptional()
    @IsString()
    nic?: string;

    @IsOptional()
    @IsString()
    date_of_birth?: string;

    @IsOptional()
    @IsIn(['Male', 'Female', 'Other'])
    gender?: 'Male' | 'Female' | 'Other';

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    blood_group?: string;

    @IsOptional()
    @IsString()
    guardian_name?: string;

    @IsOptional()
    @IsString()
    guardian_phone?: string;

    @IsOptional()
    @IsString()
    guardian_relationship?: string;

    // PDPA — explicit consent to process this patient's (sensitive) health
    // data, captured at registration.
    @IsOptional()
    @IsBoolean()
    data_consent_given?: boolean;
}