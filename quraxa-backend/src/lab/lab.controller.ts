import {
    Controller, Get, Patch, Post, Param, Body, Query, Req, Res, UseGuards,
    UseInterceptors, UploadedFile, BadRequestException, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { LabService, LAB_UPLOAD_DIR } from './lab.service';
import { UploadReportDto } from './dto/upload-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

const ALLOWED_REPORT_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];

@Controller('lab')
@UseGuards(JwtAuthGuard)
export class LabController {
    constructor(private labService: LabService) { }

    @Get('queue')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('lab.view')
    getQueue(
        @Query('search') search?: string,
        @Query('status') status?: 'ORDERED' | 'SAMPLE_COLLECTED',
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.labService.getQueue(search, status, page ? Number(page) : 1, limit ? Number(limit) : 20);
    }

    @Get('completed')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('lab.view')
    getCompleted(
        @Query('search') search?: string,
        @Query('status') status?: 'COMPLETED' | 'CANCELLED',
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.labService.getCompleted(search, status, page ? Number(page) : 1, limit ? Number(limit) : 20);
    }

    @Patch(':id/collect')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('lab.manage')
    markSampleCollected(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        return this.labService.markSampleCollected(BigInt(id), BigInt(req.user.userId), req.ip);
    }

    @Post(':id/report')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('lab.manage')
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: LAB_UPLOAD_DIR,
            filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (!ALLOWED_REPORT_TYPES.includes(extname(file.originalname).toLowerCase())) {
                return cb(new BadRequestException('Only PDF, JPG or PNG files are allowed'), false);
            }
            cb(null, true);
        },
    }))
    uploadReport(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadReportDto,
        @Req() req: any,
    ) {
        return this.labService.uploadReport(BigInt(id), file, dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id/cancel')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('lab.manage')
    cancel(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        return this.labService.cancel(BigInt(id), BigInt(req.user.userId), req.ip);
    }

    // Report download is shared between lab staff and doctors, so
    // permission checking happens inside the service rather than the guard.
    @Get(':id/download')
    async download(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Res() res: Response) {
        const { filePath, fileName } = await this.labService.getDownloadInfo(BigInt(id), req.user.permissions ?? []);
        res.download(filePath, fileName);
    }
}
