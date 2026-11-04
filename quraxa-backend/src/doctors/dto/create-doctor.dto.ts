import {
    IsNotEmpty, IsOptional, IsString, IsEmail, IsIn, IsNumber, Min, Max,
} from 'class-validator';

export class CreateDoctoromitDto { }

export class CreateDoctorDto {
    @IsNotEmpty()
    @IsString()
    full_name: string;

    @IsNotEmpty()
    @IsNumber()
    specialty_id: number;

    @IsOptional()
    @IsString()
    nic?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsIn(['Male', 'Female', 'Other'])
    gender?: 'Male' | 'Female' | 'Other';

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    default_commission_rate?: number;
}