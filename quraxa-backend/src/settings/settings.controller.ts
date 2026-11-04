import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('settings')
export class SettingsController {
    constructor(private settingsService: SettingsService) { }

    // Business identity used on printed invoices/receipts — any logged-in
    // user who can print a receipt needs to be able to read this.
    @Get('business')
    @UseGuards(JwtAuthGuard)
    getBusinessSettings() {
        return this.settingsService.getBusinessSettings();
    }

    @Patch('business')
    @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermissions('system.backup')
    updateBusinessSettings(@Body() dto: UpdateBusinessSettingsDto, @Req() req: any) {
        return this.settingsService.updateBusinessSettings(dto, BigInt(req.user.userId), req.ip);
    }
}
