import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SettleDoctorDto } from './dto/settle-doctor.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { WalkInSaleDto } from './dto/walk-in-sale.dto';
import { SettleEmployeeDto } from './dto/settle-employee.dto';

@Injectable()
export class BillingService {
    constructor(private prisma: PrismaService) { }

    // Create an invoice with line items, compute totals
    async createInvoice(dto: CreateInvoiceDto, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            const count = await tx.invoices.count();
            const invoiceNumber = 'INV-' + String(count + 1).padStart(6, '0');

            // Compute subtotal from line items
            const subtotal = dto.items.reduce(
                (sum, item) => sum + item.quantity * item.unit_price,
                0,
            );
            const discount = dto.discount ?? 0;
            const tax = dto.tax ?? 0;
            const total = subtotal - discount + tax;

            // Payment: if method is provided and not PENDING, treat as paid in full
            const isPaid = dto.payment_method && dto.payment_method !== 'PENDING';
            const paidAmount = isPaid ? total : 0;
            const balance = total - paidAmount;
            const status = balance <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

            const invoice = await tx.invoices.create({
                data: {
                    invoice_number: invoiceNumber,
                    patient_id: dto.patient_id ? BigInt(dto.patient_id) : null,
                    visit_id: dto.visit_id ? BigInt(dto.visit_id) : null,
                    invoice_type: dto.invoice_type,
                    subtotal,
                    discount,
                    tax,
                    total,
                    paid_amount: paidAmount,
                    balance,
                    payment_method: (dto.payment_method ?? 'CASH') as any,
                    status: status as any,
                    created_by: userId,
                    invoice_items: {
                        create: dto.items.map((item) => ({
                            item_type: item.item_type,
                            description: item.description,
                            reference_id: item.reference_id ? BigInt(item.reference_id) : null,
                            batch_id: item.batch_id ? BigInt(item.batch_id) : null,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            line_total: item.quantity * item.unit_price,
                        })),
                    },
                },
                include: { invoice_items: true },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'CREATE_INVOICE',
                    entity_type: 'invoice',
                    entity_id: invoice.id,
                    new_values: JSON.stringify({ invoice_number: invoiceNumber, total }),
                    ip_address: ip ?? null,
                },
            });

