import { IsOptional, IsString, IsEmail, IsNumber } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    full_name?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsNumber()
    role_id?: number;

    // Pass 0/null to unlink; pass a doctor id to (re)link. Omit to leave as-is.
    @IsOptional()
    @IsNumber()
    doctor_id?: number;
}
