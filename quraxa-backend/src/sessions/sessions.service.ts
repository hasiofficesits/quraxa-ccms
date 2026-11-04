import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { doctor_sessions, doctors, rooms } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

type SessionWithDoctorAndRoom = doctor_sessions & { doctors: doctors; rooms: rooms | null };

@Injectable()
export class SessionsService {
    private readonly logger = new Logger(SessionsService.name);

    constructor(
        private prisma: PrismaService,
        private messaging: MessagingService,
    ) { }

    async create(dto: CreateSessionDto, userId: bigint, ip?: string) {
        // MySQL TIME/DATE columns: build proper Date objects
        const doctorId = BigInt(dto.doctor_id);
        const roomId = dto.room_id ? BigInt(dto.room_id) : null;
        const sessionDate = new Date(dto.session_date);
        const startTime = new Date(`1970-01-01T${dto.start_time}:00Z`);
        const endTime = new Date(`1970-01-01T${dto.end_time}:00Z`);

        await this.assertNoDoctorConflict(doctorId, sessionDate, startTime, endTime);
        if (roomId) await this.assertNoRoomConflict(roomId, sessionDate, startTime, endTime);

        const session = await this.prisma.doctor_sessions.create({
            data: {
                doctor_id: doctorId,
                room_id: roomId,
                session_date: sessionDate,
                start_time: startTime,
                end_time: endTime,
                max_patients: dto.max_patients ?? 20,
                channel_fee: dto.channel_fee ?? 0,
                hospital_fee: dto.hospital_fee ?? 0,
                commission_rate: dto.commission_rate ?? null,
                created_by: userId,
            },
            include: { doctors: true, rooms: true },
        });

        this.notifyDoctorOfNewSession(session, userId);

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CREATE_SESSION',
                entity_type: 'session',
                entity_id: session.id,
                new_values: JSON.stringify({
                    doctor_id: dto.doctor_id, room_id: dto.room_id ?? null,
                    session_date: dto.session_date, start_time: dto.start_time, end_time: dto.end_time,
                }),
                ip_address: ip ?? null,
            },
        });

        return session;
    }

    // A doctor cannot run two sessions (in the same room or different rooms)
    // whose time ranges overlap on the same day.
    private async assertNoDoctorConflict(
        doctorId: bigint, sessionDate: Date, startTime: Date, endTime: Date, excludeSessionId?: bigint,
    ) {
        const conflict = await this.prisma.doctor_sessions.findFirst({
            where: {
                doctor_id: doctorId,
                session_date: sessionDate,
                status: { not: 'CANCELLED' },
                ...(excludeSessionId !== undefined && { id: { not: excludeSessionId } }),
                start_time: { lt: endTime },
                end_time: { gt: startTime },
            },
        });
        if (conflict) {
            throw new BadRequestException('This doctor already has a session that overlaps this time slot');
        }
    }

    // A room cannot be given to two different doctors (or the same doctor
    // twice) for overlapping time ranges on the same day.
    private async assertNoRoomConflict(
        roomId: bigint, sessionDate: Date, startTime: Date, endTime: Date, excludeSessionId?: bigint,
    ) {
        const conflict = await this.prisma.doctor_sessions.findFirst({
            where: {
                room_id: roomId,
                session_date: sessionDate,
                status: { not: 'CANCELLED' },
                ...(excludeSessionId !== undefined && { id: { not: excludeSessionId } }),
                start_time: { lt: endTime },
                end_time: { gt: startTime },
            },
        });
        if (conflict) {
            throw new BadRequestException('This room is already booked for an overlapping session');
        }
    }

    // Fire-and-forget: session creation shouldn't wait on WhatsApp/email
    // round-trips. Every attempt (success or failure) is logged to
    // message_logs by MessagingService regardless.
    private notifyDoctorOfNewSession(session: SessionWithDoctorAndRoom, userId: bigint) {
        const dateLabel = session.session_date.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const timeLabel = `${session.start_time.toISOString().slice(11, 16)}–${session.end_time.toISOString().slice(11, 16)}`;
        const roomLabel = session.rooms
            ? `Room ${session.rooms.room_number}${session.rooms.name ? ` (${session.rooms.name})` : ''}`
            : 'Room: not assigned yet';

        const messageBody =
            `Hello Dr. ${session.doctors.full_name}, a new channeling session has been scheduled for you.\n\n` +
            `Date: ${dateLabel}\n` +
            `Time: ${timeLabel}\n` +
            `${roomLabel}\n\n` +
            `— QuraXa`;

        if (session.doctors.phone) {
            this.messaging.sendWhatsApp({
                to: session.doctors.phone,
                message: messageBody,
                recipientType: 'doctor',
                recipientId: session.doctor_id,
                recipientName: session.doctors.full_name,
                entityType: 'session',
                entityId: session.id,
                userId,
            }).catch((err) => this.logger.error(`WhatsApp notify failed: ${err?.message ?? err}`));
        }

        if (session.doctors.email) {
            this.messaging.sendEmail({
                to: session.doctors.email,
                subject: 'New Channeling Session Scheduled',
                message: messageBody,
                recipientType: 'doctor',
                recipientId: session.doctor_id,
                recipientName: session.doctors.full_name,
                entityType: 'session',
                entityId: session.id,
                userId,
            }).catch((err) => this.logger.error(`Email notify failed: ${err?.message ?? err}`));
        }
    }

    // List sessions, optionally filtered by date, with doctor + room + booking count.
    // If the requesting user is linked to a doctor profile (doctors.user_id),
    // the list is force-scoped to that doctor's own sessions — a Doctor-role
    // login should never be able to browse other doctors' queues, even by
    // filtering the raw endpoint. Staff without a doctor link see everything.
    async findAll(date?: string, requestingUserId?: bigint) {
        const where: any = {};
        if (date) where.session_date = new Date(date);

        if (requestingUserId) {
            const doctor = await this.prisma.doctors.findFirst({
                where: { user_id: requestingUserId, is_deleted: false },
                select: { id: true },
            });
            if (doctor) where.doctor_id = doctor.id;
        }

        const sessions = await this.prisma.doctor_sessions.findMany({
            where,
            include: {
                doctors: { include: { specialties: true } },
                rooms: true,
                _count: { select: { appointments: true } },
            },
            orderBy: [{ session_date: 'desc' }, { start_time: 'asc' }],
        });

        // Add "slots remaining" to each
        return sessions.map((s) => ({
            ...s,
            booked_count: s._count.appointments,
            slots_remaining: s.max_patients - s._count.appointments,
        }));
    }

    async findOne(id: bigint) {
        const session = await this.prisma.doctor_sessions.findUnique({
            where: { id },
            include: {
                doctors: { include: { specialties: true } },
                rooms: true,
                _count: { select: { appointments: true } },
            },
        });
        if (!session) throw new NotFoundException('Session not found');
        return session;
    }

    async update(id: bigint, dto: UpdateSessionDto, userId: bigint, ip?: string) {
        const existing = await this.findOne(id); // throws if not found

        const doctorId = dto.doctor_id !== undefined ? BigInt(dto.doctor_id) : existing.doctor_id;
        const roomId = dto.room_id !== undefined ? (dto.room_id ? BigInt(dto.room_id) : null) : existing.room_id;
        const sessionDate = dto.session_date !== undefined ? new Date(dto.session_date) : existing.session_date;
        const startTime = dto.start_time !== undefined ? new Date(`1970-01-01T${dto.start_time}:00Z`) : existing.start_time;
        const endTime = dto.end_time !== undefined ? new Date(`1970-01-01T${dto.end_time}:00Z`) : existing.end_time;

        await this.assertNoDoctorConflict(doctorId, sessionDate, startTime, endTime, id);
        if (roomId) await this.assertNoRoomConflict(roomId, sessionDate, startTime, endTime, id);

        const session = await this.prisma.doctor_sessions.update({
            where: { id },
            data: {
                ...(dto.doctor_id !== undefined && { doctor_id: BigInt(dto.doctor_id) }),
                ...(dto.room_id !== undefined && { room_id: dto.room_id ? BigInt(dto.room_id) : null }),
                ...(dto.session_date !== undefined && { session_date: new Date(dto.session_date) }),
                ...(dto.start_time !== undefined && { start_time: new Date(`1970-01-01T${dto.start_time}:00Z`) }),
                ...(dto.end_time !== undefined && { end_time: new Date(`1970-01-01T${dto.end_time}:00Z`) }),
                ...(dto.max_patients !== undefined && { max_patients: dto.max_patients }),
                ...(dto.channel_fee !== undefined && { channel_fee: dto.channel_fee }),
                ...(dto.hospital_fee !== undefined && { hospital_fee: dto.hospital_fee }),
                ...(dto.commission_rate !== undefined && { commission_rate: dto.commission_rate }),
                ...(dto.status !== undefined && { status: dto.status }),
            },
            include: {
                doctors: { include: { specialties: true } },
                rooms: true,
                _count: { select: { appointments: true } },
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'UPDATE_SESSION',
                entity_type: 'session',
                entity_id: id,
                new_values: JSON.stringify(dto),
                ip_address: ip ?? null,
            },
        });

        return session;
    }

    // Cancel keeps the row (and any bookings) for the record — just flips status.
    async cancel(id: bigint, userId: bigint, ip?: string) {
        await this.findOne(id);
        const session = await this.prisma.doctor_sessions.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: {
                doctors: { include: { specialties: true } },
                rooms: true,
                _count: { select: { appointments: true } },
            },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CANCEL_SESSION',
                entity_type: 'session',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });

        return session;
    }

    // Hard delete — only allowed while the session has no bookings yet.
    async remove(id: bigint, userId: bigint, ip?: string) {
        const session = await this.prisma.doctor_sessions.findUnique({
            where: { id },
            include: { _count: { select: { appointments: true } } },
        });
        if (!session) throw new NotFoundException('Session not found');
        if (session._count.appointments > 0) {
            throw new BadRequestException(
                'This session already has bookings and cannot be deleted. Cancel it instead.',
            );
        }
        await this.prisma.doctor_sessions.delete({ where: { id } });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'DELETE_SESSION',
                entity_type: 'session',
                entity_id: id,
                ip_address: ip ?? null,
            },
        });

        return { message: 'Session deleted' };
    }
}