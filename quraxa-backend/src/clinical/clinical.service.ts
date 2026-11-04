import {
    Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { OrderTestsDto } from './dto/order-test.dto';

@Injectable()
export class ClinicalService {
    constructor(private prisma: PrismaService) { }

    // A Doctor-role login is linked to a doctor profile via doctors.user_id.
    // If this user IS a doctor, they may only ever act on their own
    // sessions — front-desk/admin users (no doctor link) are unaffected.
    private async assertUserOwnsSessionDoctor(userId: bigint, sessionDoctorId: bigint) {
        const doctor = await this.prisma.doctors.findFirst({
            where: { user_id: userId, is_deleted: false },
            select: { id: true },
        });
        if (doctor && doctor.id !== sessionDoctorId) {
            throw new ForbiddenException('This patient belongs to a different doctor\'s session');
        }
    }

    // Doctor calls the patient in: visit -> IN_CONSULTATION
    async startConsultation(visitId: bigint, userId: bigint) {
        const visit = await this.prisma.visits.findUnique({
            where: { id: visitId },
            include: { doctor_sessions: true },
        });
        if (!visit) throw new NotFoundException('Visit not found');
        if (visit.status === 'DONE') {
            throw new BadRequestException('Visit already completed');
        }
        await this.assertUserOwnsSessionDoctor(userId, visit.doctor_sessions.doctor_id);
        return this.prisma.visits.update({
            where: { id: visitId },
            data: { status: 'IN_CONSULTATION', consultation_started_at: new Date() },
        });
    }

    // Record the consultation (one per visit)
    async createConsultation(dto: CreateConsultationDto, userId: bigint, ip?: string) {
        const visitId = BigInt(dto.visit_id);

        return this.prisma.$transaction(async (tx) => {
            // Load the visit -> appointment -> session (to get doctor + patient)
            const visit = await tx.visits.findUnique({
                where: { id: visitId },
                include: {
                    appointments: true,
                    doctor_sessions: true,
                },
            });
            if (!visit) throw new NotFoundException('Visit not found');

            await this.assertUserOwnsSessionDoctor(userId, visit.doctor_sessions.doctor_id);

            // Prevent duplicate consultation for the same visit
            const existing = await tx.consultations.findUnique({
                where: { visit_id: visitId },
            });
            if (existing) throw new BadRequestException('Consultation already exists for this visit');

            const consultation = await tx.consultations.create({
                data: {
                    visit_id: visitId,
                    doctor_id: visit.doctor_sessions.doctor_id,
                    patient_id: visit.appointments.patient_id,
                    symptoms: dto.symptoms ?? null,
                    diagnosis: dto.diagnosis ?? null,
                    clinical_notes: dto.clinical_notes ?? null,
                    follow_up_date: dto.follow_up_date ? new Date(dto.follow_up_date) : null,
                },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'CREATE_CONSULTATION',
                    entity_type: 'consultation',
                    entity_id: consultation.id,
                    ip_address: ip ?? null,
                },
            });

            return consultation;
        });
    }

    // Write a prescription with medicine lines
    async createPrescription(dto: CreatePrescriptionDto, userId: bigint, ip?: string) {
        const consultationId = BigInt(dto.consultation_id);

        return this.prisma.$transaction(async (tx) => {
            const consultation = await tx.consultations.findUnique({
                where: { id: consultationId },
            });
            if (!consultation) throw new NotFoundException('Consultation not found');
            await this.assertUserOwnsSessionDoctor(userId, consultation.doctor_id);

            // Generate prescription code
            const count = await tx.prescriptions.count();
            const code = 'RX-' + String(count + 1).padStart(6, '0');

            const prescription = await tx.prescriptions.create({
                data: {
                    consultation_id: consultationId,
                    patient_id: consultation.patient_id,
                    doctor_id: consultation.doctor_id,
                    prescription_code: code,
                    notes: dto.notes ?? null,
                    prescription_items: {
                        create: dto.items.map((item) => ({
                            medicine_id: item.medicine_id ? BigInt(item.medicine_id) : null,
                            medicine_name: item.medicine_name,
                            dose: item.dose ?? null,
                            frequency: item.frequency ?? null,
                            duration: item.duration ?? null,
                            quantity: item.quantity ?? null,
                            instructions: item.instructions ?? null,
                        })),
                    },
                },
                include: { prescription_items: true },
            });

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'CREATE_PRESCRIPTION',
                    entity_type: 'prescription',
                    entity_id: prescription.id,
                    new_values: JSON.stringify({ prescription_code: code, item_count: dto.items.length }),
                    ip_address: ip ?? null,
                },
            });

            return prescription;
        });
    }

    // Order diagnostic tests (snapshots the price at order time)
    async orderTests(dto: OrderTestsDto, userId: bigint, ip?: string) {
        const consultationId = BigInt(dto.consultation_id);

        return this.prisma.$transaction(async (tx) => {
            const consultation = await tx.consultations.findUnique({
                where: { id: consultationId },
            });
            if (!consultation) throw new NotFoundException('Consultation not found');
            await this.assertUserOwnsSessionDoctor(userId, consultation.doctor_id);

            const created: any[] = [];
            for (const testId of dto.test_ids) {
                const test = await tx.diagnostic_tests.findUnique({
                    where: { id: BigInt(testId) },
                });
                if (!test) continue; // skip invalid test ids

                const order = await tx.test_orders.create({
                    data: {
                        consultation_id: consultationId,
                        test_id: BigInt(testId),
                        patient_id: consultation.patient_id,
                        price_at_order: test.price, // snapshot
                        status: 'ORDERED',
                    },
                });
                created.push(order);
            }

            await tx.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'ORDER_TESTS',
                    entity_type: 'consultation',
                    entity_id: consultationId,
                    new_values: JSON.stringify({ test_count: created.length }),
                    ip_address: ip ?? null,
                },
            });

            return created;
        });
    }

    // Close the visit
    async completeVisit(visitId: bigint, userId: bigint) {
        const visit = await this.prisma.visits.findUnique({
            where: { id: visitId },
            include: { doctor_sessions: true },
        });
        if (!visit) throw new NotFoundException('Visit not found');
        await this.assertUserOwnsSessionDoctor(userId, visit.doctor_sessions.doctor_id);

        await this.prisma.$transaction([
            this.prisma.visits.update({
                where: { id: visitId },
                data: { status: 'DONE', consultation_ended_at: new Date() },
            }),
            this.prisma.appointments.update({
                where: { id: visit.appointment_id },
                data: { status: 'COMPLETED' },
            }),
        ]);

        return { message: 'Visit completed' };
    }

    // Full patient clinical history
    async getPatientHistory(patientId: bigint) {
        return this.prisma.consultations.findMany({
            where: { patient_id: patientId, is_deleted: false },
            include: {
                doctors: true,
                prescriptions: { include: { prescription_items: true } },
                test_orders: { include: { diagnostic_tests: true } },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async listTests() {
        return this.prisma.diagnostic_tests.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
    }

    // Medicines a doctor can prescribe right now: active, not deleted, and
    // with at least one non-expired batch still in stock. Used by the
    // Consultation screen's "Add Medicine" picker.
    async listPrescribableMedicines() {
        const medicines = await this.prisma.medicines.findMany({
            where: { is_deleted: false, is_active: true },
            include: {
                stock_batches: {
                    where: { quantity_available: { gt: 0 }, expiry_date: { gte: new Date() }, is_deleted: false },
                },
            },
            orderBy: { generic_name: 'asc' },
        });

        return medicines
            .map((m) => ({
                id: m.id,
                medicine_code: m.medicine_code,
                generic_name: m.generic_name,
                brand_name: m.brand_name,
                strength: m.strength,
                available_quantity: m.stock_batches.reduce((sum, b) => sum + b.quantity_available, 0),
            }))
            .filter((m) => m.available_quantity > 0);
    }
}