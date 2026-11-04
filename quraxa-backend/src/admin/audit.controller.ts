import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
    constructor(private prisma: PrismaService) { }

    @Get()
    @RequirePermissions('audit.view')
    async list(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('action') action?: string,
        @Query('user_id') userId?: string,
    ) {
        const p = page ? parseInt(page) : 1;
        const l = limit ? parseInt(limit) : 30;
        const where: any = {};
        if (action) where.action = { contains: action };
        if (userId) where.user_id = BigInt(userId);

        const [data, total] = await Promise.all([
            this.prisma.audit_logs.findMany({
                where,
                include: { users: { select: { id: true, full_name: true, username: true } } },
                orderBy: { id: 'desc' },
                skip: (p - 1) * l,
                take: l,
            }),
            this.prisma.audit_logs.count({ where }),
        ]);

        return { data, total, page: p, limit: l };
    }

    // Distinct users who appear in the audit log — used to populate the
    // "User" filter dropdown without needing a separate user.view permission.
    @Get('users')
    @RequirePermissions('audit.view')
    async listUsers() {
        const userIds = await this.prisma.audit_logs.findMany({
            where: { user_id: { not: null } },
            select: { user_id: true },
            distinct: ['user_id'],
        });
        const ids = userIds.map((u) => u.user_id!).filter(Boolean);
        if (ids.length === 0) return [];
        return this.prisma.users.findMany({
            where: { id: { in: ids } },
            select: { id: true, full_name: true, username: true },
            orderBy: { full_name: 'asc' },
        });
    }
}
