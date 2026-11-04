import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

interface SendWhatsAppParams {
    to: string;
    message: string;
    recipientType?: string;
    recipientId?: bigint;
    recipientName?: string;
    entityType?: string;
    entityId?: bigint;
    userId?: bigint;
}

interface SendEmailParams {
    to: string;
    subject: string;
    message: string;
    recipientType?: string;
    recipientId?: bigint;
    recipientName?: string;
    entityType?: string;
    entityId?: bigint;
    userId?: bigint;
}

// Sends WhatsApp (Meta WhatsApp Cloud API) and email (SMTP) messages, and
// logs every attempt to message_logs — the same table other channels
// (SMS, push...) will use later, so the log/history behavior stays
// consistent app-wide.
@Injectable()
export class MessagingService {
    private readonly logger = new Logger(MessagingService.name);
    private mailTransporter: nodemailer.Transporter | null = null;

    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) { }

    private getMailTransporter(): nodemailer.Transporter | null {
        const host = this.config.get<string>('SMTP_HOST');
        const port = this.config.get<string>('SMTP_PORT');
        const user = this.config.get<string>('SMTP_USER');
        const pass = this.config.get<string>('SMTP_PASS');
        if (!host || !port || !user || !pass) return null;
        if (!this.mailTransporter) {
            this.mailTransporter = nodemailer.createTransport({
                host,
                port: Number(port),
                secure: this.config.get<string>('SMTP_SECURE') === 'true',
                auth: { user, pass },
            });
        }
        return this.mailTransporter;
    }

    async sendWhatsApp(params: SendWhatsAppParams) {
        const log = await this.prisma.message_logs.create({
            data: {
                channel: 'WHATSAPP',
                recipient_type: params.recipientType ?? null,
                recipient_id: params.recipientId ?? null,
                recipient_name: params.recipientName ?? null,
                recipient_address: params.to,
                message: params.message,
                status: 'PENDING',
                provider: 'meta_cloud_api',
                entity_type: params.entityType ?? null,
                entity_id: params.entityId ?? null,
                user_id: params.userId ?? null,
            },
        });

        const phoneNumberId = this.config.get<string>('META_WHATSAPP_PHONE_NUMBER_ID');
        const accessToken = this.config.get<string>('META_WHATSAPP_ACCESS_TOKEN');
        const apiVersion = this.config.get<string>('META_WHATSAPP_API_VERSION') ?? 'v21.0';

        if (!phoneNumberId || !accessToken) {
            this.logger.warn('WhatsApp send skipped — Meta WhatsApp Cloud API is not configured');
            return this.prisma.message_logs.update({
                where: { id: log.id },
                data: {
                    status: 'FAILED',
                    error_message: 'Meta WhatsApp Cloud API is not configured (missing META_WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_ACCESS_TOKEN)',
                },
            });
        }

        try {
            // Meta expects digits only, with country code, no leading '+' or spaces.
            const to = params.to.replace(/[^\d]/g, '');
            const res = await fetch(
                `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to,
                        type: 'text',
                        text: { body: params.message },
                    }),
                },
            );
            const body = await res.json();

            if (!res.ok) {
                const errMsg = body?.error?.message ?? `HTTP ${res.status}`;
                throw new Error(errMsg);
            }

            const providerMessageId = body?.messages?.[0]?.id ?? null;
            return await this.prisma.message_logs.update({
                where: { id: log.id },
                data: { status: 'SENT', provider_message_id: providerMessageId, sent_at: new Date() },
            });
        } catch (err: any) {
            this.logger.error(`WhatsApp send failed: ${err.message ?? err}`);
            return this.prisma.message_logs.update({
                where: { id: log.id },
                data: { status: 'FAILED', error_message: String(err.message ?? err) },
            });
        }
    }

    async sendEmail(params: SendEmailParams) {
        const log = await this.prisma.message_logs.create({
            data: {
                channel: 'EMAIL',
                recipient_type: params.recipientType ?? null,
                recipient_id: params.recipientId ?? null,
                recipient_name: params.recipientName ?? null,
                recipient_address: params.to,
                subject: params.subject,
                message: params.message,
                status: 'PENDING',
                provider: 'smtp',
                entity_type: params.entityType ?? null,
                entity_id: params.entityId ?? null,
                user_id: params.userId ?? null,
            },
        });

        const transporter = this.getMailTransporter();
        const from = this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('SMTP_USER');
        if (!transporter) {
            this.logger.warn('Email send skipped — SMTP is not configured');
            return this.prisma.message_logs.update({
                where: { id: log.id },
                data: {
                    status: 'FAILED',
                    error_message: 'SMTP is not configured (missing SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS)',
                },
            });
        }

        try {
            const info = await transporter.sendMail({
                from,
                to: params.to,
                subject: params.subject,
                text: params.message,
            });
            return await this.prisma.message_logs.update({
                where: { id: log.id },
                data: { status: 'SENT', provider_message_id: info.messageId, sent_at: new Date() },
            });
        } catch (err: any) {
            this.logger.error(`Email send failed: ${err.message ?? err}`);
            return this.prisma.message_logs.update({
                where: { id: log.id },
                data: { status: 'FAILED', error_message: String(err.message ?? err) },
            });
        }
    }
}
