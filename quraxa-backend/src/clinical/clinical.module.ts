import { Module } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { ClinicalController } from './clinical.controller';

@Module({
  providers: [ClinicalService],
  controllers: [ClinicalController]
})
export class ClinicalModule {}
