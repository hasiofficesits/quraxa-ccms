-- ============================================================================
-- Adds per-item fulfillment tracking to prescriptions, and links a
-- prescription to the pharmacy invoice created when it's finalized.
--
-- Run this once against the curasys_medical database, e.g.:
--   Get-Content sql\add_prescription_fulfillment.sql -Raw | mysql -u root -p curasys_medical
-- ============================================================================

ALTER TABLE `prescription_items`
  ADD COLUMN `status` ENUM('PENDING','ADDED','UNAVAILABLE') NOT NULL DEFAULT 'PENDING' AFTER `instructions`;

ALTER TABLE `prescriptions`
  ADD COLUMN `invoice_id` bigint(20) UNSIGNED DEFAULT NULL AFTER `doctor_id`,
  ADD KEY `idx_prescriptions_invoice` (`invoice_id`),
  ADD CONSTRAINT `fk_prescriptions_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`);
