import { IsOptional, IsString } from 'class-validator';

export class UpdateBusinessSettingsDto {
    @IsOptional()
    @IsString()
    business_name?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    business_reg_no?: string;

    @IsOptional()
    @IsString()
    tin_number?: string;
}
