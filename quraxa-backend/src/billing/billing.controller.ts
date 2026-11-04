import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SettleDoctorDto } from './dto/settle-doctor.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { WalkInSaleDto } from './dto/walk-in-sale.dto';
import { SettleEmployeeDto } from './dto/settle-employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Post('invoice')
    @RequirePermissions('invoice.create')
    createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
        return this.billingService.createInvoice(dto, BigInt(req.user.userId), req.ip);
    }

    @Get('invoice/:id')
    @RequirePermissions('invoice.view')
    getInvoice(@Param('id') id: string) {
        return this.billingService.getInvoice(BigInt(id));
    }

    @Get('invoices')
    @RequirePermissions('invoice.view')
    listInvoices(@Query('status') status?: string) {
        return this.billingService.listInvoices(status);
    }

    @Get('inpatient-invoices')
    @RequirePermissions('invoice.view')
    getInpatientInvoices(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.billingService.getInpatientInvoices(
            search,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
        );
    }

    @Patch('invoice/:id/pay')
    @RequirePermissions('invoice.create')
    payInvoice(@Param('id') id: string, @Body() dto: PayInvoiceDto, @Req() req: any) {
        return this.billingService.payInvoice(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Get('settle-doctor/preview/:sessionId')
    @RequirePermissions('payment.doctor')
    previewDoctorSettlement(@Param('sessionId') sessionId: string) {
        return this.billingService.previewDoctorSettlement(BigInt(sessionId));
    }

    @Post('settle-doctor')
    @RequirePermissions('payment.doctor')
    settleDoctor(@Body() dto: SettleDoctorDto, @Req() req: any) {
        return this.billingService.settleDoctor(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('doctor-payment/:id/paid')
    @RequirePermissions('payment.doctor')
    markDoctorPaid(@Param('id') id: string) {
        return this.billingService.markDoctorPaid(BigInt(id));
    }

    @Get('medicines-in-stock')
    @RequirePermissions('invoice.create')
    listMedicinesForSale() {
        return this.billingService.listMedicinesForSale();
    }

    @Get('tests-list')
    @RequirePermissions('invoice.create')
    listTestsForSale() {
        return this.billingService.listTestsForSale();
    }

    @Post('walk-in-sale')
    @RequirePermissions('invoice.create')
    sellWalkIn(@Body() dto: WalkInSaleDto, @Req() req: any) {
        return this.billingService.sellWalkIn(dto, BigInt(req.user.userId), req.ip);
    }

    @Get('employees-list')
    @RequirePermissions('payment.doctor')
    listEmployees() {
        return this.billingService.listEmployees();
    }

    @Get('employee-payments')
    @RequirePermissions('payment.doctor')
    listEmployeePayments() {
        return this.billingService.listEmployeePayments();
    }

    @Post('settle-employee')
    @RequirePermissions('payment.doctor')
    settleEmployee(@Body() dto: SettleEmployeeDto, @Req() req: any) {
        return this.billingService.settleEmployee(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('employee-payment/:id/paid')
    @RequirePermissions('payment.doctor')
    markEmployeePaid(@Param('id') id: string) {
        return this.billingService.markEmployeePaid(BigInt(id));
    }
}