// Static metadata the frontend uses to build the Reports nav and filter
// forms without hand-coding each one. `permission` gates both listing and
// running/exporting the report (checked again server-side per request).

export type ReportFilterType = 'date' | 'select' | 'text';

export interface ReportFilterDef {
    key: string;
    label: string;
    type: ReportFilterType;
    options?: { value: string; label: string }[];
    // Tells the frontend which lookup endpoint to populate a 'select' from,
    // for filters whose options are dynamic (doctors, medicines...).
    optionsSource?: 'doctors' | 'medicines' | 'auditUsers';
    default?: string;
}

export interface ReportDef {
    id: string;
    category: string;
    title: string;
    description: string;
    permission: string;
    filters: ReportFilterDef[];
}

export const REPORT_CATEGORIES = [
    'Appointments & Sessions',
    'Pharmacy & Inventory',
    'Financial',
    'Performance',
    'Security & Compliance',
] as const;

const dateRangeFilters: ReportFilterDef[] = [
    { key: 'start_date', label: 'From', type: 'date' },
    { key: 'end_date', label: 'To', type: 'date' },
];

export const REPORTS: ReportDef[] = [
    {
        id: 'daily-appointments',
        category: 'Appointments & Sessions',
        title: 'Daily Appointments / Session Summary',
        description: 'Every appointment booked in the selected date range, with status and channel.',
        permission: 'report.operational',
        filters: [
            ...dateRangeFilters,
            { key: 'doctor_id', label: 'Doctor', type: 'select', optionsSource: 'doctors' },
            {
                key: 'status', label: 'Status', type: 'select',
                options: [
                    { value: 'BOOKED', label: 'Booked' }, { value: 'ARRIVED', label: 'Arrived' },
                    { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
                ],
            },
        ],
    },
    {
        id: 'doctor-session-report',
        category: 'Appointments & Sessions',
        title: 'Doctor Session Report',
        description: 'Session-level booking load and fill rate per doctor.',
        permission: 'report.operational',
        filters: [
            ...dateRangeFilters,
            { key: 'doctor_id', label: 'Doctor', type: 'select', optionsSource: 'doctors' },
        ],
    },
    {
        id: 'low-stock',
        category: 'Pharmacy & Inventory',
        title: 'Low Stock Report',
        description: 'Medicines at or below their reorder level right now.',
        permission: 'report.operational',
        filters: [],
    },
    {
        id: 'near-expiry',
        category: 'Pharmacy & Inventory',
        title: 'Near-Expiry Report',
        description: 'Batches expiring within a chosen number of days.',
        permission: 'report.operational',
        filters: [
            { key: 'days', label: 'Within (days)', type: 'text', default: '90' },
        ],
    },
    {
        id: 'stock-movement',
        category: 'Pharmacy & Inventory',
        title: 'Stock Movement / Dispensing Report',
        description: 'Every stock in/out movement in the selected date range.',
        permission: 'report.operational',
        filters: [
            ...dateRangeFilters,
            { key: 'medicine_id', label: 'Medicine', type: 'select', optionsSource: 'medicines' },
            {
                key: 'movement_type', label: 'Movement Type', type: 'select',
                options: [
                    { value: 'RECEIVE', label: 'Receive' }, { value: 'SALE', label: 'Sale' },
                    { value: 'RETURN_SUPPLIER', label: 'Return to Supplier' }, { value: 'RETURN_CUSTOMER', label: 'Return from Customer' },
                    { value: 'ADJUSTMENT', label: 'Adjustment' }, { value: 'EXPIRED', label: 'Expired' },
                ],
            },
        ],
    },
    {
        id: 'expired-stock',
        category: 'Pharmacy & Inventory',
        title: 'Expired Stock / Wastage Report',
        description: 'Batches already expired that still carry unsold quantity — the direct cost of wastage.',
        permission: 'report.operational',
        filters: [],
    },
    {
        id: 'best-selling-medicines',
        category: 'Pharmacy & Inventory',
        title: 'Best-Selling Medicines',
        description: 'Medicines ranked by quantity and revenue sold in the selected range.',
        permission: 'report.operational',
        filters: dateRangeFilters,
    },
    {
        id: 'revenue-by-period',
        category: 'Financial',
        title: 'Revenue Report by Period',
        description: 'Paid revenue grouped by day, week, or month.',
        permission: 'report.financial',
        filters: [
            ...dateRangeFilters,
            {
                key: 'group_by', label: 'Group By', type: 'select', default: 'day',
                options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],
            },
            {
                key: 'invoice_type', label: 'Invoice Type', type: 'select',
                options: [{ value: 'CHANNEL', label: 'Channel' }, { value: 'PHARMACY', label: 'Pharmacy' }, { value: 'MIXED', label: 'Mixed' }],
            },
        ],
    },
    {
        id: 'doctor-commission',
        category: 'Financial',
        title: 'Doctor Payment / Commission Settlement Report',
        description: 'Doctor payment runs — gross amount, commission split, and settlement status.',
        permission: 'report.financial',
        filters: [
            ...dateRangeFilters,
            { key: 'doctor_id', label: 'Doctor', type: 'select', optionsSource: 'doctors' },
            {
                key: 'payment_status', label: 'Status', type: 'select',
                options: [{ value: 'PENDING', label: 'Pending' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }],
            },
        ],
    },
    {
        id: 'outstanding-invoices',
        category: 'Financial',
        title: 'Outstanding / Unpaid Invoices',
        description: 'Invoices that are still PENDING or PARTIAL, with balance due.',
        permission: 'report.financial',
        filters: dateRangeFilters,
    },
    {
        id: 'top-doctors',
        category: 'Performance',
        title: 'Top Doctors',
        description: 'Doctors ranked by patients seen and revenue generated.',
        permission: 'report.financial',
        filters: dateRangeFilters,
    },
    {
        id: 'audit-log-report',
        category: 'Security & Compliance',
        title: 'Audit Log Report',
        description: 'Exportable copy of the system audit trail.',
        permission: 'audit.view',
        filters: [
            ...dateRangeFilters,
            { key: 'user_id', label: 'User', type: 'select', optionsSource: 'auditUsers' },
            { key: 'action', label: 'Action contains', type: 'text' },
        ],
    },
];
