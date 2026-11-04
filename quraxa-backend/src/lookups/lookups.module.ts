import { Module } from '@nestjs/common';
import { LookupsService } from './lookups.service';
import { LookupsController } from './lookups.controller';

@Module({
    providers: [LookupsService],
    controllers: [LookupsController],
})
export class LookupsModule { }
