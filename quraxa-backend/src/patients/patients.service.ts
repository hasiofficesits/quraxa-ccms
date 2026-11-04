import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
    constructor(private prisma: PrismaService) { }

    // Generate the next patient_code like P-000001
    private async generatePatientCode(): Promise<string> {
        const last = await this.prisma.patients.findFirst({
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        const nextId = last ? Number(last.id) + 1 : 1;
        return 'P-' + String(nextId).padStart(6, '0');
    }

    // CREATE
    async create(dto: CreatePatientDto, userId: bigint, ip?: string) {
        const patient_code = await this.generatePatientCode();

        const patient = await this.prisma.patients.create({
            data: {
                patient_code,
                full_name: dto.full_name,
                nic: dto.nic ?? null,
                date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
                gender: dto.gender ?? null,
                phone: dto.phone ?? null,
                email: dto.email ?? null,
                address: dto.address ?? null,
                blood_group: dto.blood_group ?? null,
                guardian_name: dto.guardian_name ?? null,
                guardian_phone: dto.guardian_phone ?? null,
                guardian_relationship: dto.guardian_relationship ?? null,
                data_consent_given: dto.data_consent_given ?? false,
                data_consent_at: dto.data_consent_given ? new Date() : null,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_PATIENT',
                entity_type: 'patient',
                entity_id: patient.id,
                new_values: JSON.stringify({ patient_code, full_name: dto.full_name }),
                ip_address: ip ?? null,
            },
        });

        return patient;
    }

    // LIST with optional search + pagination
    async findAll(search?: string, page = 1, limit = 20) {
        const where: any = { is_deleted: false };

        if (search) {
            where.OR = [
                { full_name: { contains: search } },
                { nic: { contains: search } },
                { phone: { contains: search } },
                { patient_code: { contains: search } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.patients.findMany({
                where,
                orderBy: { id: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.patients.count({ where }),
        ]);

        return { data, total, page, limit };
    }

    // GET ONE
    async findOne(id: bigint) {
        const patient = await this.prisma.patients.findFirst({
            where: { id, is_deleted: false },
        });
        if (!patient) {
            throw new NotFoundException('Patient not found');
        }
        return patient;
    }

    // UPDATE
    async update(id: bigint, dto: UpdatePatientDto, userId: bigint, ip?: string) {
        await this.findOne(id); // throws if not found

        const patient = await this.prisma.patients.update({
            where: { id },
            data: {
                ...(dto.full_name !== undefined && { full_name: dto.full_name }),
                ...(dto.nic !== undefined && { nic: dto.nic }),
                ...(dto.date_of_birth !== undefined && {
                    date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
                }),
                ...(dto.gender !== undefined && { gender: dto.gender }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.email !== undefined && { email: dto.email }),
                ...(dto.address !== undefined && { address: dto.address }),
                ...(dto.blood_group !== undefined && { blood_group: dto.blood_group }),
                ...(dto.guardian_name !== undefined && { guardian_name: dto.guardian_name }),
                ...(dto.guardian_phone !== undefined && { guardian_phone: dto.guardian_phone }),
                ...(dto.guardian_relationship !== undefined && {
                    guardian_relationship: dto.guardian_relationship,
                }),
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'UPDATE_PATIENT',
                entity_type: 'patient',
                entity_id: id,
                new_values: JSON.stringify(dto),
                ip_address: ip ?? null,
            },
        });

        return patient;
    }

    // SOFT DELETE
    async remove(id: bigint, userId: bigint, ip?: string) {
        await this.findOne(id);

        await this.prisma.patients.update({
            where: { id },
            data: { is_deleted: true },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DELETE_PATIENT',
                entity_type: 'patient',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });

        return { message: 'Patient deleted' };
    }
}