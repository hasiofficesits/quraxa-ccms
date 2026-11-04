import {
    Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsurerDto } from './dto/create-insurer.dto';
import { UpdateInsurerDto } from './dto/update-insurer.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';

export const CLAIM_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'insurance-claims');

const CLAIM_INCLUDE = {
    patients: { select: { id: true, full_name: true, patient_code: true, phone: true } },
    insurers: { select: { id: true, name: true, insurer_code: true } },
    invoices: { select: { id: true, invoice_number: true, total: true, status: true } },
    documents: { orderBy: { created_at: 'desc' as const } },
} as const;

// Claim status transitions this internal (no-third-party-integration) workflow
// allows — staff record what happened after dealing with the insurer offline.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['PAID', 'CANCELLED'],
    REJECTED: ['SUBMITTED', 'CANCELLED'],
    PAID: [],
    CANCELLED: [],
};

@Injectable()
export class InsuranceService {
    constructor(private prisma: PrismaService) {
        fs.mkdirSync(CLAIM_UPLOAD_DIR, { recursive: true });
    }

    // ============================================================
    // Insurers (admin-managed list, mirrors Pharmacy's Suppliers pattern)
    // ============================================================

    listInsurers() {
        return this.prisma.insurers.findMany({
            where: { is_deleted: false, is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, insurer_code: true, name: true },
        });
    }

    listInsurersFull() {
        return this.prisma.insurers.findMany({
            where: { is_deleted: false },
            orderBy: { name: 'asc' },
        });
    }

    private async generateInsurerCode(): Promise<string> {
        const last = await this.prisma.insurers.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
        const nextId = last ? Number(last.id) + 1 : 1;
        return 'INS-' + String(nextId).padStart(4, '0');
    }

    async createInsurer(dto: CreateInsurerDto, userId: bigint, ip?: string) {
        const insurer_code = await this.generateInsurerCode();
        const insurer = await this.prisma.insurers.create({
            data: {
                insurer_code,
                name: dto.name,
                contact_person: dto.contact_person ?? null,
                phone: dto.phone ?? null,
                email: dto.email ?? null,
                address: dto.address ?? null,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'CREATE_INSURER', entity_type: 'insurer', entity_id: insurer.id,
                new_values: JSON.stringify({ insurer_code, name: dto.name }), ip_address: ip ?? null,
            },
        });

        return insurer;
    }

    async updateInsurer(id: bigint, dto: UpdateInsurerDto, userId: bigint, ip?: string) {
        const existing = await this.prisma.insurers.findFirst({ where: { id, is_deleted: false } });
        if (!existing) throw new NotFoundException('Insurer not found');

        const insurer = await this.prisma.insurers.update({
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
                user_id: userId, action: 'UPDATE_INSURER', entity_type: 'insurer', entity_id: id,
                new_values: JSON.stringify(dto), ip_address: ip ?? null,
            },
        });

