import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';

// The one permission that lets someone fix broken user/role access. Any
// mutation that could remove the last holder of this permission is rejected
// — a self-lockout is worse than a blocked request.
const RECOVERY_PERMISSION = 'role.manage';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        private prisma: PrismaService,
        private messaging: MessagingService,
    ) { }

    async list(search?: string, page = 1, limit = 20) {
        const where: any = {};
        if (search) {
            where.OR = [
                { full_name: { contains: search } },
                { username: { contains: search } },
                { email: { contains: search } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.users.findMany({
                where,
                include: { roles: true, doctors: true },
                orderBy: { id: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.users.count({ where }),
        ]);
        return { data: data.map((u) => this.serialize(u)), total, page, limit };
    }

    async findOne(id: bigint) {
        const user = await this.prisma.users.findUnique({
            where: { id },
            include: { roles: true, doctors: true },
        });
        if (!user) throw new NotFoundException('User not found');
        return this.serialize(user);
    }

    // Lightweight role list for the user create/edit form's dropdown — kept
    // separate from RolesService.list() so creating a user doesn't require
    // the (more sensitive) role.manage permission.
    async listRoles() {
        return this.prisma.roles.findMany({
            where: { is_active: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }

    // Doctors not yet linked to a login account — plus, when editing, the
    // doctor currently linked to THIS user (so it still shows as selected).
    async listLinkableDoctors(currentUserId?: bigint) {
        return this.prisma.doctors.findMany({
            where: {
                is_deleted: false,
                OR: currentUserId
                    ? [{ user_id: null }, { user_id: currentUserId }]
                    : [{ user_id: null }],
            },
            select: { id: true, doctor_code: true, full_name: true, email: true, phone: true },
            orderBy: { full_name: 'asc' },
        });
    }

    async create(dto: CreateUserDto, actingUserId: bigint, ip?: string) {
        const [existingUsername, existingEmail] = await Promise.all([
            this.prisma.users.findUnique({ where: { username: dto.username } }),
            this.prisma.users.findUnique({ where: { email: dto.email } }),
        ]);
        if (existingUsername) throw new BadRequestException('Username is already taken');
        if (existingEmail) throw new BadRequestException('Email is already in use');

        const role = await this.prisma.roles.findFirst({ where: { id: BigInt(dto.role_id), is_active: true } });
        if (!role) throw new BadRequestException('Invalid or inactive role');

        let doctor: { id: bigint } | null = null;
        if (dto.doctor_id) {
            doctor = await this.prisma.doctors.findFirst({
                where: { id: BigInt(dto.doctor_id), is_deleted: false },
                select: { id: true, user_id: true },
            }) as any;
            if (!doctor) throw new NotFoundException('Doctor profile not found');
            if ((doctor as any).user_id) throw new BadRequestException('This doctor profile is already linked to another user');
        }

        const password_hash = await bcrypt.hash(dto.password, 10);

        const created = await this.prisma.$transaction(async (tx) => {
            const user = await tx.users.create({
                data: {
                    role_id: BigInt(dto.role_id),
                    full_name: dto.full_name,
                    username: dto.username,
                    email: dto.email,
                    password_hash,
                    phone: dto.phone ?? null,
                },
            });

            if (doctor) {
                await tx.doctors.update({ where: { id: doctor.id }, data: { user_id: user.id } });
            }

            await tx.audit_logs.create({
                data: {
                    user_id: actingUserId,
                    action: 'CREATE_USER',
                    entity_type: 'user',
                    entity_id: user.id,
                    new_values: JSON.stringify({ username: dto.username, role_id: dto.role_id }),
                    ip_address: ip ?? null,
                },
            });

            return user;
        });

        this.sendCredentialsEmail(created, dto.password, actingUserId);

        return this.findOne(created.id);
    }

    // Fire-and-forget, same pattern as SessionsService's doctor notification —
    // account creation shouldn't wait on an SMTP round-trip. MessagingService
    // already logs every attempt (sent/failed) to message_logs regardless.
    private sendCredentialsEmail(user: { id: bigint; full_name: string; email: string; username: string }, plainPassword: string, actingUserId: bigint) {
        const messageBody =
            `Hello ${user.full_name},\n\n` +
            `An account has been created for you on QuraXa.\n\n` +
            `Username: ${user.username}\n` +
            `Temporary Password: ${plainPassword}\n\n` +
            `To get started:\n` +
            `1. Go to the QuraXa login page.\n` +
            `2. Sign in using the username and temporary password above.\n` +
            `3. You will be prompted to set your own password before you can continue — ` +
            `this is required and only takes a moment.\n` +
            `4. Once set, use your new password to sign in from then on.\n\n` +
            `If you did not expect this account, please contact your administrator.\n\n` +
            `— QuraXa`;

        this.messaging.sendEmail({
            to: user.email,
            subject: 'Your QuraXa account has been created',
            message: messageBody,
            recipientType: 'user',
            recipientId: user.id,
            recipientName: user.full_name,
            entityType: 'user',
            entityId: user.id,
            userId: actingUserId,
        }).catch((err) => this.logger.error(`Account-creation email failed: ${err?.message ?? err}`));
    }

    async update(id: bigint, dto: UpdateUserDto, actingUserId: bigint, ip?: string) {
        const user = await this.prisma.users.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        if (dto.email && dto.email !== user.email) {
            const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
            if (existing) throw new BadRequestException('Email is already in use');
        }

        if (dto.role_id !== undefined) {
            const role = await this.prisma.roles.findFirst({ where: { id: BigInt(dto.role_id), is_active: true } });
            if (!role) throw new BadRequestException('Invalid or inactive role');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.users.update({
                where: { id },
                data: {
                    ...(dto.full_name !== undefined && { full_name: dto.full_name }),
                    ...(dto.email !== undefined && { email: dto.email }),
                    ...(dto.phone !== undefined && { phone: dto.phone }),
                    ...(dto.role_id !== undefined && { role_id: BigInt(dto.role_id) }),
                },
            });

            if (dto.doctor_id !== undefined) {
                // Unlink whatever doctor profile this user currently holds first —
                // a user should only ever be linked to at most one doctor profile.
                await tx.doctors.updateMany({ where: { user_id: id }, data: { user_id: null } });
                if (dto.doctor_id) {
                    const doctor = await tx.doctors.findFirst({
                        where: { id: BigInt(dto.doctor_id), is_deleted: false },
                    });
                    if (!doctor) throw new NotFoundException('Doctor profile not found');
                    if (doctor.user_id && doctor.user_id !== id) {
                        throw new BadRequestException('This doctor profile is already linked to another user');
                    }
                    await tx.doctors.update({ where: { id: doctor.id }, data: { user_id: id } });
                }
            }

            if (dto.role_id !== undefined) {
                await this.assertRecoveryPermissionRetained(tx);
            }

            await tx.audit_logs.create({
                data: {
                    user_id: actingUserId,
                    action: 'UPDATE_USER',
                    entity_type: 'user',
                    entity_id: id,
                    new_values: JSON.stringify(dto),
                    ip_address: ip ?? null,
                },
            });
        });

        return this.findOne(id);
    }

    async setActive(id: bigint, dto: SetUserStatusDto, actingUserId: bigint, ip?: string) {
        if (id === actingUserId && !dto.is_active) {
            throw new BadRequestException('You cannot deactivate your own account');
        }
        const user = await this.prisma.users.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        await this.prisma.$transaction(async (tx) => {
            await tx.users.update({ where: { id }, data: { is_active: dto.is_active } });

            if (!dto.is_active) {
                await this.assertRecoveryPermissionRetained(tx);
            }

            await tx.audit_logs.create({
                data: {
                    user_id: actingUserId,
                    action: dto.is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
                    entity_type: 'user',
                    entity_id: id,
                    ip_address: ip ?? null,
                },
            });
        });

        return this.findOne(id);
    }

    async resetPassword(id: bigint, dto: ResetPasswordDto, actingUserId: bigint, ip?: string) {
        const user = await this.prisma.users.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const password_hash = await bcrypt.hash(dto.new_password, 10);
        await this.prisma.users.update({
            where: { id },
            // Admin-set password is treated the same as a freshly created
            // account: unknown to the user until they read the email, so
            // it must be changed on next sign-in.
            data: { password_hash, must_change_password: true },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: actingUserId,
                action: 'RESET_PASSWORD',
                entity_type: 'user',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });

        this.sendPasswordResetEmail(user, dto.new_password, actingUserId);

        return { message: 'Password reset. An email with the new temporary password has been sent to the user.' };
    }

    private sendPasswordResetEmail(user: { id: bigint; full_name: string; email: string; username: string }, plainPassword: string, actingUserId: bigint) {
        const messageBody =
            `Hello ${user.full_name},\n\n` +
            `Your QuraXa password has been reset by an administrator.\n\n` +
            `Username: ${user.username}\n` +
            `Temporary Password: ${plainPassword}\n\n` +
            `To sign in:\n` +
            `1. Go to the QuraXa login page.\n` +
            `2. Sign in using the username and temporary password above.\n` +
            `3. You will be prompted to set your own new password before you can continue.\n\n` +
            `If you did not request this reset, please contact your administrator immediately.\n\n` +
            `— QuraXa`;

        this.messaging.sendEmail({
            to: user.email,
            subject: 'Your QuraXa password has been reset',
            message: messageBody,
            recipientType: 'user',
            recipientId: user.id,
            recipientName: user.full_name,
            entityType: 'user',
            entityId: user.id,
            userId: actingUserId,
        }).catch((err) => this.logger.error(`Password-reset email failed: ${err?.message ?? err}`));
    }

    // Must be called from inside the same transaction as the mutation being
    // guarded, so an empty result rolls the whole change back.
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

    private serialize(u: any) {
        return {
            id: u.id,
            full_name: u.full_name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            is_active: u.is_active,
            must_change_password: u.must_change_password,
            last_login_at: u.last_login_at,
            role: { id: u.roles.id, name: u.roles.name },
            linked_doctor: u.doctors?.[0]
                ? { id: u.doctors[0].id, full_name: u.doctors[0].full_name }
                : null,
        };
    }
}
