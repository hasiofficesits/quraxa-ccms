import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('specialties')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SpecialtiesController {
    constructor(private specialtiesService: SpecialtiesService) { }

    @Get()
    @RequirePermissions('doctor.view')
    findAll() {
        return this.specialtiesService.findAll();
    }

    @Post()
    @RequirePermissions('doctor.manage')
    create(@Body('name') name: string, @Req() req: any) {
        return this.specialtiesService.create(name, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('doctor.manage')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.specialtiesService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}