import { IsArray, IsNumber } from 'class-validator';

export class UpdateRolePermissionsDto {
    @IsArray()
    @IsNumber({}, { each: true })
    permission_ids: number[];
}
