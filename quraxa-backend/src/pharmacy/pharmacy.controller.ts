import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { CreateGrnDto } from './dto/create-grn.dto';
import { DispenseDto } from './dto/dispense.dto';
import { UpdatePrescriptionItemStatusDto } from './dto/update-prescription-item-status.dto';
import { UpdatePrescriptionItemQuantityDto } from './dto/update-prescription-item-quantity.dto';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { AddBatchDto } from './dto/add-batch.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('pharmacy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyController {
    constructor(private pharmacyService: PharmacyService) { }

    @Post('grn')
    @RequirePermissions('stock.receive')
    createGrn(@Body() dto: CreateGrnDto, @Req() req: any) {
        return this.pharmacyService.createGrn(dto, BigInt(req.user.userId), req.ip);
    }

    @Get('stock')
    @RequirePermissions('stock.view')
    getStockLevels() {
        return this.pharmacyService.getStockLevels();
    }

    @Get('near-expiry')
    @RequirePermissions('stock.view')
    getNearExpiry(@Query('days') days?: string) {
        return this.pharmacyService.getNearExpiry(days ? parseInt(days) : 90);
    }

    @Get('stock/:medicineId/batches')
    @RequirePermissions('stock.view')
    getBatchesByMedicine(@Param('medicineId') medicineId: string) {
        return this.pharmacyService.getBatchesByMedicine(BigInt(medicineId));
    }

    @Post('stock/:medicineId/batches')
    @RequirePermissions('stock.receive')
    addBatch(@Param('medicineId') medicineId: string, @Body() dto: AddBatchDto, @Req() req: any) {
        return this.pharmacyService.addBatch(BigInt(medicineId), dto, BigInt(req.user.userId), req.ip);
    }

    @Post('dispense')
    @RequirePermissions('sale.create')
    dispense(@Body() dto: DispenseDto, @Req() req: any) {
        return this.pharmacyService.dispense(dto, BigInt(req.user.userId), req.ip);
    }

    @Get('medicines-list')
    @RequirePermissions('stock.view')
    listMedicines() {
        return this.pharmacyService.listMedicines();
    }

    @Get('suppliers-list')
    @RequirePermissions('stock.view')
    listSuppliers() {
        return this.pharmacyService.listSuppliers();
    }

    // ---- Supplier master data (Manage Suppliers tab) ----

    @Get('suppliers')
    @RequirePermissions('stock.receive')
    listSuppliersFull() {
        return this.pharmacyService.listSuppliersFull();
    }

    @Post('suppliers')
    @RequirePermissions('stock.receive')
    createSupplier(@Body() dto: CreateSupplierDto, @Req() req: any) {
        return this.pharmacyService.createSupplier(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch('suppliers/:id')
    @RequirePermissions('stock.receive')
    updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @Req() req: any) {
        return this.pharmacyService.updateSupplier(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    // ---- Medicine master data (Manage Medicines tab) ----

    @Get('medicines')
    @RequirePermissions('stock.receive')
    listMedicinesFull() {
        return this.pharmacyService.listMedicinesFull();
    }

    @Get('medicine-categories-list')
    @RequirePermissions('stock.receive')
    listMedicineCategories() {
        return this.pharmacyService.listMedicineCategories();
    }

    @Post('medicines')
    @RequirePermissions('stock.receive')
    createMedicine(@Body() dto: CreateMedicineDto) {
        return this.pharmacyService.createMedicine(dto);
    }

    @Patch('medicines/:id')
    @RequirePermissions('stock.receive')
    updateMedicine(@Param('id') id: string, @Body() dto: UpdateMedicineDto) {
        return this.pharmacyService.updateMedicine(BigInt(id), dto);
    }

    // ---- In-house prescription fulfillment ----

    @Get('prescriptions/pending-patients')
    @RequirePermissions('sale.create')
    getPendingPatients(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.pharmacyService.getPendingPatients(
            search,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
        );
    }

    @Get('prescriptions/patient/:patientId')
    @RequirePermissions('sale.create')
    getPatientPendingPrescriptions(@Param('patientId') patientId: string) {
        return this.pharmacyService.getPatientPendingPrescriptions(BigInt(patientId));
    }

    @Patch('prescriptions/item/:itemId/status')
    @RequirePermissions('sale.create')
    updateItemStatus(@Param('itemId') itemId: string, @Body() dto: UpdatePrescriptionItemStatusDto) {
        return this.pharmacyService.updateItemStatus(BigInt(itemId), dto);
    }

    @Patch('prescriptions/item/:itemId/quantity')
    @RequirePermissions('sale.create')
    updateItemQuantity(@Param('itemId') itemId: string, @Body() dto: UpdatePrescriptionItemQuantityDto) {
        return this.pharmacyService.updateItemQuantity(BigInt(itemId), dto);
    }

    @Post('prescriptions/:prescriptionId/finalize')
    @RequirePermissions('sale.create')
    finalizePrescription(@Param('prescriptionId') prescriptionId: string, @Req() req: any) {
        return this.pharmacyService.finalizePrescription(BigInt(prescriptionId), BigInt(req.user.userId), req.ip);
    }
}