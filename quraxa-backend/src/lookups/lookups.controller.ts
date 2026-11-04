import {
    Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { LookupsService } from './lookups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupsController {
    constructor(private lookupsService: LookupsService) { }

    // Read is open to any logged-in user — these are just label lists needed
    // to render dropdowns (Pharmacy medicine form, Consultation prescription
    // form), not sensitive data.
    @Get(':type')
    list(@Param('type') type: string, @Query('include_inactive') includeInactive?: string) {
        return this.lookupsService.list(type, includeInactive === 'true');
    }

    @Post(':type')
    @RequirePermissions('stock.receive')
    create(@Param('type') type: string, @Body('name') name: string, @Req() req: any) {
        return this.lookupsService.create(type, name, BigInt(req.user.userId), req.ip);
    }

    @Patch(':type/:id')
    @RequirePermissions('stock.receive')
    setActive(
        @Param('type') type: string,
        @Param('id') id: string,
        @Body('is_active') isActive: boolean,
        @Req() req: any,
    ) {
        return this.lookupsService.setActive(type, BigInt(id), isActive, BigInt(req.user.userId), req.ip);
    }
}
