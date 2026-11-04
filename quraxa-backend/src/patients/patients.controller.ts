import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard) // every route needs a valid token
export class PatientsController {
    constructor(private patientsService: PatientsService) { }

    @Post()
    @RequirePermissions('patient.create')
    create(@Body() dto: CreatePatientDto, @Req() req: any) {
        return this.patientsService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Get()
    @RequirePermissions('patient.view')
    findAll(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.patientsService.findAll(
            search,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
        );
    }

    @Get(':id')
    @RequirePermissions('patient.view')
    findOne(@Param('id') id: string) {
        return this.patientsService.findOne(BigInt(id));
    }

    @Patch(':id')
    @RequirePermissions('patient.edit')
    update(@Param('id') id: string, @Body() dto: UpdatePatientDto, @Req() req: any) {
        return this.patientsService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('patient.edit')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.patientsService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}