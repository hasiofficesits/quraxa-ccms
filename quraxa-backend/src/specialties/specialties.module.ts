import { Module } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { SpecialtiesController } from './specialties.controller';

@Module({
  providers: [SpecialtiesService],
  controllers: [SpecialtiesController]
})
export class SpecialtiesModule {}
