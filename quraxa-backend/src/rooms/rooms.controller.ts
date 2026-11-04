import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('rooms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoomsController {
    constructor(private roomsService: RoomsService) { }

    @Get()
    @RequirePermissions('session.view')
    findAll() {
        return this.roomsService.findAll();
    }

    @Post()
    @RequirePermissions('room.manage')
    create(@Body('room_number') room_number: string, @Body('name') name: string | undefined, @Req() req: any) {
        return this.roomsService.create(room_number, name, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @RequirePermissions('room.manage')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.roomsService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}