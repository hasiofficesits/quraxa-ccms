import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsService {
    constructor(private prisma: PrismaService) { }

    findAll() {
        return this.prisma.rooms.findMany({
            where: { is_active: true },
            orderBy: { room_number: 'asc' },
        });
    }

    async create(room_number: string, name: string | undefined, userId: bigint, ip?: string) {
        const room = await this.prisma.rooms.create({
            data: { room_number, name: name ?? null },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_ROOM',
                entity_type: 'room',
                entity_id: room.id,
                new_values: JSON.stringify({ room_number, name }),
                ip_address: ip ?? null,
            },
        });
        return room;
    }

    async remove(id: bigint, userId: bigint, ip?: string) {
        const found = await this.prisma.rooms.findUnique({ where: { id } });
        if (!found) throw new NotFoundException('Room not found');
        const updated = await this.prisma.rooms.update({
            where: { id },
            data: { is_active: false },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DEACTIVATE_ROOM',
                entity_type: 'room',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });
        return updated;
    }
}