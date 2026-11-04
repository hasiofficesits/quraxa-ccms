import { IsIn, IsNotEmpty } from 'class-validator';

export class UpdatePrescriptionItemStatusDto {
    @IsNotEmpty()
    @IsIn(['PENDING', 'ADDED', 'UNAVAILABLE'])
    status: 'PENDING' | 'ADDED' | 'UNAVAILABLE';
}
