import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @IsNotEmpty()
    @IsString()
    current_password: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(8)
    new_password: string;
}
