import {
    Controller, Post, Body, Ip, HttpCode, HttpStatus, Get, UseGuards, Req, Res, Headers,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequirePermissions } from './decorators/permissions.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_DAYS = 7;

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // Brute-force guard: 5 attempts per IP per minute — well above what a
    // real user needs (even mistyping a password a few times), but far
    // below what a credential-stuffing script needs to be effective.
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async login(
        @Body() dto: LoginDto,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { refresh_token, ...body } = await this.authService.login(dto, ip, userAgent);
        this.setRefreshCookie(res, refresh_token);
        return body;
    }

    @Post('google')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async googleLogin(
        @Body() dto: GoogleLoginDto,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { refresh_token, ...body } = await this.authService.loginWithGoogle(dto, ip, userAgent);
        this.setRefreshCookie(res, refresh_token);
        return body;
    }

    // Called silently by the frontend (on a 401, or when the user clicks
    // "Stay logged in" on the idle-timeout warning) to trade the httpOnly
    // refresh cookie for a new short-lived access token. No auth guard here
    // — the access token is expected to already be expired when this fires.
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async refresh(
        @Req() req: any,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { refresh_token, ...body } = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE], ip, userAgent);
        this.setRefreshCookie(res, refresh_token);
        return body;
    }

    // Revokes this device's refresh token and clears the cookie. Doesn't
    // require a valid access token — the whole point is to work even after
    // the access token has already expired (idle logout, stale tab, etc.).
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
        res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
        return result;
    }

    // "Logout everywhere" — revokes every refresh token this user holds, on
    // every device/browser. Requires a currently-valid access token.
    @Post('logout-all')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    async logoutAll(@Req() req: any, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.logoutAll(BigInt(req.user.userId), ip);
        res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
        return result;
    }

    // Protected: needs a valid token. Returns the logged-in user's info.
    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@Req() req: any) {
        return req.user;
    }

    // Protected: any logged-in user can change their own password — this is
    // also how the forced first-login password change is satisfied.
    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    changePassword(@Body() dto: ChangePasswordDto, @Req() req: any, @Ip() ip: string) {
        return this.authService.changePassword(BigInt(req.user.userId), dto, ip);
    }

    // Protected + RBAC: needs a valid token AND the audit.view permission.
    @Get('admin-check')
    @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermissions('audit.view')
    adminCheck(@Req() req: any) {
        return { message: 'You have audit.view permission', user: req.user.username };
    }

    private setRefreshCookie(res: Response, token: string) {
        res.cookie(REFRESH_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/auth',
            maxAge: REFRESH_COOKIE_DAYS * 24 * 60 * 60 * 1000,
        });
    }
}
