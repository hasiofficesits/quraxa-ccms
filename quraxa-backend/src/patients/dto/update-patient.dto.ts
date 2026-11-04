import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdatePatientDto {
    @IsOptional() @IsString() full_name?: string;
    @IsOptional() @IsString() nic?: string;
    @IsOptional() @IsString() date_of_birth?: string;
    @IsOptional() @IsIn(['Male', 'Female', 'Other']) gender?: 'Male' | 'Female' | 'Other';
    @IsOptional() @IsString() phone?: string;
    @IsOptional() @IsString() email?: string;
    @IsOptional() @IsString() address?: string;
    @IsOptional() @IsString() blood_group?: string;
    @IsOptional() @IsString() guardian_name?: string;
    @IsOptional() @IsString() guardian_phone?: string;
    @IsOptional() @IsString() guardian_relationship?: string;
}