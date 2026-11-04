import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

interface AuthedUser {
    id: bigint;
    full_name: string;
    username: string;
    email: string;
    must_change_password: boolean;
    role_id: bigint;
    roles: { name: string };
}

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ) { }

    async login(dto: LoginDto, ip?: string, userAgent?: string) {
        const user = await this.prisma.users.findUnique({
            where: { username: dto.username },
            include: { roles: true },
        });

        if (!user || !user.is_active || !user.roles.is_active) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(dto.password, user.password_hash);
        if (!passwordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        await this.prisma.users.update({
            where: { id: user.id },
            data: { last_login_at: new Date() },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: user.id,
                action: 'LOGIN',
                entity_type: 'user',
                entity_id: user.id,
                ip_address: ip ?? null,
            },
        });

        return this.issueSession(user, ip, userAgent);
    }

    // Google Identity Services returns a signed ID token (JWT) from the
    // frontend. Verify it against Google's tokeninfo endpoint, then match
    // the verified email to an existing local account — there's no
    // separate "Google account" concept, sign-in still needs a matching
    // active user row.
    async loginWithGoogle(dto: GoogleLoginDto, ip?: string, userAgent?: string) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            throw new UnauthorizedException('Google sign-in is not configured');
        }

        const verifyRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(dto.credential)}`,
        );
        if (!verifyRes.ok) {
            throw new UnauthorizedException('Invalid Google token');
        }
        const payloadFromGoogle: any = await verifyRes.json();

        if (payloadFromGoogle.aud !== clientId) {
            throw new UnauthorizedException('Invalid Google token');
        }
        if (payloadFromGoogle.email_verified !== 'true' && payloadFromGoogle.email_verified !== true) {
            throw new UnauthorizedException('Google email is not verified');
        }

        const user = await this.prisma.users.findUnique({
            where: { email: payloadFromGoogle.email },
            include: { roles: true },
        });
        if (!user || !user.is_active || !user.roles.is_active) {
            throw new UnauthorizedException('No account found for this Google email');
        }

        await this.prisma.users.update({
            where: { id: user.id },
            data: { last_login_at: new Date() },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: user.id,
                action: 'GOOGLE_LOGIN',
                entity_type: 'user',
                entity_id: user.id,
                ip_address: ip ?? null,
            },
        });

        return this.issueSession(user, ip, userAgent);
    }

    // Called by POST /auth/refresh. The raw refresh token comes from the
    // httpOnly cookie — never touched by frontend JS. Rotates the token on
    // every use: the old one is revoked and a new one issued, so a stolen
    // (but not-yet-used) cookie only works once before both client and
    // attacker get invalidated on next use — a standard theft detection.
    async refresh(rawToken: string | undefined, ip?: string, userAgent?: string) {
        if (!rawToken) throw new UnauthorizedException('No refresh token');

        const tokenHash = this.hashToken(rawToken);
        const stored = await this.prisma.refresh_tokens.findUnique({ where: { token_hash: tokenHash } });

        if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
            throw new UnauthorizedException('Refresh token is invalid or expired');
        }

        const user = await this.prisma.users.findUnique({
            where: { id: stored.user_id },
            include: { roles: true },
        });
        if (!user || !user.is_active || !user.roles.is_active) {
            await this.prisma.refresh_tokens.update({ where: { id: stored.id }, data: { revoked_at: new Date() } });
            throw new UnauthorizedException('Account is no longer active');
        }

        await this.prisma.refresh_tokens.update({ where: { id: stored.id }, data: { revoked_at: new Date() } });

        return this.issueSession(user, ip, userAgent);
    }

    // Revokes just the one refresh token presented (this device/browser).
    async logout(rawToken: string | undefined) {
        if (!rawToken) return { message: 'Logged out' };
        const tokenHash = this.hashToken(rawToken);
        await this.prisma.refresh_tokens.updateMany({
            where: { token_hash: tokenHash, revoked_at: null },
            data: { revoked_at: new Date() },
        });
        return { message: 'Logged out' };
    }

    // "Logout everywhere" — revokes every refresh token this user holds,
    // across every browser/device they're signed into.
    async logoutAll(userId: bigint, ip?: string) {
        await this.prisma.refresh_tokens.updateMany({
            where: { user_id: userId, revoked_at: null },
            data: { revoked_at: new Date() },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'LOGOUT_ALL_DEVICES',
                entity_type: 'user',
                entity_id: userId,
                ip_address: ip ?? null,
            },
        });
        return { message: 'Logged out on all devices' };
    }

    // Self-service password change — used both voluntarily and to satisfy
    // the forced change after an admin creates/resets an account.
    async changePassword(userId: bigint, dto: ChangePasswordDto, ip?: string) {
        const user = await this.prisma.users.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedException('Invalid session');

        const valid = await bcrypt.compare(dto.current_password, user.password_hash);
        if (!valid) throw new BadRequestException('Current password is incorrect');

        const password_hash = await bcrypt.hash(dto.new_password, 10);
        await this.prisma.users.update({
            where: { id: userId },
            data: { password_hash, must_change_password: false },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CHANGE_PASSWORD',
                entity_type: 'user',
                entity_id: userId,
                ip_address: ip ?? null,
            },
        });

        return { message: 'Password changed' };
    }

    // ---- shared helpers ----

    // Builds the JWT access token + a brand-new DB-backed refresh token for
    // this user, in one place — login, Google login, and token rotation on
    // refresh all funnel through here so they stay in sync.
    private async issueSession(user: AuthedUser, ip?: string, userAgent?: string) {
        const rolePerms = await this.prisma.role_permissions.findMany({
            where: { role_id: user.role_id },
            include: { permissions: true },
        });
        const permissions = rolePerms.map((rp) => rp.permissions.code);

        const payload = {
            sub: user.id.toString(),
            username: user.username,
            role: user.roles.name,
            permissions,
        };
        const access_token = await this.jwt.signAsync(payload);
        const refresh_token = await this.createRefreshToken(user.id, ip, userAgent);

        return {
            access_token,
            refresh_token,
            user: {
                id: user.id.toString(),
                full_name: user.full_name,
                username: user.username,
                role: user.roles.name,
                permissions,
                must_change_password: user.must_change_password,
            },
        };
    }

    private async createRefreshToken(userId: bigint, ip?: string, userAgent?: string): Promise<string> {
        const raw = crypto.randomBytes(48).toString('hex');
        const days = parseInt(this.config.get<string>('REFRESH_TOKEN_EXPIRES_DAYS') ?? '7', 10);
        const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await this.prisma.refresh_tokens.create({
            data: {
                user_id: userId,
                token_hash: this.hashToken(raw),
                expires_at,
                ip_address: ip ?? null,
                user_agent: userAgent ? userAgent.slice(0, 255) : null,
            },
        });

        return raw;
    }

    private hashToken(raw: string): string {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }
}
