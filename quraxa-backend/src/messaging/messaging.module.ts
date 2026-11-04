import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';

// Global so any feature module (sessions, appointments, billing...) can
// inject MessagingService without importing this module each time.
@Global()
@Module({
    providers: [MessagingService],
    exports: [MessagingService],
})
export class MessagingModule { }
