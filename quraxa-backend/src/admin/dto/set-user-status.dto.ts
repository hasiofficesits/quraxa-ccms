import { IsBoolean } from 'class-validator';

export class SetUserStatusDto {
    @IsBoolean()
    is_active: boolean;
}
