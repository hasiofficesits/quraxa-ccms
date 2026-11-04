import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

@Injectable()
export class HolidaysService {
    constructor(private prisma: PrismaService) { }

    // Public list — every logged-in user sees these on the Dashboard calendar,
    // so no permission gate beyond being authenticated.
    list(year?: string) {
        const where: any = { is_active: true };
        if (year) {
            const y = Number(year);
            where.date = { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) };
        }
        return this.prisma.holidays.findMany({ where, orderBy: { date: 'asc' } });
    }

    listFull() {
        return this.prisma.holidays.findMany({ orderBy: { date: 'desc' } });
    }

    async create(dto: CreateHolidayDto, userId: bigint, ip?: string) {
        const existing = await this.prisma.holidays.findUnique({ where: { date: new Date(dto.date) } });
        if (existing) throw new ConflictException('A holiday is already recorded for this date');

        const holiday = await this.prisma.holidays.create({
            data: { date: new Date(dto.date), name: dto.name, type: dto.type ?? 'PUBLIC' },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'CREATE_HOLIDAY', entity_type: 'holiday', entity_id: holiday.id,
                new_values: JSON.stringify(dto), ip_address: ip ?? null,
            },
        });

        return holiday;
    }

    async update(id: bigint, dto: UpdateHolidayDto, userId: bigint, ip?: string) {
        const existing = await this.prisma.holidays.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Holiday not found');

        if (dto.date) {
            const clash = await this.prisma.holidays.findUnique({ where: { date: new Date(dto.date) } });
            if (clash && clash.id !== id) throw new ConflictException('A holiday is already recorded for this date');
        }

        const holiday = await this.prisma.holidays.update({
            where: { id },
            data: {
                ...(dto.date !== undefined && { date: new Date(dto.date) }),
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.type !== undefined && { type: dto.type }),
                ...(dto.is_active !== undefined && { is_active: dto.is_active }),
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'UPDATE_HOLIDAY', entity_type: 'holiday', entity_id: id,
                new_values: JSON.stringify(dto), ip_address: ip ?? null,
            },
        });

        return holiday;
    }

    async remove(id: bigint, userId: bigint, ip?: string) {
        const existing = await this.prisma.holidays.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Holiday not found');

        await this.prisma.holidays.delete({ where: { id } });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'DELETE_HOLIDAY', entity_type: 'holiday', entity_id: id,
                old_values: JSON.stringify({ name: existing.name, date: existing.date }), ip_address: ip ?? null,
            },
        });

        return { message: 'Holiday removed' };
    }
}
