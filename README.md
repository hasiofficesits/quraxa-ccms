# QuraXa — Channeling Center Management System

A full-stack management system for medical channeling centers, covering patient
booking, doctor sessions, clinical consultations, pharmacy inventory (FEFO), and
billing — with role-based access control.

Built with **React**, **NestJS**, **Prisma**, and **MySQL**.

---

## Features

- **Authentication & RBAC** — JWT login with bcrypt, granular role-based permissions
- **Patient management** — registration, search, history, soft-delete
- **Doctors & sessions** — doctor profiles, room and session scheduling
- **Appointments & queue** — booking with temporary numbers, check-in with live queue tokens
- **Clinical** — consultations, diagnoses, prescriptions, diagnostic test orders
- **Pharmacy** — GRN stock receiving and FEFO (First-Expired-First-Out) dispensing with full audit trail
- **Billing** — flexible invoicing and doctor commission settlement
- **Audit logging** — every sensitive action recorded

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| ORM | Prisma |
| Database | MySQL |
| Auth | JWT, bcrypt |
