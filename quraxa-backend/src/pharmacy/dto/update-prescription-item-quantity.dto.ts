import { IsInt, Min } from 'class-validator';

export class UpdatePrescriptionItemQuantityDto {
    @IsInt()
    @Min(1)
    quantity: number;
}
