import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('holidays')
@UseGuards(JwtAuthGuard)
export class HolidaysController {
    constructor(private holidaysService: HolidaysService) { }

    // Every logged-in user can see the holiday list (it drives the Dashboard
    // calendar) — no extra permission needed here.
    @Get()
    list(@Query('year') year?: string) {
        return this.holidaysService.list(year);
    }

    @Get('full')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('holiday.manage')
    listFull() {
        return this.holidaysService.listFull();
    }

    @Post()
    @UseGuards(PermissionsGuard)
    @RequirePermissions('holiday.manage')
    create(@Body() dto: CreateHolidayDto, @Req() req: any) {
        return this.holidaysService.create(dto, BigInt(req.user.userId), req.ip);
    }

    @Patch(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('holiday.manage')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolidayDto, @Req() req: any) {
        return this.holidaysService.update(BigInt(id), dto, BigInt(req.user.userId), req.ip);
    }

    @Delete(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('holiday.manage')
    remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        return this.holidaysService.remove(BigInt(id), BigInt(req.user.userId), req.ip);
    }
}