            return invoice;
        });
    }

    async getInvoice(id: bigint) {
        const invoice = await this.prisma.invoices.findFirst({
            where: { id, is_deleted: false },
            include: {
                invoice_items: true,
                patients: true,
                prescriptions: {
                    include: { doctors: true, prescription_items: true },
                },
            },
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        return invoice;
    }

    async listInvoices(status?: string) {
        const where: any = { is_deleted: false };
        if (status) where.status = status;
        return this.prisma.invoices.findMany({
            where,
            // prescriptions presence distinguishes Inpatient (pharmacist-finalized)
            // from Walk-in sales for the frontend's source filter.
            include: { patients: true, prescriptions: { select: { id: true } } },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
    }

    // Invoices produced by the pharmacist finalizing a prescription, still
    // awaiting payment — the "Inpatient Invoices" queue. Once fully paid, an
    // invoice drops out of here and shows up in the regular Invoices list.
    async getInpatientInvoices(search?: string, page = 1, limit = 20) {
        const where: any = {
            is_deleted: false,
            invoice_type: 'PHARMACY',
            status: { not: 'PAID' },
            prescriptions: { some: {} },
        };
        if (search) {
            where.OR = [
                { invoice_number: { contains: search } },
                { patients: { full_name: { contains: search } } },
                { patients: { patient_code: { contains: search } } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.invoices.findMany({
                where,
                include: {
                    patients: true,
                    prescriptions: { select: { prescription_code: true, doctors: { select: { full_name: true } } } },
                },
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.invoices.count({ where }),
        ]);

        return { data, total, page, limit };
    }

    // Record a payment against an invoice — supports partial payments across
    // multiple calls; flips to PAID once the balance is fully covered.
    async payInvoice(id: bigint, dto: PayInvoiceDto, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            const invoice = await tx.invoices.findFirst({ where: { id, is_deleted: false } });
            if (!invoice) throw new NotFoundException('Invoice not found');
            if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already fully paid');
            if (invoice.status === 'CANCELLED') throw new BadRequestException('Invoice is cancelled');

            const currentPaid = Number(invoice.paid_amount);
            const total = Number(invoice.total);
            const newPaid = currentPaid + dto.amount;
            if (newPaid - total > 0.01) {
                throw new BadRequestException(
                    `Payment of ${dto.amount.toFixed(2)} exceeds the remaining balance of ${(total - currentPaid).toFixed(2)}`,
                );
            }
            const newBalance = Math.max(0, total - newPaid);
            const status = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';

            const updated = await tx.invoices.update({
                where: { id },
                data: {
                    paid_amount: newPaid,
                    balance: newBalance,
                    status,
                    payment_method: dto.payment_method,
                },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'PAY_INVOICE',
                    entity_type: 'invoice',
                    entity_id: id,
                    new_values: JSON.stringify({
                        amount: dto.amount,
                        payment_method: dto.payment_method,
                        reference: dto.reference ?? null,
                        new_status: status,
                    }),
                    ip_address: ip ?? null,
                },
            });

            return updated;
        });
    }

    // Auto-calculated settlement figures for a session, shown before paying
    // so the user can review/adjust them without creating a record yet.
    async previewDoctorSettlement(sessionId: bigint) {
        const session = await this.prisma.doctor_sessions.findUnique({
            where: { id: sessionId },
            include: { doctors: true },
        });
        if (!session) throw new NotFoundException('Session not found');

        const existing = await this.prisma.doctor_payments.findFirst({
            where: { session_id: sessionId, payment_status: { not: 'CANCELLED' } },
        });

        const totalPatients = await this.prisma.visits.count({
            where: { session_id: sessionId, status: 'DONE' },
        });
        const channelFee = Number(session.channel_fee);
        const gross = totalPatients * channelFee;
        const rate = session.commission_rate
            ? Number(session.commission_rate)
            : Number(session.doctors.default_commission_rate);
        const doctorShare = Math.round(gross * rate) / 100;
        const hospitalShare = Math.round(gross * (100 - rate)) / 100;

        return {
            session_id: session.id.toString(),
            doctor_name: session.doctors.full_name,
            session_date: session.session_date,
            already_settled: !!existing,
            existing_payment: existing,
            total_patients: totalPatients,
            channel_fee: channelFee,
            gross_amount: gross,
            commission_rate: rate,
            doctor_share: doctorShare,
            hospital_share: hospitalShare,
        };
    }

    // Settle a doctor's commission for a session. The figures come from the
    // client (pre-filled from previewDoctorSettlement, possibly edited by the
    // user) and are persisted exactly as confirmed; the originally-calculated
    // figures are kept alongside in the audit log so any adjustment is traceable.
    async settleDoctor(dto: SettleDoctorDto, userId: bigint, ip?: string) {
        const sessionId = BigInt(dto.session_id);

        return this.prisma.$transaction(async (tx) => {
            const session = await tx.doctor_sessions.findUnique({
                where: { id: sessionId },
                include: { doctors: true },
            });
            if (!session) throw new NotFoundException('Session not found');

            // Prevent double settlement
            const existing = await tx.doctor_payments.findFirst({
                where: { session_id: sessionId, payment_status: { not: 'CANCELLED' } },
            });
            if (existing) {
                throw new BadRequestException('This session is already settled');
            }

            // Recalculate independently on the server — used only for the
            // audit trail, never trusted over the DB for what gets billed.
            const calcTotalPatients = await tx.visits.count({
                where: { session_id: sessionId, status: 'DONE' },
            });
            const calcChannelFee = Number(session.channel_fee);
            const calcGross = calcTotalPatients * calcChannelFee;
            const calcRate = session.commission_rate
                ? Number(session.commission_rate)
                : Number(session.doctors.default_commission_rate);
            const calcDoctorShare = Math.round(calcGross * calcRate) / 100;
            const calcHospitalShare = Math.round(calcGross * (100 - calcRate)) / 100;

            const count = await tx.doctor_payments.count();
            const paymentNumber = 'DP-' + String(count + 1).padStart(6, '0');

            const payment = await tx.doctor_payments.create({
                data: {
                    payment_number: paymentNumber,
                    doctor_id: session.doctor_id,
                    session_id: sessionId,
                    total_patients: dto.total_patients,
                    channel_fee: dto.channel_fee,
                    gross_amount: dto.gross_amount,
                    commission_rate: dto.commission_rate,
                    doctor_share: dto.doctor_share,
                    hospital_share: dto.hospital_share,
                    payment_status: 'PENDING',
                    payment_method: dto.payment_method ?? null,
                    notes: dto.notes ?? null,
                    processed_by: userId,
                    period_start: session.session_date,
                    period_end: session.session_date,
                },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'SETTLE_DOCTOR',
                    entity_type: 'doctor_payment',
                    entity_id: payment.id,
                    old_values: JSON.stringify({
                        calculated: {
                            total_patients: calcTotalPatients,
                            channel_fee: calcChannelFee,
                            gross_amount: calcGross,
                            commission_rate: calcRate,
                            doctor_share: calcDoctorShare,
                            hospital_share: calcHospitalShare,
                        },
                    }),
                    new_values: JSON.stringify({
                        payment_number: paymentNumber,
                        confirmed: {
                            total_patients: dto.total_patients,
                            channel_fee: dto.channel_fee,
                            gross_amount: dto.gross_amount,
                            commission_rate: dto.commission_rate,
                            doctor_share: dto.doctor_share,
                            hospital_share: dto.hospital_share,
                        },
                    }),
                    ip_address: ip ?? null,
                },
            });

            return payment;
        });
    }

    // Mark a doctor payment as paid
    async markDoctorPaid(id: bigint) {
        const payment = await this.prisma.doctor_payments.findUnique({ where: { id } });
        if (!payment) throw new NotFoundException('Payment not found');
        return this.prisma.doctor_payments.update({
            where: { id },
            data: { payment_status: 'PAID', paid_at: new Date() },
        });
    }

    // ============================================================
    // Walk-in pharmacy sales (Billing "New Invoice" tab)
    // ============================================================

    // Medicines with stock, non-expired, sorted FEFO — used by the walk-in
    // "Add Medicine" picker. selling_price is the earliest-expiry batch's
    // price (i.e. what FEFO would actually charge), shown as a default.
    async listMedicinesForSale() {
        const medicines = await this.prisma.medicines.findMany({
            where: { is_deleted: false, is_active: true },
            include: {
                stock_batches: {
                    where: { quantity_available: { gt: 0 }, expiry_date: { gte: new Date() }, is_deleted: false },
                    orderBy: { expiry_date: 'asc' },
                },
            },
            orderBy: { generic_name: 'asc' },
        });

        return medicines
            .map((m) => {
                const batches = m.stock_batches;
                const available = batches.reduce((sum, b) => sum + b.quantity_available, 0);
                return {
                    id: m.id,
                    medicine_code: m.medicine_code,
                    generic_name: m.generic_name,
                    brand_name: m.brand_name,
                    strength: m.strength,
                    available_quantity: available,
                    selling_price: batches[0] ? Number(batches[0].selling_price) : 0,
                };
            })
            .filter((m) => m.available_quantity > 0);
    }

    // Active diagnostic tests for the walk-in "Add Test" picker.
    async listTestsForSale() {
        return this.prisma.diagnostic_tests.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
    }

    // FEFO-deducts stock for a walk-in sale and bills it on the spot —
    // unlike a prescription, there's no doctor record to finalize against.
    // Diagnostic tests are billed alongside medicines but don't touch stock.
    async sellWalkIn(dto: WalkInSaleDto, userId: bigint, ip?: string) {
        const items = dto.items ?? [];
        const tests = dto.tests ?? [];
        const services = dto.services ?? [];
        if (items.length === 0 && tests.length === 0 && services.length === 0) {
            throw new BadRequestException('Add at least one medicine, test or service');
        }

        return this.prisma.$transaction(async (tx) => {
            const invoiceLines: {
                item_type: 'MEDICINE' | 'TEST' | 'HOSPITAL_FEE' | 'CONSULTATION' | 'OTHER';
                description: string; reference_id?: bigint;
                batch_id?: bigint; quantity: number; unit_price: number; line_total: number;
            }[] = [];

            for (const svc of services) {
                const quantity = svc.quantity ?? 1;
                invoiceLines.push({
                    item_type: svc.item_type ?? 'OTHER',
                    description: svc.description,
                    quantity,
                    unit_price: svc.unit_price,
                    line_total: quantity * svc.unit_price,
                });
            }

            for (const testItem of tests) {
                const testId = BigInt(testItem.test_id);
                const test = await tx.diagnostic_tests.findUnique({ where: { id: testId } });
                if (!test) throw new NotFoundException(`Test ${testItem.test_id} not found`);

                const quantity = testItem.quantity ?? 1;
                const unitPrice = testItem.unit_price ?? Number(test.price);

                invoiceLines.push({
                    item_type: 'TEST',
                    description: test.name,
                    reference_id: testId,
                    quantity,
                    unit_price: unitPrice,
                    line_total: quantity * unitPrice,
                });
            }

            for (const item of items) {
                const medicineId = BigInt(item.medicine_id);
                const medicine = await tx.medicines.findUnique({ where: { id: medicineId } });
                if (!medicine) throw new NotFoundException(`Medicine ${item.medicine_id} not found`);

                let remaining = item.quantity;
                const batches: any[] = await tx.$queryRawUnsafe(
                    `SELECT id, batch_number, quantity_available
                     FROM stock_batches
                     WHERE medicine_id = ?
                       AND quantity_available > 0
                       AND is_deleted = 0
                       AND expiry_date >= CURDATE()
                     ORDER BY expiry_date ASC
                     FOR UPDATE`,
                    medicineId,
                );

                const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_available), 0);
                if (totalAvailable < remaining) {
                    throw new BadRequestException(
                        `Insufficient stock for "${medicine.generic_name}". Need ${remaining}, have ${totalAvailable}`,
                    );
                }

                const description = `${medicine.generic_name}${item.dose ? ` (${item.dose})` : ''}`;

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
                            reference_type: 'walk_in_sale',
                            reference_id: null,
                            user_id: userId,
                            notes: `Walk-in sale from ${batch.batch_number}`,
                        },
                    });

                    invoiceLines.push({
                        item_type: 'MEDICINE',
                        description,
                        reference_id: medicineId,
                        batch_id: BigInt(batch.id),
                        quantity: take,
                        unit_price: item.unit_price,
                        line_total: take * item.unit_price,
                    });

                    remaining -= take;
                }
            }

            const subtotal = invoiceLines.reduce((sum, l) => sum + l.line_total, 0);
            const isPaid = dto.payment_method && dto.payment_method !== 'PENDING';
            const paidAmount = isPaid ? subtotal : 0;
            const balance = subtotal - paidAmount;
            const status = balance <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

            const count = await tx.invoices.count();
            const invoiceNumber = 'INV-' + String(count + 1).padStart(6, '0');

            const invoice = await tx.invoices.create({
                data: {
                    invoice_number: invoiceNumber,
                    patient_id: dto.patient_id ? BigInt(dto.patient_id) : null,
                    invoice_type: 'PHARMACY',
                    subtotal,
                    total: subtotal,
                    paid_amount: paidAmount,
                    balance,
                    payment_method: (dto.payment_method ?? 'CASH') as any,
                    status: status as any,
                    created_by: userId,
                    invoice_items: { create: invoiceLines },
                },
                include: { invoice_items: true },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'WALK_IN_SALE',
                    entity_type: 'invoice',
                    entity_id: invoice.id,
                    new_values: JSON.stringify({
                        invoice_number: invoiceNumber, medicines: items.length, tests: tests.length, total: subtotal,
                    }),
                    ip_address: ip ?? null,
                },
            });

            return invoice;
        });
    }

    // ============================================================
    // Employee salary settlements (Salary Settlements "Employee" tab)
    // ============================================================

    async listEmployees() {
        return this.prisma.users.findMany({
            where: { is_active: true },
            select: { id: true, full_name: true, username: true, roles: { select: { name: true } } },
            orderBy: { full_name: 'asc' },
        });
    }

    async settleEmployee(dto: SettleEmployeeDto, userId: bigint, ip?: string) {
        const count = await this.prisma.employee_payments.count();
        const paymentNumber = 'EP-' + String(count + 1).padStart(6, '0');

        const payment = await this.prisma.employee_payments.create({
            data: {
                payment_number: paymentNumber,
                user_id: BigInt(dto.user_id),
                amount: dto.amount,
                period_start: dto.period_start ? new Date(dto.period_start) : null,
                period_end: dto.period_end ? new Date(dto.period_end) : null,
                payment_method: dto.payment_method ?? null,
                payment_status: 'PENDING',
                notes: dto.notes ?? null,
                processed_by: userId,
            },
            include: { employee: { select: { full_name: true } } },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'SETTLE_EMPLOYEE',
                entity_type: 'employee_payment',
                entity_id: payment.id,
                new_values: JSON.stringify({ payment_number: paymentNumber, user_id: dto.user_id, amount: dto.amount }),
                ip_address: ip ?? null,
            },
        });

        return payment;
    }

    async listEmployeePayments() {
        return this.prisma.employee_payments.findMany({
            include: { employee: { select: { full_name: true, username: true } } },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
    }

    async markEmployeePaid(id: bigint) {
        const payment = await this.prisma.employee_payments.findUnique({ where: { id } });
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.payment_status === 'PAID') throw new BadRequestException('Already paid');
        return this.prisma.employee_payments.update({
            where: { id },
            data: { payment_status: 'PAID', paid_at: new Date() },
        });
    }
}