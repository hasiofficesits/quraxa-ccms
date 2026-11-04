import { Module } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { PharmacyController } from './pharmacy.controller';

@Module({
  providers: [PharmacyService],
  controllers: [PharmacyController]
})
export class PharmacyModule {}
