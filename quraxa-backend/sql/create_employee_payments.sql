-- ============================================================================
-- employee_payments — salary settlements for staff (users table), separate
-- from doctor_payments (which is commission-based and tied to sessions).
--
-- Run this once against the curasys_medical database, e.g.:
--   Get-Content sql\create_employee_payments.sql -Raw | mysql -u root -p curasys_medical
-- ============================================================================

CREATE TABLE `employee_payments` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_number` varchar(30) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL COMMENT 'the employee being paid',
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_status` enum('PENDING','PAID','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `payment_method` enum('CASH','BANK_TRANSFER','CHEQUE') DEFAULT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `processed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employee_payments_number` (`payment_number`),
  KEY `idx_employee_payments_user` (`user_id`),
  KEY `fk_employee_payments_processor` (`processed_by`),
  KEY `idx_employee_payments_status` (`payment_status`),

  CONSTRAINT `fk_employee_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_employee_payments_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
