import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
    constructor(private prisma: PrismaService) { }

    private async generateDoctorCode(): Promise<string> {
        const last = await this.prisma.doctors.findFirst({
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        const nextId = last ? Number(last.id) + 1 : 1;
        return 'D-' + String(nextId).padStart(3, '0');
    }

    async create(dto: CreateDoctorDto, userId: bigint, ip?: string) {
        const doctor_code = await this.generateDoctorCode();
        const doctor = await this.prisma.doctors.create({
            data: {
                doctor_code,
                full_name: dto.full_name,
                specialty_id: BigInt(dto.specialty_id),
                nic: dto.nic ?? null,
                phone: dto.phone ?? null,
                email: dto.email ?? null,
                gender: dto.gender ?? null,
                default_commission_rate: dto.default_commission_rate ?? 70.0,
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_DOCTOR',
                entity_type: 'doctor',
                entity_id: doctor.id,
                new_values: JSON.stringify({ doctor_code, full_name: dto.full_name }),
                ip_address: ip ?? null,
            },
        });

        return doctor;
    }

    async findAll(search?: string) {
        const where: any = { is_deleted: false };
        if (search) {
            where.OR = [
                { full_name: { contains: search } },
                { doctor_code: { contains: search } },
            ];
        }
        return this.prisma.doctors.findMany({
            where,
            include: { specialties: true },
            orderBy: { id: 'desc' },
        });
    }

    async findOne(id: bigint) {
        const doctor = await this.prisma.doctors.findFirst({
            where: { id, is_deleted: false },
            include: { specialties: true },
        });
        if (!doctor) throw new NotFoundException('Doctor not found');
        return doctor;
    }

    async update(id: bigint, dto: UpdateDoctorDto, userId: bigint, ip?: string) {
        await this.findOne(id); // throws if not found

        const doctor = await this.prisma.doctors.update({
            where: { id },
            data: {
                ...(dto.full_name !== undefined && { full_name: dto.full_name }),
                ...(dto.specialty_id !== undefined && { specialty_id: BigInt(dto.specialty_id) }),
                ...(dto.nic !== undefined && { nic: dto.nic }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.email !== undefined && { email: dto.email }),
                ...(dto.gender !== undefined && { gender: dto.gender }),
                ...(dto.default_commission_rate !== undefined && {
                    default_commission_rate: dto.default_commission_rate,
                }),
            },
            include: { specialties: true },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'UPDATE_DOCTOR',
                entity_type: 'doctor',
                entity_id: id,
                new_values: JSON.stringify(dto),
                ip_address: ip ?? null,
            },
        });

        return doctor;
    }

    async remove(id: bigint, userId: bigint, ip?: string) {
        await this.findOne(id);
        await this.prisma.doctors.update({
            where: { id },
            data: { is_deleted: true },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DELETE_DOCTOR',
                entity_type: 'doctor',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });
        return { message: 'Doctor deleted' };
    }
}