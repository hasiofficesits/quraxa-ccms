import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REPORTS } from './reports.catalog';
import type { ReportColumn } from './export.service';

export interface ReportResult {
    columns: ReportColumn[];
    rows: Record<string, any>[];
}

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    listCatalog() {
        return REPORTS;
    }

    findDef(id: string) {
        const def = REPORTS.find((r) => r.id === id);
        if (!def) throw new BadRequestException('Unknown report');
        return def;
    }

    async run(id: string, filters: Record<string, string | undefined>): Promise<ReportResult> {
        switch (id) {
            case 'daily-appointments': return this.dailyAppointments(filters);
            case 'doctor-session-report': return this.doctorSessionReport(filters);
            case 'low-stock': return this.lowStock();
            case 'near-expiry': return this.nearExpiry(filters);
            case 'stock-movement': return this.stockMovement(filters);
            case 'expired-stock': return this.expiredStock();
            case 'best-selling-medicines': return this.bestSellingMedicines(filters);
            case 'revenue-by-period': return this.revenueByPeriod(filters);
            case 'doctor-commission': return this.doctorCommission(filters);
            case 'outstanding-invoices': return this.outstandingInvoices(filters);
            case 'top-doctors': return this.topDoctors(filters);
            case 'audit-log-report': return this.auditLogReport(filters);
            default: throw new BadRequestException('Unknown report');
        }
    }

    // ---- shared helpers ----

    private dateRange(startDate?: string, endDate?: string, fallbackDays = 30) {
        const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
        const start = startDate
            ? new Date(`${startDate}T00:00:00`)
            : new Date(end.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
        return { start, end };
    }

    private dateOnly(d: Date) {
        return d.toISOString().slice(0, 10);
    }

    private timeOnly(d: Date) {
        return d.toISOString().slice(11, 16);
    }

    private periodKey(d: Date, groupBy: string) {
        if (groupBy === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (groupBy === 'week') {
            const jan1 = new Date(d.getFullYear(), 0, 1);
            const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
            return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
        }
        return this.dateOnly(d);
    }

    // ---- Appointments & Sessions ----

    private async dailyAppointments(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const today = new Date().toISOString().slice(0, 10);
        const startStr = filters.start_date || today;
        const endStr = filters.end_date || startStr;
        const { start, end } = this.dateRange(startStr, endStr);

        const where: any = { doctor_sessions: { session_date: { gte: start, lte: end } } };
        if (filters.doctor_id) where.doctor_sessions.doctor_id = BigInt(filters.doctor_id);
        if (filters.status) where.status = filters.status;

        const appointments = await this.prisma.appointments.findMany({
            where,
            include: { patients: true, doctor_sessions: { include: { doctors: true } } },
            orderBy: [{ doctor_sessions: { session_date: 'asc' } }, { booking_number: 'asc' }],
        });

        const columns: ReportColumn[] = [
            { key: 'date', label: 'Date' }, { key: 'booking_ref', label: 'Booking Ref' },
            { key: 'patient', label: 'Patient' }, { key: 'doctor', label: 'Doctor' },
            { key: 'time', label: 'Time' }, { key: 'channel', label: 'Channel' }, { key: 'status', label: 'Status' },
        ];
        const rows = appointments.map((a) => ({
            date: this.dateOnly(a.doctor_sessions.session_date),
            booking_ref: a.booking_reference,
            patient: a.patients.full_name,
            doctor: a.doctor_sessions.doctors.full_name,
            time: `${this.timeOnly(a.doctor_sessions.start_time)}–${this.timeOnly(a.doctor_sessions.end_time)}`,
            channel: a.booking_channel,
            status: a.status,
        }));
        return { columns, rows };
    }

    private async doctorSessionReport(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const where: any = { session_date: { gte: start, lte: end } };
        if (filters.doctor_id) where.doctor_id = BigInt(filters.doctor_id);

        const sessions = await this.prisma.doctor_sessions.findMany({
            where,
            include: { doctors: true, rooms: true, _count: { select: { appointments: true } } },
            orderBy: [{ session_date: 'asc' }, { start_time: 'asc' }],
        });

        const columns: ReportColumn[] = [
            { key: 'date', label: 'Date' }, { key: 'doctor', label: 'Doctor' }, { key: 'room', label: 'Room' },
            { key: 'time', label: 'Time' }, { key: 'booked', label: 'Booked' }, { key: 'capacity', label: 'Capacity' },
            { key: 'fill_rate', label: 'Fill Rate' }, { key: 'status', label: 'Status' },
        ];
        const rows = sessions.map((s) => ({
            date: this.dateOnly(s.session_date),
            doctor: s.doctors.full_name,
            room: s.rooms?.room_number ?? '-',
            time: `${this.timeOnly(s.start_time)}–${this.timeOnly(s.end_time)}`,
            booked: s._count.appointments,
            capacity: s.max_patients,
            fill_rate: s.max_patients > 0 ? `${Math.round((s._count.appointments / s.max_patients) * 100)}%` : '-',
            status: s.status,
        }));
        return { columns, rows };
    }

    // ---- Pharmacy & Inventory ----

    private async lowStock(): Promise<ReportResult> {
        const medicines = await this.prisma.medicines.findMany({
            where: { is_deleted: false },
            include: {
                stock_batches: { where: { quantity_available: { gt: 0 }, expiry_date: { gte: new Date() }, is_deleted: false } },
            },
        });

        const columns: ReportColumn[] = [
            { key: 'code', label: 'Code' }, { key: 'name', label: 'Medicine' },
            { key: 'available', label: 'Available' }, { key: 'reorder_level', label: 'Reorder Level' },
        ];
        const rows = medicines
            .map((m) => ({ code: m.medicine_code, name: m.generic_name, available: m.stock_batches.reduce((s, b) => s + b.quantity_available, 0), reorder_level: m.reorder_level }))
            .filter((r) => r.available <= r.reorder_level)
            .sort((a, b) => a.available - b.available);
        return { columns, rows };
    }

    private async nearExpiry(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const days = filters.days ? parseInt(filters.days) : 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + (Number.isFinite(days) ? days : 90));

        const batches = await this.prisma.stock_batches.findMany({
            where: { quantity_available: { gt: 0 }, expiry_date: { lte: cutoff, gte: new Date() }, is_deleted: false },
            include: { medicines: true },
            orderBy: { expiry_date: 'asc' },
        });

        const columns: ReportColumn[] = [
            { key: 'medicine', label: 'Medicine' }, { key: 'batch_number', label: 'Batch #' },
            { key: 'expiry_date', label: 'Expiry Date' }, { key: 'quantity_available', label: 'Quantity' },
        ];
        const rows = batches.map((b) => ({
            medicine: b.medicines.generic_name, batch_number: b.batch_number,
            expiry_date: this.dateOnly(b.expiry_date), quantity_available: b.quantity_available,
        }));
        return { columns, rows };
    }

    private async stockMovement(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const where: any = { created_at: { gte: start, lte: end } };
        if (filters.medicine_id) where.medicine_id = BigInt(filters.medicine_id);
        if (filters.movement_type) where.movement_type = filters.movement_type;

        const movements = await this.prisma.stock_movements.findMany({
            where,
            include: { medicines: true, stock_batches: true, users: true },
            orderBy: { created_at: 'desc' },
            take: 2000,
        });

        const columns: ReportColumn[] = [
            { key: 'date', label: 'Date' }, { key: 'medicine', label: 'Medicine' }, { key: 'batch', label: 'Batch #' },
            { key: 'type', label: 'Type' }, { key: 'change', label: 'Change' }, { key: 'balance_after', label: 'Balance After' },
            { key: 'reference', label: 'Reference' }, { key: 'user', label: 'User' },
        ];
        const rows = movements.map((m) => ({
            date: m.created_at.toISOString().slice(0, 19).replace('T', ' '),
            medicine: m.medicines.generic_name, batch: m.stock_batches.batch_number, type: m.movement_type,
            change: m.quantity_change, balance_after: m.balance_after,
            reference: m.reference_type ?? '-', user: m.users?.full_name ?? '-',
        }));
        return { columns, rows };
    }

    private async expiredStock(): Promise<ReportResult> {
        const batches = await this.prisma.stock_batches.findMany({
            where: { quantity_available: { gt: 0 }, expiry_date: { lt: new Date() }, is_deleted: false },
            include: { medicines: true },
            orderBy: { expiry_date: 'asc' },
        });

        const columns: ReportColumn[] = [
            { key: 'medicine', label: 'Medicine' }, { key: 'batch_number', label: 'Batch #' },
            { key: 'expiry_date', label: 'Expired On' }, { key: 'quantity_wasted', label: 'Quantity Wasted' },
            { key: 'cost_price', label: 'Unit Cost' }, { key: 'estimated_loss', label: 'Estimated Loss' },
        ];
        const rows = batches.map((b) => {
            const cost = Number(b.cost_price);
            return {
                medicine: b.medicines.generic_name, batch_number: b.batch_number,
                expiry_date: this.dateOnly(b.expiry_date), quantity_wasted: b.quantity_available,
                cost_price: cost.toFixed(2), estimated_loss: (cost * b.quantity_available).toFixed(2),
            };
        });
        return { columns, rows };
    }

    private async bestSellingMedicines(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const items = await this.prisma.invoice_items.findMany({
            where: {
                item_type: 'MEDICINE',
                invoices: { created_at: { gte: start, lte: end }, status: { not: 'CANCELLED' }, is_deleted: false },
            },
            select: { description: true, reference_id: true, quantity: true, line_total: true },
        });

        const map = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const it of items) {
            const key = it.reference_id ? it.reference_id.toString() : it.description;
            const entry = map.get(key) ?? { name: it.description, qty: 0, revenue: 0 };
            entry.qty += it.quantity;
            entry.revenue += Number(it.line_total);
            map.set(key, entry);
        }

        const columns: ReportColumn[] = [
            { key: 'rank', label: 'Rank' }, { key: 'medicine', label: 'Medicine' },
            { key: 'quantity_sold', label: 'Quantity Sold' }, { key: 'revenue', label: 'Revenue' },
        ];
        const rows = [...map.values()]
            .sort((a, b) => b.qty - a.qty)
            .map((v, i) => ({ rank: i + 1, medicine: v.name, quantity_sold: v.qty, revenue: v.revenue.toFixed(2) }));
        return { columns, rows };
    }

    // ---- Financial ----

    private async revenueByPeriod(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const groupBy = filters.group_by || 'day';
        const where: any = { status: 'PAID', created_at: { gte: start, lte: end }, is_deleted: false };
        if (filters.invoice_type) where.invoice_type = filters.invoice_type;

        const invoices = await this.prisma.invoices.findMany({ where, select: { total: true, created_at: true } });

        const buckets = new Map<string, { revenue: number; count: number }>();
        for (const inv of invoices) {
            const key = this.periodKey(inv.created_at, groupBy);
            const b = buckets.get(key) ?? { revenue: 0, count: 0 };
            b.revenue += Number(inv.total);
            b.count += 1;
            buckets.set(key, b);
        }

        const columns: ReportColumn[] = [
            { key: 'period', label: 'Period' }, { key: 'invoice_count', label: 'Invoices' }, { key: 'revenue', label: 'Revenue' },
        ];
        const rows = [...buckets.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, v]) => ({ period, invoice_count: v.count, revenue: v.revenue.toFixed(2) }));
        return { columns, rows };
    }

    private async doctorCommission(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const where: any = { created_at: { gte: start, lte: end } };
        if (filters.doctor_id) where.doctor_id = BigInt(filters.doctor_id);
        if (filters.payment_status) where.payment_status = filters.payment_status;

        const payments = await this.prisma.doctor_payments.findMany({
            where, include: { doctors: true }, orderBy: { created_at: 'desc' },
        });

        const columns: ReportColumn[] = [
            { key: 'payment_number', label: 'Payment #' }, { key: 'doctor', label: 'Doctor' },
            { key: 'period', label: 'Period' }, { key: 'patients', label: 'Patients' },
            { key: 'gross_amount', label: 'Gross Amount' }, { key: 'commission_rate', label: 'Commission %' },
            { key: 'doctor_share', label: 'Doctor Share' }, { key: 'hospital_share', label: 'Hospital Share' },
            { key: 'status', label: 'Status' }, { key: 'paid_at', label: 'Paid At' },
        ];
        const rows = payments.map((p) => ({
            payment_number: p.payment_number, doctor: p.doctors.full_name,
            period: `${p.period_start ? this.dateOnly(p.period_start) : '-'} to ${p.period_end ? this.dateOnly(p.period_end) : '-'}`,
            patients: p.total_patients, gross_amount: Number(p.gross_amount).toFixed(2),
            commission_rate: p.commission_rate ? Number(p.commission_rate).toFixed(2) : '-',
            doctor_share: Number(p.doctor_share).toFixed(2), hospital_share: Number(p.hospital_share).toFixed(2),
            status: p.payment_status, paid_at: p.paid_at ? this.dateOnly(p.paid_at) : '-',
        }));
        return { columns, rows };
    }

    private async outstandingInvoices(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const where: any = { status: { in: ['PENDING', 'PARTIAL'] }, is_deleted: false };
        if (filters.start_date || filters.end_date) {
            const { start, end } = this.dateRange(filters.start_date, filters.end_date);
            where.created_at = { gte: start, lte: end };
        }

        const invoices = await this.prisma.invoices.findMany({
            where, include: { patients: true }, orderBy: { created_at: 'desc' },
        });

        const columns: ReportColumn[] = [
            { key: 'invoice_number', label: 'Invoice #' }, { key: 'patient', label: 'Patient' },
            { key: 'type', label: 'Type' }, { key: 'total', label: 'Total' }, { key: 'paid', label: 'Paid' },
            { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' },
        ];
        const rows = invoices.map((i) => ({
            invoice_number: i.invoice_number, patient: i.patients?.full_name ?? 'Walk-in', type: i.invoice_type,
            total: Number(i.total).toFixed(2), paid: Number(i.paid_amount).toFixed(2), balance: Number(i.balance).toFixed(2),
            status: i.status, date: this.dateOnly(i.created_at),
        }));
        return { columns, rows };
    }

    // ---- Performance ----

    private async topDoctors(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);

        const sessions = await this.prisma.doctor_sessions.findMany({
            where: { session_date: { gte: start, lte: end } },
            include: { doctors: true, _count: { select: { appointments: true } } },
        });

        const payments = await this.prisma.doctor_payments.groupBy({
            by: ['doctor_id'],
            where: { created_at: { gte: start, lte: end } },
            _sum: { gross_amount: true },
        });
        const revenueByDoctor = new Map(payments.map((p) => [p.doctor_id.toString(), Number(p._sum.gross_amount ?? 0)]));

        const byDoctor = new Map<string, { name: string; sessions: number; patients: number }>();
        for (const s of sessions) {
            const key = s.doctor_id.toString();
            const entry = byDoctor.get(key) ?? { name: s.doctors.full_name, sessions: 0, patients: 0 };
            entry.sessions += 1;
            entry.patients += s._count.appointments;
            byDoctor.set(key, entry);
        }

        const columns: ReportColumn[] = [
            { key: 'rank', label: 'Rank' }, { key: 'doctor', label: 'Doctor' }, { key: 'sessions', label: 'Sessions' },
            { key: 'patients_seen', label: 'Patients Booked' }, { key: 'gross_revenue', label: 'Gross Revenue' },
        ];
        const rows = [...byDoctor.entries()]
            .map(([doctorId, v]) => ({ doctorId, ...v, revenue: revenueByDoctor.get(doctorId) ?? 0 }))
            .sort((a, b) => b.patients - a.patients)
            .map((v, i) => ({
                rank: i + 1, doctor: v.name, sessions: v.sessions, patients_seen: v.patients,
                gross_revenue: v.revenue.toFixed(2),
            }));
        return { columns, rows };
    }

    // ---- Security & Compliance ----

    private async auditLogReport(filters: Record<string, string | undefined>): Promise<ReportResult> {
        const { start, end } = this.dateRange(filters.start_date, filters.end_date);
        const where: any = { created_at: { gte: start, lte: end } };
        if (filters.user_id) where.user_id = BigInt(filters.user_id);
        if (filters.action) where.action = { contains: filters.action };

        const logs = await this.prisma.audit_logs.findMany({
            where, include: { users: true }, orderBy: { created_at: 'desc' }, take: 2000,
        });

        const columns: ReportColumn[] = [
            { key: 'date', label: 'When' }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action' },
            { key: 'entity', label: 'Entity' }, { key: 'ip', label: 'IP Address' },
        ];
        const rows = logs.map((l) => ({
            date: l.created_at.toISOString().slice(0, 19).replace('T', ' '),
            user: l.users ? `${l.users.full_name} (${l.users.username})` : 'System',
            action: l.action,
            entity: l.entity_type ? `${l.entity_type}${l.entity_id ? ` #${l.entity_id}` : ''}` : '-',
            ip: l.ip_address ?? '-',
        }));
        return { columns, rows };
    }
}
