import {
    Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get()
    @RequirePermissions('user.view')
    list(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
        return this.usersService.list(search, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
    }

    @Get('roles-list')
    @RequirePermissions('user.view')
    listRoles() {
        return this.usersService.listRoles();
    }

    @Get('linkable-doctors')
    @RequirePermissions('user.view')
    listLinkableDoctors(@Query('for_user_id') forUserId?: string) {
        return this.usersService.listLinkableDoctors(forUserId ? BigInt(forUserId) : undefined);
    }

    @Get(':id')
    @RequirePermissions('user.view')
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(BigInt(id));
    }

    @Post()
    @RequirePermissions('user.create')
    create(@Body() dto: CreateUserDto, @Req() req: any) {
        return this.usersService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id')
    @RequirePermissions('user.edit')
    update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
        return this.usersService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id/status')
    @RequirePermissions('user.deactivate')
    setActive(@Param('id') id: string, @Body() dto: SetUserStatusDto, @Req() req: any) {
        return this.usersService.setActive(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id/reset-password')
    @RequirePermissions('user.edit')
    resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @Req() req: any) {
        return this.usersService.resetPassword(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }
}
