import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// The 5 admin-managed dropdown lists used by the Pharmacy medicine form
// (strength, unit) and the Consultation prescription form (dose, frequency,
// duration). Each is a plain {id, name, is_active} table — see comment on
// the models in schema.prisma for why there's no FK back to medicines /
// prescription_items.
const MODEL_MAP: Record<string, string> = {
    strengths: 'medicine_strengths',
    units: 'medicine_units',
    doses: 'prescription_doses',
    frequencies: 'prescription_frequencies',
    durations: 'prescription_durations',
};

@Injectable()
export class LookupsService {
    constructor(private prisma: PrismaService) { }

    private model(type: string) {
        const modelName = MODEL_MAP[type];
        if (!modelName) throw new BadRequestException(`Unknown lookup type "${type}"`);
        return (this.prisma as any)[modelName];
    }

    list(type: string, includeInactive = false) {
        const where = includeInactive ? {} : { is_active: true };
        return this.model(type).findMany({ where, orderBy: { name: 'asc' } });
    }

    async create(type: string, name: string, userId: bigint, ip?: string) {
        const trimmed = name?.trim();
        if (!trimmed) throw new BadRequestException('Name is required');

        const model = this.model(type);
        const existing = await model.findUnique({ where: { name: trimmed } });
        if (existing) {
            if (existing.is_active) throw new BadRequestException('This value already exists');
            // Re-adding something that was previously retired — just reactivate it.
            return model.update({ where: { id: existing.id }, data: { is_active: true } });
        }

        const created = await model.create({ data: { name: trimmed } });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: `CREATE_LOOKUP_${type.toUpperCase()}`,
                entity_type: 'lookup',
                entity_id: created.id,
                new_values: JSON.stringify({ type, name: trimmed }),
                ip_address: ip ?? null,
            },
        });
        return created;
    }

    async setActive(type: string, id: bigint, isActive: boolean, userId: bigint, ip?: string) {
        const model = this.model(type);
        const existing = await model.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Value not found');

        const updated = await model.update({ where: { id }, data: { is_active: isActive } });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: isActive ? `ACTIVATE_LOOKUP_${type.toUpperCase()}` : `DEACTIVATE_LOOKUP_${type.toUpperCase()}`,
                entity_type: 'lookup',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });
        return updated;
    }
}
