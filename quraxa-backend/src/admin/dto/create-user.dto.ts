import { IsNotEmpty, IsOptional, IsString, IsEmail, IsNumber, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsNotEmpty()
    @IsString()
    full_name: string;

    @IsNotEmpty()
    @IsString()
    username: string;

    @IsNotEmpty()
    @IsEmail()
    email: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(8)
    password: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsNotEmpty()
    @IsNumber()
    role_id: number;

    // Links this new login account to an existing (unlinked) doctor profile —
    // only meaningful when the assigned role is the Doctor role.
    @IsOptional()
    @IsNumber()
    doctor_id?: number;
}
