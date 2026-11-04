import {
    Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
    constructor(private prisma: PrismaService) { }

    // Same rule as ClinicalService: a Doctor-role login (linked via
    // doctors.user_id) may only ever see/act on their own session's queue.
    private async assertUserOwnsSessionDoctor(userId: bigint, sessionDoctorId: bigint) {
        const doctor = await this.prisma.doctors.findFirst({
            where: { user_id: userId, is_deleted: false },
            select: { id: true },
        });
        if (doctor && doctor.id !== sessionDoctorId) {
            throw new ForbiddenException('This session belongs to a different doctor');
        }
    }

    async book(dto: CreateAppointmentDto, userId: bigint, ip?: string) {
        const sessionId = BigInt(dto.session_id);
        const patientId = BigInt(dto.patient_id);

        // Run the whole booking as one atomic transaction
        return this.prisma.$transaction(async (tx) => {
            // 1. Load the session and check it exists + is open
            const session = await tx.doctor_sessions.findUnique({
                where: { id: sessionId },
            });
            if (!session) throw new NotFoundException('Session not found');
            if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
                throw new BadRequestException('Session is not open for booking');
            }

            // 2. Check the patient exists
            const patient = await tx.patients.findFirst({
                where: { id: patientId, is_deleted: false },
            });
            if (!patient) throw new NotFoundException('Patient not found');

            // 2.5 A patient cannot hold two bookings whose sessions overlap in time,
            //     even if the sessions are with different doctors.
            const patientConflict = await tx.appointments.findFirst({
                where: {
                    patient_id: patientId,
                    status: { not: 'CANCELLED' },
                    session_id: { not: sessionId },
                    doctor_sessions: {
                        session_date: session.session_date,
                        status: { not: 'CANCELLED' },
                        start_time: { lt: session.end_time },
                        end_time: { gt: session.start_time },
                    },
                },
            });
            if (patientConflict) {
                throw new BadRequestException('This patient already has a booking that overlaps this time slot');
            }

            // 3. Count current bookings for this session (enforce max_patients)
            const currentCount = await tx.appointments.count({
                where: { session_id: sessionId, status: { not: 'CANCELLED' } },
            });
            if (currentCount >= session.max_patients) {
                throw new BadRequestException('Session is fully booked');
            }

            // 4. Next booking number = highest existing + 1 for this session
            const lastBooking = await tx.appointments.findFirst({
                where: { session_id: sessionId },
                orderBy: { booking_number: 'desc' },
                select: { booking_number: true },
            });
            const nextNumber = (lastBooking?.booking_number ?? 0) + 1;

            // 5. Generate a globally-unique booking reference
            const totalAppointments = await tx.appointments.count();
            const bookingRef = 'BK-' + String(totalAppointments + 1).padStart(6, '0');

            // 6. Create the appointment. If two receptionists race, the unique
            //    constraint on (session_id, booking_number) makes one fail.
            const appointment = await tx.appointments.create({
                data: {
                    session_id: sessionId,
                    patient_id: patientId,
                    booking_reference: bookingRef,
                    booking_number: nextNumber,
                    booked_by: userId,
                    booking_channel: dto.booking_channel ?? 'WALK_IN',
                    status: 'BOOKED',
                    notes: dto.notes ?? null,
                },
            });

            // 7. Audit log
            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'BOOK_APPOINTMENT',
                    entity_type: 'appointment',
                    entity_id: appointment.id,
                    new_values: JSON.stringify({
                        booking_reference: bookingRef,
                        booking_number: nextNumber,
                        session_id: dto.session_id,
                        patient_id: dto.patient_id,
                    }),
                    ip_address: ip ?? null,
                },
            });

            return {
                ...appointment,
                temporary_number: nextNumber,
                message: `Booked. Temporary number: ${nextNumber}`,
            };
        }).catch((e) => {
            // If the race caused a unique-constraint violation, tell the caller to retry
            if (e.code === 'P2002') {
                throw new ConflictException('Booking collision, please retry');
            }
            throw e;
        });
    }

    // List appointments for a session (the booking list)
    async findBySession(sessionId: bigint, requestingUserId: bigint) {
        const session = await this.prisma.doctor_sessions.findUnique({ where: { id: sessionId } });
        if (!session) throw new NotFoundException('Session not found');
        await this.assertUserOwnsSessionDoctor(requestingUserId, session.doctor_id);

        return this.prisma.appointments.findMany({
            where: { session_id: sessionId },
            include: { patients: true, visits: true },
            orderBy: { booking_number: 'asc' },
        });
    }

    async checkIn(appointmentId: bigint, userId: bigint, ip?: string) {
        return this.prisma.$transaction(async (tx) => {
            // 1. Load the appointment + its existing visit (if any)
            const appointment = await tx.appointments.findUnique({
                where: { id: appointmentId },
                include: { visits: true },
            });
            if (!appointment) throw new NotFoundException('Appointment not found');

            // 2. Already checked in? Block it (one visit per appointment)
            if (appointment.visits) {
                throw new BadRequestException('Patient already checked in');
            }
            if (appointment.status === 'CANCELLED') {
                throw new BadRequestException('Cannot check in a cancelled appointment');
            }

            // 3. Next token number = highest existing token for this session + 1
            const lastVisit = await tx.visits.findFirst({
                where: { session_id: appointment.session_id },
                orderBy: { token_number: 'desc' },
                select: { token_number: true },
            });
            const nextToken = (lastVisit?.token_number ?? 0) + 1;

            // 4. Create the visit (the real queue entry)
            const visit = await tx.visits.create({
                data: {
                    appointment_id: appointmentId,
                    session_id: appointment.session_id,
                    token_number: nextToken,
                    status: 'WAITING',
                    checked_in_by: userId,
                },
            });

            // 5. Flip the appointment to ARRIVED
            await tx.appointments.update({
                where: { id: appointmentId },
                data: { status: 'ARRIVED' },
            });

            // 6. Audit log
            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'CHECK_IN',
                    entity_type: 'visit',
                    entity_id: visit.id,
                    new_values: JSON.stringify({
                        appointment_id: appointmentId.toString(),
                        token_number: nextToken,
                    }),
                    ip_address: ip ?? null,
                },
            });

            return {
                ...visit,
                message: `Checked in. Queue token: ${nextToken}`,
            };
        }).catch((e) => {
            if (e.code === 'P2002') {
                throw new ConflictException('Token collision, please retry');
            }
            throw e;
        });
    }

    // Cancel a booking — only while the patient hasn't checked in yet.
    // Soft-cancel (status = CANCELLED) rather than a hard delete: keeps the
    // booking number / audit trail, and book() already excludes CANCELLED
    // rows when counting slots, so the freed slot becomes bookable again.
    async cancel(appointmentId: bigint, userId: bigint, ip?: string) {
        const appointment = await this.prisma.appointments.findUnique({
            where: { id: appointmentId },
            include: { visits: true },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');
        if (appointment.visits) {
            throw new BadRequestException('Cannot remove this booking — the patient has already checked in');
        }
        if (appointment.status === 'CANCELLED') {
            throw new BadRequestException('Booking is already cancelled');
        }

        await this.prisma.appointments.update({
            where: { id: appointmentId },
            data: { status: 'CANCELLED' },
        });

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'CANCEL_APPOINTMENT',
                entity_type: 'appointment',
                entity_id: appointmentId,
                old_values: JSON.stringify({ status: appointment.status }),
                ip_address: ip ?? null,
            },
        });

        return { message: 'Booking removed' };
    }

    // Move a checked-in patient back to the booking queue (undo check-in).
    // Only allowed while still WAITING — once a consultation has started on
    // this visit, it's locked (consultations FK-reference the visit row).
    async revertCheckIn(visitId: bigint, userId: bigint, ip?: string) {
        const visit = await this.prisma.visits.findUnique({ where: { id: visitId } });
        if (!visit) throw new NotFoundException('Queue entry not found');
        if (visit.status !== 'WAITING') {
            throw new BadRequestException('Cannot revert — this patient is already in consultation or has been seen');
        }

        await this.prisma.$transaction([
            this.prisma.visits.delete({ where: { id: visitId } }),
            this.prisma.appointments.update({
                where: { id: visit.appointment_id },
                data: { status: 'BOOKED' },
            }),
        ]);

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'REVERT_CHECKIN',
                entity_type: 'visit',
                entity_id: visitId,
                old_values: JSON.stringify({ token_number: visit.token_number }),
                ip_address: ip ?? null,
            },
        });

        return { message: 'Patient moved back to the booking queue' };
    }

    // Remove a queue entry entirely — deletes the visit and cancels the
    // underlying booking, so the patient does not reappear in Bookings.
    // Only allowed while still WAITING.
    async removeFromQueue(visitId: bigint, userId: bigint, ip?: string) {
        const visit = await this.prisma.visits.findUnique({ where: { id: visitId } });
        if (!visit) throw new NotFoundException('Queue entry not found');
        if (visit.status !== 'WAITING') {
            throw new BadRequestException('Cannot remove — this patient is already in consultation or has been seen');
        }

        await this.prisma.$transaction([
            this.prisma.visits.delete({ where: { id: visitId } }),
            this.prisma.appointments.update({
                where: { id: visit.appointment_id },
                data: { status: 'CANCELLED' },
            }),
        ]);

        await this.prisma.audit_logs.create({
            data: {
                user_id: userId,
                action: 'REMOVE_FROM_QUEUE',
                entity_type: 'visit',
                entity_id: visitId,
                old_values: JSON.stringify({ token_number: visit.token_number }),
                ip_address: ip ?? null,
            },
        });

        return { message: 'Removed from queue and booking cancelled' };
    }

    // Live queue for a session, ordered by token (what the doctor sees)
    async getQueue(sessionId: bigint, requestingUserId: bigint) {
        const session = await this.prisma.doctor_sessions.findUnique({ where: { id: sessionId } });
        if (!session) throw new NotFoundException('Session not found');
        await this.assertUserOwnsSessionDoctor(requestingUserId, session.doctor_id);

        const visits = await this.prisma.visits.findMany({
            where: { session_id: sessionId },
            include: {
                appointments: { include: { patients: true } },
            },
            orderBy: { token_number: 'asc' },
        });
        return visits.map((v) => ({
            visit_id: v.id,
            token_number: v.token_number,
            status: v.status,
            patient_id: v.appointments.patient_id,
            patient: v.appointments.patients.full_name,
            patient_code: v.appointments.patients.patient_code,
            booking_number: v.appointments.booking_number,
            checked_in_at: v.checked_in_at,
        }));
    }

    // Dashboard "Patient Queue Status" pie — today's appointments bucketed
    // by where they actually are right now. "Not checked in" covers anyone
    // booked who hasn't arrived yet (no visit row) — the system has no
    // automated no-show marking, so this is the honest state rather than
    // guessing who won't show.
    async getTodayQueueStatus(requestingUserId: bigint) {
        const doctor = await this.prisma.doctors.findFirst({
            where: { user_id: requestingUserId, is_deleted: false },
            select: { id: true },
        });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const sessionFilter: any = { session_date: { gte: todayStart, lte: todayEnd } };
        if (doctor) sessionFilter.doctor_id = doctor.id;

        const appointments = await this.prisma.appointments.findMany({
            where: { status: { not: 'CANCELLED' }, doctor_sessions: sessionFilter },
            include: { visits: true },
        });

        let waiting = 0;
        let inConsultation = 0;
        let completed = 0;
        let notCheckedIn = 0;

        for (const a of appointments) {
            if (!a.visits) { notCheckedIn++; continue; }
            if (a.visits.status === 'WAITING') waiting++;
            else if (a.visits.status === 'IN_CONSULTATION') inConsultation++;
            else if (a.visits.status === 'DONE') completed++;
            else notCheckedIn++; // SKIPPED
        }

        return {
            total: appointments.length,
            waiting,
            in_consultation: inConsultation,
            completed,
            not_checked_in: notCheckedIn,
        };
    }
}