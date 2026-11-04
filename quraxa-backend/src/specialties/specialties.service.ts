import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpecialtiesService {
    constructor(private prisma: PrismaService) { }

    findAll() {
        return this.prisma.specialties.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
    }

    async create(name: string, userId: bigint, ip?: string) {
        const specialty = await this.prisma.specialties.create({ data: { name } });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_SPECIALTY',
                entity_type: 'specialty',
                entity_id: specialty.id,
                new_values: JSON.stringify({ name }),
                ip_address: ip ?? null,
            },
        });
        return specialty;
    }

    async remove(id: bigint, userId: bigint, ip?: string) {
        const found = await this.prisma.specialties.findUnique({ where: { id } });
        if (!found) throw new NotFoundException('Specialty not found');
        // soft-disable rather than delete (doctors may reference it)
        const updated = await this.prisma.specialties.update({
            where: { id },
            data: { is_active: false },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DEACTIVATE_SPECIALTY',
                entity_type: 'specialty',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });
        return updated;
    }
}