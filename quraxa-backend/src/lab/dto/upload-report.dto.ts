import { IsOptional, IsString } from 'class-validator';

export class UploadReportDto {
    @IsOptional()
    @IsString()
    result_notes?: string;
}
