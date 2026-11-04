import {
    Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards,
    UseInterceptors, UploadedFile, BadRequestException, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { InsuranceService, CLAIM_UPLOAD_DIR } from './insurance.service';
import { CreateInsurerDto } from './dto/create-insurer.dto';
import { UpdateInsurerDto } from './dto/update-insurer.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

const ALLOWED_DOC_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];

@Controller('insurance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsuranceController {
    constructor(private insuranceService: InsuranceService) { }

    // ---- Insurers ----

    @Get('insurers')
    @RequirePermissions('claim.view')
    listInsurers() {
        return this.insuranceService.listInsurers();
    }

    @Get('insurers/full')
    @RequirePermissions('claim.manage')
    listInsurersFull() {
        return this.insuranceService.listInsurersFull();
    }

    @Post('insurers')
    @RequirePermissions('claim.manage')
    createInsurer(@Body() dto: CreateInsurerDto, @Req() req: any) {
        return this.insuranceService.createInsurer(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('insurers/:id')
    @RequirePermissions('claim.manage')
    updateInsurer(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInsurerDto, @Req() req: any) {
        return this.insuranceService.updateInsurer(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    // ---- Invoice lookup for filing a new claim ----

    @Get('invoices/search')
    @RequirePermissions('claim.manage')
    searchInvoices(@Query('q') q: string) {
        return this.insuranceService.searchInvoices(q);
    }

    // ---- Claims ----

    @Get('claims')
    @RequirePermissions('claim.view')
    getClaims(
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.insuranceService.getClaims(search, status, page ? Number(page) : 1, limit ? Number(limit) : 20);
    }

    @Get('claims/:id')
    @RequirePermissions('claim.view')
    getClaim(@Param('id', ParseIntPipe) id: number) {
        return this.insuranceService.getClaim(BigInt(id));
    }

    @Post('claims')
    @RequirePermissions('claim.manage')
    createClaim(@Body() dto: CreateClaimDto, @Req() req: any) {
        return this.insuranceService.createClaim(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('claims/:id')
    @RequirePermissions('claim.manage')
    updateClaim(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClaimDto, @Req() req: any) {
        return this.insuranceService.updateClaim(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('claims/:id/status')
    @RequirePermissions('claim.manage')
    updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClaimStatusDto, @Req() req: any) {
        return this.insuranceService.updateStatus(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    // ---- Supporting documents ----

    @Post('claims/:id/documents')
    @RequirePermissions('claim.manage')
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: CLAIM_UPLOAD_DIR,
            filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (!ALLOWED_DOC_TYPES.includes(extname(file.originalname).toLowerCase())) {
                return cb(new BadRequestException('Only PDF, JPG or PNG files are allowed'), false);
            }
            cb(null, true);
        },
    }))
    addDocument(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
        return this.insuranceService.addDocument(BigInt(id), file, BigInt(req.user.userId), req.ip);
    }

    @Get('claims/:id/documents/:docId/download')
    @RequirePermissions('claim.view')
    async downloadDocument(
        @Param('id', ParseIntPipe) id: number,
        @Param('docId', ParseIntPipe) docId: number,
        @Res() res: Response,
    ) {
        const { filePath, fileName } = await this.insuranceService.getDocumentDownloadInfo(BigInt(id), BigInt(docId));
        res.download(filePath, fileName);
    }

    @Delete('claims/:id/documents/:docId')
    @RequirePermissions('claim.manage')
    removeDocument(@Param('id', ParseIntPipe) id: number, @Param('docId', ParseIntPipe) docId: number, @Req() req: any) {
        return this.insuranceService.removeDocument(BigInt(id), BigInt(docId), BigInt(req.user.userId), req.ip);
    }
}
