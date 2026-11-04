import {
    Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGrnDto } from './dto/create-grn.dto';
import { DispenseDto } from './dto/dispense.dto';
import { UpdatePrescriptionItemStatusDto } from './dto/update-prescription-item-status.dto';
import { UpdatePrescriptionItemQuantityDto } from './dto/update-prescription-item-quantity.dto';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { AddBatchDto } from './dto/add-batch.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class PharmacyService {
    constructor(private prisma: PrismaService) { }

    // ---- RECEIVING: create a GRN with batches, write RECEIVE movements ----
    async createGrn(dto: CreateGrnDto, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            const count = await tx.grn.count();
            const grnNumber = 'GRN-' + String(count + 1).padStart(6, '0');

            let totalAmount = 0;
            for (const b of dto.batches) {
                totalAmount += b.cost_price * b.quantity;
            }

            const grn = await tx.grn.create({
                data: {
                    grn_number: grnNumber,
                    supplier_id: BigInt(dto.supplier_id),
                    invoice_number: dto.invoice_number ?? null,
                    received_by: userId,
                    received_date: new Date(dto.received_date),
                    total_amount: totalAmount,
                    status: 'CONFIRMED',
                },
            });

            // Create each batch + its RECEIVE movement
            for (const b of dto.batches) {
                const batch = await tx.stock_batches.create({
                    data: {
                        medicine_id: BigInt(b.medicine_id),
                        grn_id: grn.id,
                        supplier_id: BigInt(dto.supplier_id),
                        batch_number: b.batch_number,
                        expiry_date: new Date(b.expiry_date),
                        quantity_received: b.quantity,
                        quantity_available: b.quantity,
                        cost_price: b.cost_price,
                        selling_price: b.selling_price,
                    },
                });

                await tx.stock_movements.create({
                    data: {
                        batch_id: batch.id,
                        medicine_id: BigInt(b.medicine_id),
                        movement_type: 'RECEIVE',
                        quantity_change: b.quantity,
                        balance_after: b.quantity,
                        reference_type: 'grn',
                        reference_id: grn.id,
                        user_id: userId,
                        notes: `Received via ${grnNumber}`,
                    },
                });
            }

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'CREATE_GRN',
                    entity_type: 'grn',
                    entity_id: grn.id,
                    new_values: JSON.stringify({ grn_number: grnNumber, batches: dto.batches.length }),
                    ip_address: ip ?? null,
                },
            });

            return { ...grn, batch_count: dto.batches.length };
        });
    }

    // ---- STOCK VIEW: available quantity per medicine (summed across batches) ----
    async getStockLevels() {
        const medicines = await this.prisma.medicines.findMany({
            where: { is_deleted: false },
            include: {
                stock_batches: {
                    where: { quantity_available: { gt: 0 }, expiry_date: { gte: new Date() } },
                },
            },
        });

        return medicines.map((m) => {
            const available = m.stock_batches.reduce((sum, b) => sum + b.quantity_available, 0);
            return {
                medicine_id: m.id,
                medicine_code: m.medicine_code,
                generic_name: m.generic_name,
                brand_name: m.brand_name,
                available_quantity: available,
                reorder_level: m.reorder_level,
                low_stock: available <= m.reorder_level,
                batch_count: m.stock_batches.length,
            };
        });
    }

    // ---- All batches for one medicine (stock level "view" modal) ----
    async getBatchesByMedicine(medicineId: bigint) {
        const medicine = await this.prisma.medicines.findUnique({
            where: { id: medicineId },
            select: { id: true, medicine_code: true, generic_name: true, brand_name: true, reorder_level: true },
        });
        if (!medicine) throw new NotFoundException('Medicine not found');

        const batches = await this.prisma.stock_batches.findMany({
            where: { medicine_id: medicineId, is_deleted: false },
            orderBy: { expiry_date: 'asc' },
            include: { suppliers: { select: { name: true } } },
        });

        const today = new Date();
        const LOW_BATCH_QTY = 10;

        return {
            medicine,
            batches: batches.map((b) => ({
                id: b.id,
                batch_number: b.batch_number,
                supplier_name: b.suppliers?.name ?? null,
                expiry_date: b.expiry_date,
                quantity_received: b.quantity_received,
                quantity_available: b.quantity_available,
                cost_price: b.cost_price,
                selling_price: b.selling_price,
                is_expired: b.expiry_date < today,
                is_low_stock: b.quantity_available > 0 && b.quantity_available <= LOW_BATCH_QTY,
            })),
        };
    }

    // ---- Manually add a single batch to a medicine, outside the GRN flow ----
    async addBatch(medicineId: bigint, dto: AddBatchDto, userId: bigint, ip?: string) {
        const medicine = await this.prisma.medicines.findFirst({ where: { id: medicineId, is_deleted: false } });
        if (!medicine) throw new NotFoundException('Medicine not found');

        return this.prisma.$transaction(async (tx) => {
            const batch = await tx.stock_batches.create({
                data: {
                    medicine_id: medicineId,
                    supplier_id: dto.supplier_id ? BigInt(dto.supplier_id) : null,
                    batch_number: dto.batch_number,
                    expiry_date: new Date(dto.expiry_date),
                    quantity_received: dto.quantity,
                    quantity_available: dto.quantity,
                    cost_price: dto.cost_price,
                    selling_price: dto.selling_price,
                },
            });

            await tx.stock_movements.create({
                data: {
                    batch_id: batch.id,
                    medicine_id: medicineId,
                    movement_type: 'RECEIVE',
                    quantity_change: dto.quantity,
                    balance_after: dto.quantity,
                    reference_type: 'manual_batch',
                    reference_id: null,
                    user_id: userId,
                    notes: `Manually added batch ${dto.batch_number}`,
                },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'ADD_BATCH',
                    entity_type: 'stock_batches',
                    entity_id: batch.id,
                    new_values: JSON.stringify({ medicine_id: medicineId.toString(), batch_number: dto.batch_number, quantity: dto.quantity }),
                    ip_address: ip ?? null,
                },
            });

            return batch;
        });
    }

    // ---- Near-expiry report ----
    async getNearExpiry(days = 90) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + days);
        return this.prisma.stock_batches.findMany({
            where: {
                quantity_available: { gt: 0 },
                expiry_date: { lte: cutoff, gte: new Date() },
                is_deleted: false,
            },
            include: { medicines: true },
            orderBy: { expiry_date: 'asc' },
        });
    }

    // ---- THE FEFO DISPENSE (the crown jewel) ----
    async dispense(dto: DispenseDto, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            const results: any[] = [];

            for (const item of dto.items) {
                const medicineId = BigInt(item.medicine_id);
                let remaining = item.quantity;

                // Lock the available batches for this medicine, earliest expiry first.
                // Raw query with FOR UPDATE locks these rows so concurrent dispensers
                // cannot oversell the same stock.
                const batches: any[] = await tx.$queryRawUnsafe(
                    `SELECT id, batch_number, quantity_available, selling_price, expiry_date
           FROM stock_batches
           WHERE medicine_id = ?
             AND quantity_available > 0
             AND is_deleted = 0
             AND expiry_date >= CURDATE()
           ORDER BY expiry_date ASC
           FOR UPDATE`,
                    medicineId,
                );

                // Check total availability BEFORE deducting anything
                const totalAvailable = batches.reduce(
                    (sum, b) => sum + Number(b.quantity_available), 0,
                );
                if (totalAvailable < remaining) {
                    throw new BadRequestException(
                        `Insufficient stock for medicine ${item.medicine_id}. Need ${remaining}, have ${totalAvailable}`,
                    );
                }

                const dispensedFrom: any[] = [];

                // Walk batches earliest-expiry first, deducting until filled
                for (const batch of batches) {
                    if (remaining <= 0) break;

                    const take = Math.min(remaining, Number(batch.quantity_available));
                    const newBalance = Number(batch.quantity_available) - take;

                    await tx.stock_batches.update({
                        where: { id: BigInt(batch.id) },
                        data: { quantity_available: newBalance },
                    });

                    await tx.stock_movements.create({
                        data: {
                            batch_id: BigInt(batch.id),
                            medicine_id: medicineId,
                            movement_type: 'SALE',
                            quantity_change: -take,
                            balance_after: newBalance,
                            reference_type: 'dispense',
                            reference_id: null,
                            user_id: userId,
                            notes: `FEFO dispense from ${batch.batch_number}`,
                        },
                    });

                    dispensedFrom.push({
                        batch_number: batch.batch_number,
                        quantity: take,
                        unit_price: Number(batch.selling_price),
                        expiry_date: batch.expiry_date,
                    });

                    remaining -= take;
                }

                results.push({
                    medicine_id: item.medicine_id,
                    requested: item.quantity,
                    dispensed_from: dispensedFrom,
                });
            }

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'DISPENSE',
                    entity_type: 'pharmacy',
                    entity_id: null,
                    new_values: JSON.stringify({ items: dto.items.length }),
                    ip_address: ip ?? null,
                },
            });

            return results;
        });
    }

    listMedicines() {
        return this.prisma.medicines.findMany({
            where: { is_deleted: false, is_active: true },
            orderBy: { generic_name: 'asc' },
            select: { id: true, medicine_code: true, generic_name: true },
        });
    }

    // ============================================================
    // Medicine master data (Pharmacy "Manage Medicines" tab)
    // ============================================================

    listMedicinesFull() {
        return this.prisma.medicines.findMany({
            where: { is_deleted: false },
            orderBy: { generic_name: 'asc' },
            include: { medicine_categories: { select: { id: true, name: true } } },
        });
    }

    listMedicineCategories() {
        return this.prisma.medicine_categories.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
    }

    async createMedicine(dto: CreateMedicineDto) {
        const existing = await this.prisma.medicines.findFirst({
            where: { medicine_code: dto.medicine_code, is_deleted: false },
        });
        if (existing) throw new BadRequestException('A medicine with this code already exists');

        return this.prisma.medicines.create({
            data: {
                medicine_code: dto.medicine_code,
                generic_name: dto.generic_name,
                brand_name: dto.brand_name ?? null,
                category_id: dto.category_id ? BigInt(dto.category_id) : null,
                strength: dto.strength ?? null,
                unit: dto.unit ?? 'unit',
                reorder_level: dto.reorder_level ?? 0,
                default_selling_price: dto.default_selling_price ?? 0,
                is_active: dto.is_active ?? true,
            },
        });
    }

    async updateMedicine(id: bigint, dto: UpdateMedicineDto) {
        const medicine = await this.prisma.medicines.findFirst({ where: { id, is_deleted: false } });
        if (!medicine) throw new NotFoundException('Medicine not found');

        if (dto.medicine_code && dto.medicine_code !== medicine.medicine_code) {
            const existing = await this.prisma.medicines.findFirst({
                where: { medicine_code: dto.medicine_code, is_deleted: false, id: { not: id } },
            });
            if (existing) throw new BadRequestException('A medicine with this code already exists');
        }

        return this.prisma.medicines.update({
            where: { id },
            data: {
                ...(dto.medicine_code !== undefined && { medicine_code: dto.medicine_code }),
                ...(dto.generic_name !== undefined && { generic_name: dto.generic_name }),
                ...(dto.brand_name !== undefined && { brand_name: dto.brand_name || null }),
                ...(dto.category_id !== undefined && { category_id: dto.category_id ? BigInt(dto.category_id) : null }),
                ...(dto.strength !== undefined && { strength: dto.strength || null }),
                ...(dto.unit !== undefined && { unit: dto.unit }),
                ...(dto.reorder_level !== undefined && { reorder_level: dto.reorder_level }),
                ...(dto.default_selling_price !== undefined && { default_selling_price: dto.default_selling_price }),
                ...(dto.is_active !== undefined && { is_active: dto.is_active }),
            },
        });
    }

    listSuppliers() {
        return this.prisma.suppliers.findMany({
            where: { is_deleted: false, is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, supplier_code: true, name: true },
        });
    }

    // ============================================================
    // Supplier master data (Pharmacy "Manage Suppliers" tab)
    // ============================================================

    listSuppliersFull() {
        return this.prisma.suppliers.findMany({
            where: { is_deleted: false },
            orderBy: { name: 'asc' },
        });
    }

    private async generateSupplierCode(): Promise<string> {
        const last = await this.prisma.suppliers.findFirst({
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        const nextId = last ? Number(last.id) + 1 : 1;
        return 'SUP-' + String(nextId).padStart(4, '0');
    }

    async createSupplier(dto: CreateSupplierDto, userId: bigint, ip?: string) {
        const supplier_code = await this.generateSupplierCode();
        const supplier = await this.prisma.suppliers.create({
            data: {
                supplier_code,
                name: dto.name,
                contact_person: dto.contact_person ?? null,
                phone: dto.phone ?? null,
                email: dto.email ?? null,
                address: dto.address ?? null,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_SUPPLIER',
                entity_type: 'supplier',
                entity_id: supplier.id,
                new_values: JSON.stringify({ supplier_code, name: dto.name }),
                ip_address: ip ?? null,
            },
        });

        return supplier;
    }

    async updateSupplier(id: bigint, dto: UpdateSupplierDto, userId: bigint, ip?: string) {
        const existing = await this.prisma.suppliers.findFirst({ where: { id, is_deleted: false } });
        if (!existing) throw new NotFoundException('Supplier not found');

        const supplier = await this.prisma.suppliers.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.contact_person !== undefined && { contact_person: dto.contact_person || null }),
                ...(dto.phone !== undefined && { phone: dto.phone || null }),
                ...(dto.email !== undefined && { email: dto.email || null }),
                ...(dto.address !== undefined && { address: dto.address || null }),
                ...(dto.is_active !== undefined && { is_active: dto.is_active }),
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'UPDATE_SUPPLIER',
                entity_type: 'supplier',
                entity_id: id,
                new_values: JSON.stringify(dto),
                ip_address: ip ?? null,
            },
        });

        return supplier;
    }

    // ============================================================
    // In-house prescription fulfillment (Pharmacy "Patient Medicines" tab)
    // ============================================================

    // Patients with at least one undispensed prescription from a completed
    // visit — the queue a pharmacist picks from.
    async getPendingPatients(search?: string, page = 1, limit = 20) {
        const where: any = {
            is_deleted: false,
            prescriptions: {
                some: {
                    is_dispensed: false,
                    is_deleted: false,
                    consultations: { visits: { status: 'DONE' } },
                },
            },
        };
        if (search) {
            where.OR = [
                { full_name: { contains: search } },
                { patient_code: { contains: search } },
                { phone: { contains: search } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.patients.findMany({
                where,
                select: {
                    id: true,
                    patient_code: true,
                    full_name: true,
                    phone: true,
                    prescriptions: {
                        where: {
                            is_dispensed: false,
                            is_deleted: false,
                            consultations: { visits: { status: 'DONE' } },
                        },
                        select: { id: true },
                    },
                },
                orderBy: { id: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.patients.count({ where }),
        ]);

        return {
            data: data.map((p) => ({
                id: p.id,
                patient_code: p.patient_code,
                full_name: p.full_name,
                phone: p.phone,
                pending_count: p.prescriptions.length,
            })),
            total,
            page,
            limit,
        };
    }

    // A patient's undispensed prescriptions (from completed visits), with items.
    async getPatientPendingPrescriptions(patientId: bigint) {
        return this.prisma.prescriptions.findMany({
            where: {
                patient_id: patientId,
                is_dispensed: false,
                is_deleted: false,
                consultations: { visits: { status: 'DONE' } },
            },
            include: {
                doctors: true,
                prescription_items: { include: { medicines: true } },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    // Pharmacist marks one line item as added / pending / unavailable while working through the tray.
    async updateItemStatus(itemId: bigint, dto: UpdatePrescriptionItemStatusDto) {
        const item = await this.prisma.prescription_items.findUnique({
            where: { id: itemId },
            include: { prescriptions: true },
        });
        if (!item) throw new NotFoundException('Prescription item not found');
        if (item.prescriptions.is_dispensed) {
            throw new BadRequestException('This prescription has already been finalized');
        }
        return this.prisma.prescription_items.update({
            where: { id: itemId },
            data: { status: dto.status },
        });
    }

    // Pharmacist adjusts the quantity to actually dispense (e.g. partial pack,
    // or correcting the doctor's original figure) before finalizing.
    async updateItemQuantity(itemId: bigint, dto: UpdatePrescriptionItemQuantityDto) {
        const item = await this.prisma.prescription_items.findUnique({
            where: { id: itemId },
            include: { prescriptions: true },
        });
        if (!item) throw new NotFoundException('Prescription item not found');
        if (item.prescriptions.is_dispensed) {
            throw new BadRequestException('This prescription has already been finalized');
        }
        return this.prisma.prescription_items.update({
            where: { id: itemId },
            data: { quantity: dto.quantity },
        });
    }

    // Finalize: FEFO-deduct stock for every item marked ADDED, bill them on a
    // PENDING pharmacy invoice, and lock the prescription. Items left PENDING
    // or marked UNAVAILABLE are skipped — partial fulfillment is fine.
    async finalizePrescription(prescriptionId: bigint, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            const prescription = await tx.prescriptions.findUnique({
                where: { id: prescriptionId },
                include: { prescription_items: true, patients: true },
            });
            if (!prescription) throw new NotFoundException('Prescription not found');
            if (prescription.is_dispensed) {
                throw new BadRequestException('This prescription has already been finalized');
            }

            const addedItems = prescription.prescription_items.filter((i) => i.status === 'ADDED');
            if (addedItems.length === 0) {
                throw new BadRequestException('Mark at least one medicine as Added before finalizing');
            }

            const invoiceLines: {
                item_type: 'MEDICINE'; description: string; reference_id: bigint;
                batch_id: bigint; quantity: number; unit_price: number;
            }[] = [];

            for (const item of addedItems) {
                if (!item.medicine_id || !item.quantity) {
                    throw new BadRequestException(
                        `"${item.medicine_name}" has no linked stock medicine or quantity — cannot dispense`,
                    );
                }
                let remaining = item.quantity;

                const batches: any[] = await tx.$queryRawUnsafe(
                    `SELECT id, batch_number, quantity_available, selling_price
                     FROM stock_batches
                     WHERE medicine_id = ?
                       AND quantity_available > 0
                       AND is_deleted = 0
                       AND expiry_date >= CURDATE()
                     ORDER BY expiry_date ASC
                     FOR UPDATE`,
                    item.medicine_id,
                );

                const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_available), 0);
                if (totalAvailable < remaining) {
                    throw new BadRequestException(
                        `Insufficient stock for "${item.medicine_name}". Need ${remaining}, have ${totalAvailable}`,
                    );
                }

                for (const batch of batches) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, Number(batch.quantity_available));
                    const newBalance = Number(batch.quantity_available) - take;

                    await tx.stock_batches.update({
                        where: { id: BigInt(batch.id) },
                        data: { quantity_available: newBalance },
                    });
                    await tx.stock_movements.create({
                        data: {
                            batch_id: BigInt(batch.id),
                            medicine_id: item.medicine_id,
                            movement_type: 'SALE',
                            quantity_change: -take,
                            balance_after: newBalance,
                            reference_type: 'prescription',
                            reference_id: prescription.id,
                            user_id: userId,
                            notes: `Dispensed for prescription ${prescription.prescription_code}`,
                        },
                    });

                    invoiceLines.push({
                        item_type: 'MEDICINE',
                        description: `${item.medicine_name}${item.dose ? ` (${item.dose})` : ''}`,
                        reference_id: item.id,
                        batch_id: BigInt(batch.id),
                        quantity: take,
                        unit_price: Number(batch.selling_price),
                    });

                    remaining -= take;
                }
            }

            const subtotal = invoiceLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
            const invoiceCount = await tx.invoices.count();
            const invoiceNumber = 'INV-' + String(invoiceCount + 1).padStart(6, '0');

            const invoice = await tx.invoices.create({
                data: {
                    invoice_number: invoiceNumber,
                    patient_id: prescription.patient_id,
                    invoice_type: 'PHARMACY',
                    subtotal,
                    total: subtotal,
                    balance: subtotal,
                    payment_method: 'PENDING',
                    status: 'PENDING',
                    created_by: userId,
                    invoice_items: { create: invoiceLines.map((l) => ({ ...l, line_total: l.quantity * l.unit_price })) },
                },
                include: { invoice_items: true },
            });

            await tx.prescriptions.update({
                where: { id: prescription.id },
                data: { is_dispensed: true, invoice_id: invoice.id },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'FINALIZE_PRESCRIPTION',
                    entity_type: 'prescription',
                    entity_id: prescription.id,
                    new_values: JSON.stringify({
                        invoice_number: invoiceNumber,
                        items_dispensed: addedItems.length,
                        items_skipped: prescription.prescription_items.length - addedItems.length,
                    }),
                    ip_address: ip ?? null,
                },
            });

            return { ...invoice, prescription_code: prescription.prescription_code };
        });
    }
}