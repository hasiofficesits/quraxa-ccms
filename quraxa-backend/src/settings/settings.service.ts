import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) { }

    // Singleton row (id 1) — created by the initial migration/seed insert;
    // upsert here just guards against a fresh database that skipped it.
    getBusinessSettings() {
        return this.prisma.business_settings.upsert({
            where: { id: 1 },
            update: {},
            create: { id: 1 },
        });
    }

    async updateBusinessSettings(dto: UpdateBusinessSettingsDto, userId: bigint, ip?: string) {
        const updated = await this.prisma.business_settings.upsert({
            where: { id: 1 },
            update: { ...dto },
            create: { id: 1, ...dto },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'UPDATE_BUSINESS_SETTINGS', entity_type: 'business_settings', entity_id: 1n,
                new_values: JSON.stringify(dto), ip_address: ip ?? null,
            },
        });

        return updated;
    }
}
