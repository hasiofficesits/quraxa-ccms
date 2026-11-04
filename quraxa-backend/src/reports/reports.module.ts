import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ExportService } from './export.service';

@Module({
    providers: [ReportsService, ExportService],
    controllers: [ReportsController],
})
export class ReportsModule { }
