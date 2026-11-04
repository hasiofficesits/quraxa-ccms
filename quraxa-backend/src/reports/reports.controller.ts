import {
    Controller, Get, Param, Query, Req, Res, UseGuards, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
    constructor(
        private reportsService: ReportsService,
        private exportService: ExportService,
    ) { }

    // Only the reports this user's permissions actually unlock — if none,
    // the Reports section has nothing to show and the frontend hides it.
    @Get('catalog')
    getCatalog(@Req() req: any) {
        const userPermissions: string[] = req.user.permissions ?? [];
        return this.reportsService.listCatalog().filter((r) => userPermissions.includes(r.permission));
    }

    @Get(':id')
    async runReport(@Param('id') id: string, @Query() query: Record<string, string>, @Req() req: any) {
        const def = this.reportsService.findDef(id);
        this.assertAllowed(req, def.permission);
        return this.reportsService.run(id, query);
    }

    @Get(':id/export')
    async exportReport(
        @Param('id') id: string,
        @Query('format') format: string,
        @Query() query: Record<string, string>,
        @Req() req: any,
        @Res() res: Response,
    ) {
        const def = this.reportsService.findDef(id);
        this.assertAllowed(req, def.permission);

        const { filters } = this.splitFilters(query);
        const { columns, rows } = await this.reportsService.run(id, filters);
        const filenameBase = def.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const subtitle = `Generated ${new Date().toLocaleString()}`;

        if (format === 'csv') {
            const csv = this.exportService.toCsv(columns, rows);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
            res.send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
            return;
        }

        if (format === 'xlsx') {
            const buf = await this.exportService.toExcel(def.title, columns, rows);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
            res.send(buf);
            return;
        }

        if (format === 'pdf') {
            const buf = await this.exportService.toPdf(def.title, columns, rows, subtitle);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
            res.send(buf);
            return;
        }

        throw new BadRequestException('format must be csv, xlsx, or pdf');
    }

    private assertAllowed(req: any, permission: string) {
        const userPermissions: string[] = req.user.permissions ?? [];
        if (!userPermissions.includes(permission)) {
            throw new ForbiddenException('You do not have access to this report');
        }
    }

    // Strip pagination/format keys that aren't real report filters before
    // handing the rest to ReportsService.run().
    private splitFilters(query: Record<string, string>) {
        const { format, ...filters } = query;
        return { filters };
    }
}
