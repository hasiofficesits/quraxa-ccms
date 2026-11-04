-- ============================================================================
-- message_logs — generic outbound/inbound communication log for the whole
-- system (WhatsApp today; SMS / push / email-via-provider later reuse the
-- same table instead of each channel getting its own log table).
--
-- Run this once against the curasys_medical database, e.g.:
--   mysql -u root -p curasys_medical < create_message_logs.sql
-- ============================================================================

CREATE TABLE `message_logs` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,

  -- What kind of message, and which way it went (INBOUND reserved for future
  -- use, e.g. capturing WhatsApp replies via webhook).
  `channel` enum('WHATSAPP','EMAIL','SMS','PUSH') NOT NULL,
  `direction` enum('OUTBOUND','INBOUND') NOT NULL DEFAULT 'OUTBOUND',

  -- Who it was sent to. recipient_type/recipient_id are polymorphic (no FK)
  -- so the same table can address doctors, patients, or users.
  `recipient_type` varchar(30) DEFAULT NULL,
  `recipient_id` bigint(20) UNSIGNED DEFAULT NULL,
  `recipient_name` varchar(120) DEFAULT NULL,
  `recipient_address` varchar(255) NOT NULL COMMENT 'phone number (WhatsApp/SMS) or email address actually used',

  `subject` varchar(255) DEFAULT NULL COMMENT 'email subject; unused for WhatsApp/SMS',
  `message` text NOT NULL,

  `status` enum('PENDING','SENT','FAILED','DELIVERED','READ') NOT NULL DEFAULT 'PENDING',
  `provider` varchar(50) DEFAULT NULL COMMENT 'e.g. twilio, smtp',
  `provider_message_id` varchar(255) DEFAULT NULL COMMENT 'Twilio SID / SMTP messageId, for tracing',
  `error_message` text DEFAULT NULL,

  -- What triggered this message, e.g. entity_type='session', entity_id=<doctor_sessions.id>
  `entity_type` varchar(60) DEFAULT NULL,
  `entity_id` bigint(20) UNSIGNED DEFAULT NULL,

  `user_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'staff user who triggered the send',

  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_message_logs_channel` (`channel`),
  KEY `idx_message_logs_status` (`status`),
  KEY `idx_message_logs_entity` (`entity_type`,`entity_id`),
  KEY `idx_message_logs_recipient` (`recipient_type`,`recipient_id`),
  KEY `fk_message_logs_user` (`user_id`),

  CONSTRAINT `fk_message_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
