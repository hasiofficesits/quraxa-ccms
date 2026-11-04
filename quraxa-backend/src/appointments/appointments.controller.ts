import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentsController {
    constructor(private appointmentsService: AppointmentsService) { }

    @Post()
    @RequirePermissions('appointment.create')
    book(@Body() dto: CreateAppointmentDto, @Req() req: any) {
        return this.appointmentsService.book(dto, BigInt(req.user.userId), req.ip);
    }

    @Get('session/:sessionId')
    @RequirePermissions('appointment.view')
    findBySession(@Param('sessionId') sessionId: string, @Req() req: any) {
        return this.appointmentsService.findBySession(BigInt(sessionId), BigInt(req.user.userId));
    }

    @Post(':id/checkin')
    @RequirePermissions('appointment.checkin')
    checkIn(@Param('id') id: string, @Req() req: any) {
        return this.appointmentsService.checkIn(BigInt(id), BigInt(req.user.userId), req.ip);
    }

    @Get('queue/:sessionId')
    @RequirePermissions('appointment.view')
    getQueue(@Param('sessionId') sessionId: string, @Req() req: any) {
        return this.appointmentsService.getQueue(BigInt(sessionId), BigInt(req.user.userId));
    }

    // Dashboard widget: today's queue breakdown (waiting / in consultation /
    // completed / not yet checked in) across all of today's sessions —
    // scoped to just this doctor's sessions if the requester is linked to one.
    @Get('queue-status/today')
    @RequirePermissions('session.view')
    getTodayQueueStatus(@Req() req: any) {
        return this.appointmentsService.getTodayQueueStatus(BigInt(req.user.userId));
    }

    @Delete(':id')
    @RequirePermissions('appointment.create')
    cancel(@Param('id') id: string, @Req() req: any) {
        return this.appointmentsService.cancel(BigInt(id), BigInt(req.user.userId), req.ip);
    }

    @Patch('visit/:visitId/revert')
    @RequirePermissions('appointment.checkin')
    revertCheckIn(@Param('visitId') visitId: string, @Req() req: any) {
        return this.appointmentsService.revertCheckIn(BigInt(visitId), BigInt(req.user.userId), req.ip);
    }

    @Delete('visit/:visitId')
    @RequirePermissions('appointment.checkin')
    removeFromQueue(@Param('visitId') visitId: string, @Req() req: any) {
        return this.appointmentsService.removeFromQueue(BigInt(visitId), BigInt(req.user.userId), req.ip);
    }
}