        return insurer;
    }

    // ============================================================
    // Invoices available to attach a claim to (search by number/patient)
    // ============================================================

    async searchInvoices(search: string) {
        if (!search || search.trim().length < 2) return [];
        return this.prisma.invoices.findMany({
            where: {
                is_deleted: false,
                OR: [
                    { invoice_number: { contains: search } },
                    { patients: { full_name: { contains: search } } },
                    { patients: { patient_code: { contains: search } } },
                ],
            },
            select: {
                id: true, invoice_number: true, total: true, status: true, created_at: true,
                patients: { select: { id: true, full_name: true, patient_code: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 20,
        });
    }

    // ============================================================
    // Claims
    // ============================================================

    async getClaims(search?: string, status?: string, page = 1, limit = 20) {
        const where: any = { is_deleted: false };
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { claim_number: { contains: search } },
                { policy_number: { contains: search } },
                { patients: { full_name: { contains: search } } },
                { patients: { patient_code: { contains: search } } },
                { invoices: { invoice_number: { contains: search } } },
            ];
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.insurance_claims.findMany({
                where, include: CLAIM_INCLUDE, orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit, take: limit,
            }),
            this.prisma.insurance_claims.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    getClaim(id: bigint) {
        return this.prisma.insurance_claims.findFirst({ where: { id, is_deleted: false }, include: CLAIM_INCLUDE });
    }

    private async generateClaimNumber(): Promise<string> {
        const last = await this.prisma.insurance_claims.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
        const nextId = last ? Number(last.id) + 1 : 1;
        return 'CLM-' + String(nextId).padStart(6, '0');
    }

    async createClaim(dto: CreateClaimDto, userId: bigint, ip?: string) {
        const invoiceId = BigInt(dto.invoice_id);
        const insurerId = BigInt(dto.insurer_id);

        const invoice = await this.prisma.invoices.findFirst({ where: { id: invoiceId, is_deleted: false } });
        if (!invoice) throw new NotFoundException('Invoice not found');
        if (!invoice.patient_id) throw new BadRequestException('This invoice has no patient attached');

        const insurer = await this.prisma.insurers.findFirst({ where: { id: insurerId, is_deleted: false } });
        if (!insurer) throw new NotFoundException('Insurer not found');

        const claim_number = await this.generateClaimNumber();
        const claim = await this.prisma.insurance_claims.create({
            data: {
                claim_number,
                invoice_id: invoiceId,
                patient_id: invoice.patient_id,
                insurer_id: insurerId,
                policy_number: dto.policy_number,
                claimed_amount: dto.claimed_amount,
                notes: dto.notes ?? null,
                status: 'DRAFT',
                created_by: userId,
            },
            include: CLAIM_INCLUDE,
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'CREATE_INSURANCE_CLAIM', entity_type: 'insurance_claim', entity_id: claim.id,
                new_values: JSON.stringify({ claim_number, invoice_id: dto.invoice_id, claimed_amount: dto.claimed_amount }),
                ip_address: ip ?? null,
            },
        });

        return claim;
    }

    async updateClaim(id: bigint, dto: UpdateClaimDto, userId: bigint, ip?: string) {
        const claim = await this.prisma.insurance_claims.findFirst({ where: { id, is_deleted: false } });
        if (!claim) throw new NotFoundException('Claim not found');
        if (claim.status !== 'DRAFT') {
            throw new BadRequestException('Only a claim still in Draft can be edited — submit it, or cancel and refile');
        }

        const updated = await this.prisma.insurance_claims.update({
            where: { id },
            data: {
                ...(dto.policy_number !== undefined && { policy_number: dto.policy_number }),
                ...(dto.claimed_amount !== undefined && { claimed_amount: dto.claimed_amount }),
                ...(dto.notes !== undefined && { notes: dto.notes || null }),
            },
            include: CLAIM_INCLUDE,
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'UPDATE_INSURANCE_CLAIM', entity_type: 'insurance_claim', entity_id: id,
                new_values: JSON.stringify(dto), ip_address: ip ?? null,
            },
        });

        return updated;
    }

    async updateStatus(id: bigint, dto: UpdateClaimStatusDto, userId: bigint, ip?: string) {
        const claim = await this.prisma.insurance_claims.findFirst({ where: { id, is_deleted: false } });
        if (!claim) throw new NotFoundException('Claim not found');

        const allowed = ALLOWED_TRANSITIONS[claim.status] ?? [];
        if (!allowed.includes(dto.status)) {
            throw new ConflictException(`Cannot move a ${claim.status} claim to ${dto.status}`);
        }
        if (dto.status === 'APPROVED' && !dto.approved_amount) {
            throw new BadRequestException('Approved amount is required when approving a claim');
        }
        if (dto.status === 'REJECTED' && !dto.rejection_reason) {
            throw new BadRequestException('A rejection reason is required');
        }

        const now = new Date();
        const data: any = { status: dto.status };
        if (dto.status === 'SUBMITTED') { data.submitted_at = now; data.rejection_reason = null; }
        if (dto.status === 'APPROVED') { data.approved_amount = dto.approved_amount; data.decided_at = now; data.rejection_reason = null; }
        if (dto.status === 'REJECTED') { data.rejection_reason = dto.rejection_reason; data.decided_at = now; }
        if (dto.status === 'PAID') data.paid_at = now;

        const updated = await this.prisma.insurance_claims.update({ where: { id }, data, include: CLAIM_INCLUDE });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'UPDATE_INSURANCE_CLAIM_STATUS', entity_type: 'insurance_claim', entity_id: id,
                new_values: JSON.stringify({ status: dto.status }), ip_address: ip ?? null,
            },
        });

        return updated;
    }

    // ============================================================
    // Supporting documents
    // ============================================================

    async addDocument(claimId: bigint, file: Express.Multer.File, userId: bigint, ip?: string) {
        const claim = await this.prisma.insurance_claims.findFirst({ where: { id: claimId, is_deleted: false } });
        if (!claim) throw new NotFoundException('Claim not found');
        if (!file) throw new BadRequestException('A file is required');

        const doc = await this.prisma.insurance_claim_documents.create({
            data: {
                claim_id: claimId,
                file_path: file.filename,
                file_name: file.originalname,
                uploaded_by: userId,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'UPLOAD_INSURANCE_CLAIM_DOCUMENT', entity_type: 'insurance_claim', entity_id: claimId,
                ip_address: ip ?? null,
            },
        });

        return doc;
    }

    async getDocumentDownloadInfo(claimId: bigint, docId: bigint) {
        const doc = await this.prisma.insurance_claim_documents.findFirst({
            where: { id: docId, claim_id: claimId },
        });
        if (!doc) throw new NotFoundException('Document not found');
        return { filePath: path.join(CLAIM_UPLOAD_DIR, doc.file_path), fileName: doc.file_name };
    }

    async removeDocument(claimId: bigint, docId: bigint, userId: bigint, ip?: string) {
        const doc = await this.prisma.insurance_claim_documents.findFirst({ where: { id: docId, claim_id: claimId } });
        if (!doc) throw new NotFoundException('Document not found');

        await this.prisma.insurance_claim_documents.delete({ where: { id: docId } });
        fs.unlink(path.join(CLAIM_UPLOAD_DIR, doc.file_path), () => { });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'DELETE_INSURANCE_CLAIM_DOCUMENT', entity_type: 'insurance_claim', entity_id: claimId,
                ip_address: ip ?? null,
            },
        });

        return { message: 'Document removed' };
    }
}
