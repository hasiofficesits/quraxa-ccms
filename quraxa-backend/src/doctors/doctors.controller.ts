import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('doctors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DoctorsController {
    constructor(private doctorsService: DoctorsService) { }

    @Post()
    @RequirePermissions('doctor.manage')
    create(@Body() dto: CreateDoctorDto, @Req() req: any) {
        return this.doctorsService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Get()
    @RequirePermissions('doctor.view')
    findAll(@Query('search') search?: string) {
        return this.doctorsService.findAll(search);
    }

    @Get(':id')
    @RequirePermissions('doctor.view')
    findOne(@Param('id') id: string) {
        return this.doctorsService.findOne(BigInt(id));
    }

    @Patch(':id')
    @RequirePermissions('doctor.manage')
    update(@Param('id') id: string, @Body() dto: UpdateDoctorDto, @Req() req: any) {
        return this.doctorsService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('doctor.manage')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.doctorsService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}