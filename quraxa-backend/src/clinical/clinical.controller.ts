import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { OrderTestsDto } from './dto/order-test.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('clinical')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalController {
    constructor(private clinicalService: ClinicalService) { }

    @Patch('visit/:id/start')
    @RequirePermissions('consultation.create')
    startConsultation(@Param('id') id: string, @Req() req: any) {
        return this.clinicalService.startConsultation(BigInt(id), BigInt(req.user.userId));
    }

    @Post('consultation')
    @RequirePermissions('consultation.create')
    createConsultation(@Body() dto: CreateConsultationDto, @Req() req: any) {
        return this.clinicalService.createConsultation(dto, BigInt(req.user.userId), req.ip);
    }

    @Post('prescription')
    @RequirePermissions('prescription.create')
    createPrescription(@Body() dto: CreatePrescriptionDto, @Req() req: any) {
        return this.clinicalService.createPrescription(dto, BigInt(req.user.userId), req.ip);
    }

    @Post('tests')
    @RequirePermissions('consultation.create')
    orderTests(@Body() dto: OrderTestsDto, @Req() req: any) {
        return this.clinicalService.orderTests(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('visit/:id/complete')
    @RequirePermissions('consultation.create')
    completeVisit(@Param('id') id: string, @Req() req: any) {
        return this.clinicalService.completeVisit(BigInt(id), BigInt(req.user.userId));
    }

    @Get('patient/:id/history')
    @RequirePermissions('consultation.view')
    getPatientHistory(@Param('id') id: string) {
        return this.clinicalService.getPatientHistory(BigInt(id));
    }

    @Get('tests-list')
    @RequirePermissions('consultation.view')
    listTests() {
        return this.clinicalService.listTests();
    }

    @Get('medicines-in-stock')
    @RequirePermissions('consultation.create')
    listPrescribableMedicines() {
        return this.clinicalService.listPrescribableMedicines();
    }
}