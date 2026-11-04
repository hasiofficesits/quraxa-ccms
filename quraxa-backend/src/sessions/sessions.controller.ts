import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
    constructor(private sessionsService: SessionsService) { }

    @Post()
    @RequirePermissions('session.manage')
    create(@Body() dto: CreateSessionDto, @Req() req: any) {
        return this.sessionsService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Get()
    @RequirePermissions('session.view')
    findAll(@Query('date') date: string | undefined, @Req() req: any) {
        return this.sessionsService.findAll(date, BigInt(req.user.userId));
    }

    @Get(':id')
    @RequirePermissions('session.view')
    findOne(@Param('id') id: string) {
        return this.sessionsService.findOne(BigInt(id));
    }

    @Patch(':id')
    @RequirePermissions('session.manage')
    update(@Param('id') id: string, @Body() dto: UpdateSessionDto, @Req() req: any) {
        return this.sessionsService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id/cancel')
    @RequirePermissions('session.manage')
    cancel(@Param('id') id: string, @Req() req: any) {
        return this.sessionsService.cancel(BigInt(id), BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('session.manage')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.sessionsService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}
