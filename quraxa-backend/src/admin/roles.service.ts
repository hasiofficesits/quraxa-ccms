import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

const RECOVERY_PERMISSION = 'role.manage';

@Injectable()
export class RolesService {
    constructor(private prisma: PrismaService) { }

    async list() {
        const roles = await this.prisma.roles.findMany({
            include: {
                role_permissions: { include: { permissions: true } },
                _count: { select: { users: true } },
            },
            orderBy: { id: 'asc' },
        });
        return roles.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            is_system: r.is_system,
            is_active: r.is_active,
            user_count: r._count.users,
            permissions: r.role_permissions.map((rp) => ({ id: rp.permissions.id, code: rp.permissions.code, module: rp.permissions.module })),
        }));
    }

    async listPermissions() {
        const permissions = await this.prisma.permissions.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
        const grouped: Record<string, typeof permissions> = {};
        for (const p of permissions) {
            (grouped[p.module] ??= []).push(p);
        }
        return grouped;
    }

    async create(dto: CreateRoleDto, userId: bigint, ip?: string) {
        const existing = await this.prisma.roles.findUnique({ where: { name: dto.name } });
        if (existing) throw new BadRequestException('A role with this name already exists');

        const role = await this.prisma.roles.create({
            data: { name: dto.name, description: dto.description ?? null, is_system: false },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_ROLE',
                entity_type: 'role',
                entity_id: role.id,
                new_values: JSON.stringify(dto),
                ip_address: ip ?? null,
            },
        });

        return role;
    }

    async update(id: bigint, dto: UpdateRoleDto, userId: bigint, ip?: string) {
        const role = await this.prisma.roles.findUnique({ where: { id } });
        if (!role) throw new NotFoundException('Role not found');

        if (role.is_system && dto.name !== undefined && dto.name !== role.name) {
            throw new BadRequestException('Built-in role names cannot be changed');
        }
        if (dto.name && dto.name !== role.name) {
            const existing = await this.prisma.roles.findUnique({ where: { name: dto.name } });
            if (existing) throw new BadRequestException('A role with this name already exists');
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.roles.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.is_active !== undefined && { is_active: dto.is_active }),
                },
            });

            if (dto.is_active === false) {
                await this.assertRecoveryPermissionRetained(tx);
            }

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'UPDATE_ROLE',
                    entity_type: 'role',
                    entity_id: id,
                    new_values: JSON.stringify(dto),
                    ip_address: ip ?? null,
                },
            });

            return updated;
        });
    }

    async remove(id: bigint, userId: bigint, ip?: string) {
        const role = await this.prisma.roles.findUnique({
            where: { id },
            include: { _count: { select: { users: true } } },
        });
        if (!role) throw new NotFoundException('Role not found');
        if (role.is_system) throw new BadRequestException('Built-in roles cannot be deleted');
        if (role._count.users > 0) {
            throw new BadRequestException('This role still has users assigned — reassign them first');
        }
        await this.prisma.roles.delete({ where: { id } });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DELETE_ROLE',
                entity_type: 'role',
                entity_id: id,
                old_values: JSON.stringify({ name: role.name }),
                ip_address: ip ?? null,
            },
        });

        return { message: 'Role deleted' };
    }

    async updatePermissions(id: bigint, dto: UpdateRolePermissionsDto, userId: bigint, ip?: string) {
        const role = await this.prisma.roles.findUnique({ where: { id } });
        if (!role) throw new NotFoundException('Role not found');

        const uniqueIds = [...new Set(dto.permission_ids)].map((n) => BigInt(n));
        if (uniqueIds.length > 0) {
            const found = await this.prisma.permissions.count({ where: { id: { in: uniqueIds } } });
            if (found !== uniqueIds.length) throw new BadRequestException('One or more permissions are invalid');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.role_permissions.deleteMany({ where: { role_id: id } });
            if (uniqueIds.length > 0) {
                await tx.role_permissions.createMany({
                    data: uniqueIds.map((permission_id) => ({ role_id: id, permission_id })),
                });
            }
            await this.assertRecoveryPermissionRetained(tx);

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'UPDATE_ROLE_PERMISSIONS',
                    entity_type: 'role',
                    entity_id: id,
                    new_values: JSON.stringify({ permission_ids: dto.permission_ids }),
                    ip_address: ip ?? null,
                },
            });
        });

        return this.findOneWithPermissions(id);
    }

    private async findOneWithPermissions(id: bigint) {
        const role = await this.prisma.roles.findUnique({
            where: { id },
            include: { role_permissions: { include: { permissions: true } }, _count: { select: { users: true } } },
        });
        if (!role) throw new NotFoundException('Role not found');
        return {
            id: role.id,
            name: role.name,
            description: role.description,
            is_system: role.is_system,
            is_active: role.is_active,
            user_count: role._count.users,
            permissions: role.role_permissions.map((rp) => ({ id: rp.permissions.id, code: rp.permissions.code, module: rp.permissions.module })),
        };
    }

    private async assertRecoveryPermissionRetained(tx: any) {
        const count = await tx.users.count({
            where: {
                is_active: true,
                roles: { is_active: true, role_permissions: { some: { permissions: { code: RECOVERY_PERMISSION } } } },
            },
        });
        if (count === 0) {
            throw new BadRequestException(
                'This change would leave no active user able to manage users and roles — cancelled to prevent a lockout.',
            );
        }
    }
}
