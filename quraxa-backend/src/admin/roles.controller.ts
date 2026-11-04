import {
    Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('admin/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
    constructor(private rolesService: RolesService) { }

    @Get()
    @RequirePermissions('role.manage')
    list() {
        return this.rolesService.list();
    }

    @Get('permissions')
    @RequirePermissions('role.manage')
    listPermissions() {
        return this.rolesService.listPermissions();
    }

    @Post()
    @RequirePermissions('role.manage')
    create(@Body() dto: CreateRoleDto, @Req() req: any) {
        return this.rolesService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id')
    @RequirePermissions('role.manage')
    update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Req() req: any) {
        return this.rolesService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id/permissions')
    @RequirePermissions('role.manage')
    updatePermissions(@Param('id') id: string, @Body() dto: UpdateRolePermissionsDto, @Req() req: any) {
        return this.rolesService.updatePermissions(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('role.manage')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.rolesService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}
