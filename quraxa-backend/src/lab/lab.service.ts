import {
    Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadReportDto } from './dto/upload-report.dto';

export const LAB_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'lab-reports');

const TEST_ORDER_INCLUDE = {
    patients: { select: { id: true, full_name: true, patient_code: true, phone: true } },
    diagnostic_tests: { select: { id: true, name: true, test_code: true } },
    consultations: { select: { doctors: { select: { full_name: true } } } },
} as const;

@Injectable()
export class LabService {
    constructor(private prisma: PrismaService) {
        fs.mkdirSync(LAB_UPLOAD_DIR, { recursive: true });
    }

    // Everything still awaiting sample collection or a report upload —
    // searchable and filterable by status, same shape as getCompleted().
    async getQueue(search?: string, status?: 'ORDERED' | 'SAMPLE_COLLECTED', page = 1, limit = 20) {
        const where: any = { status: status ? status : { in: ['ORDERED', 'SAMPLE_COLLECTED'] } };
        if (search) {
            where.OR = [
                { patients: { full_name: { contains: search } } },
                { patients: { patient_code: { contains: search } } },
                { diagnostic_tests: { name: { contains: search } } },
            ];
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.test_orders.findMany({
                where,
                include: TEST_ORDER_INCLUDE,
                orderBy: { ordered_at: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.test_orders.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    // Completed/cancelled reports, searchable — the lab's own history/archive view.
    async getCompleted(search?: string, status?: 'COMPLETED' | 'CANCELLED', page = 1, limit = 20) {
        const where: any = { status: status ? status : { in: ['COMPLETED', 'CANCELLED'] } };
        if (search) {
            where.OR = [
                { patients: { full_name: { contains: search } } },
                { patients: { patient_code: { contains: search } } },
                { diagnostic_tests: { name: { contains: search } } },
            ];
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.test_orders.findMany({
                where,
                include: TEST_ORDER_INCLUDE,
                orderBy: { completed_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.test_orders.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    async markSampleCollected(id: bigint, userId: bigint, ip?: string) {
        const order = await this.prisma.test_orders.findUnique({ where: { id } });
        if (!order) throw new NotFoundException('Test order not found');
        if (order.status !== 'ORDERED') {
            throw new BadRequestException('Only orders awaiting sample collection can be marked collected');
        }

        const updated = await this.prisma.test_orders.update({
            where: { id },
            data: { status: 'SAMPLE_COLLECTED', sample_collected_at: new Date() },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'LAB_SAMPLE_COLLECTED', entity_type: 'test_order',
                entity_id: id, ip_address: ip ?? null,
            },
        });

        return updated;
    }

    async uploadReport(id: bigint, file: Express.Multer.File, dto: UploadReportDto, userId: bigint, ip?: string) {
        const order = await this.prisma.test_orders.findUnique({ where: { id } });
        if (!order) throw new NotFoundException('Test order not found');
        if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
            throw new BadRequestException('This test order is already closed');
        }
        if (!file) throw new BadRequestException('Report file is required');

        // Delete a previously uploaded file for this order, if any (shouldn't
        // normally happen since a completed order can't be re-uploaded to).
        if (order.report_file_path) {
            fs.unlink(path.join(LAB_UPLOAD_DIR, order.report_file_path), () => { });
        }

        const updated = await this.prisma.test_orders.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                completed_at: new Date(),
                result_notes: dto.result_notes ?? order.result_notes,
                report_file_path: file.filename,
                report_file_name: file.originalname,
                uploaded_by: userId,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'LAB_REPORT_UPLOADED', entity_type: 'test_order',
                entity_id: id, ip_address: ip ?? null,
            },
        });

        return updated;
    }

    async cancel(id: bigint, userId: bigint, ip?: string) {
        const order = await this.prisma.test_orders.findUnique({ where: { id } });
        if (!order) throw new NotFoundException('Test order not found');
        if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
            throw new BadRequestException('This test order is already closed');
        }

        const updated = await this.prisma.test_orders.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'LAB_ORDER_CANCELLED', entity_type: 'test_order',
                entity_id: id, ip_address: ip ?? null,
            },
        });

        return updated;
    }

    // Report download is shared between lab staff and doctors — checked
    // manually here since the permissions guard only supports AND-of-all.
    async getDownloadInfo(id: bigint, userPermissions: string[]) {
        const canAccess = userPermissions.includes('lab.view') || userPermissions.includes('consultation.view');
        if (!canAccess) throw new ForbiddenException('Insufficient permissions');

        const order = await this.prisma.test_orders.findUnique({ where: { id } });
        if (!order || !order.report_file_path) throw new NotFoundException('Report not found');

        return {
            filePath: path.join(LAB_UPLOAD_DIR, order.report_file_path),
            fileName: order.report_file_name ?? order.report_file_path,
        };
    }
}
