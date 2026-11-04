import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { RoomsModule } from './rooms/rooms.module';
import { DoctorsModule } from './doctors/doctors.module';
import { SessionsModule } from './sessions/sessions.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ClinicalModule } from './clinical/clinical.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './reports/reports.module';
import { LookupsModule } from './lookups/lookups.module';
import { LabModule } from './lab/lab.module';
import { InsuranceModule } from './insurance/insurance.module';
import { BackupModule } from './backup/backup.module';
import { SettingsModule } from './settings/settings.module';
import { HolidaysModule } from './holidays/holidays.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default rate limit for every endpoint (generous — this just stops
    // scripted abuse); auth endpoints layer a much stricter limit on top
    // via @Throttle() in auth.controller.ts.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MessagingModule,
    AuthModule,
    PatientsModule,
    SpecialtiesModule,
    RoomsModule,
    DoctorsModule,
    SessionsModule,
    AppointmentsModule,
    ClinicalModule,
    PharmacyModule,
    BillingModule,
    AdminModule,
    ReportsModule,
    LookupsModule,
    LabModule,
    InsuranceModule,
    BackupModule,
    SettingsModule,
    HolidaysModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }