import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import MiniCalendar from '@/components/MiniCalendar';
import {
    Users, Stethoscope, CalendarDays, Receipt, AlertTriangle,
    ArrowRight, PackageX, Wallet, BellRing, TrendingUp, PieChart as PieChartIcon, Boxes,
    Users2, PartyPopper,
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Session {
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    max_patients: number;
    booked_count: number;
    slots_remaining: number;
    status: string;
    doctors: { full_name: string; specialties: { name: string } | null };
    rooms: { room_number: string } | null;
}
interface StockLevel {
    medicine_id: string; medicine_code: string; generic_name: string;
    brand_name: string | null; available_quantity: number;
    reorder_level: number; low_stock: boolean;
}
interface Invoice {
    id: string; invoice_number: string; invoice_type: string;
    total: string; status: string; created_at: string;
    patients: { full_name: string } | null;
}
interface QueueStatus {
    total: number; waiting: number; in_consultation: number;
    completed: number; not_checked_in: number;
}
interface Holiday { id: string; date: string; name: string; type: string; }

type Alert = { key: string; icon: React.ElementType; text: string; tone: 'red' | 'amber'; to: string };

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting(hour: number) {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
    PAID: '#16a34a', PARTIAL: '#f59e0b', PENDING: '#94a3b8', CANCELLED: '#dc2626',
};

function StatCard({
    icon: Icon, label, value, sub, loading,
}: { icon: React.ElementType; label: string; value: string; sub?: string; loading: boolean }) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <p className="text-sm text-slate-500">{label}</p>
                        {loading ? (
                            <div className="h-8 w-16 mt-1 rounded bg-slate-100 animate-pulse" />
                        ) : (
                            <p className="text-2xl font-bold text-slate-800 truncate">{value}</p>
                        )}
                        {sub && !loading && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
                    </div>
                    <div className="shrink-0 rounded-lg bg-slate-100 p-2.5 text-slate-600">
                        <Icon size={20} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function Dashboard() {
    const { user, hasPermission } = useAuth();
    const [now, setNow] = useState(new Date());

    const [patientCount, setPatientCount] = useState<number | null>(null);
    const [doctorCount, setDoctorCount] = useState<number | null>(null);
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [stock, setStock] = useState<StockLevel[] | null>(null);
    const [invoices, setInvoices] = useState<Invoice[] | null>(null);
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [holidays, setHolidays] = useState<Holiday[]>([]);

    const [sessionPage, setSessionPage] = useState(1);
    const [sessionPageSize, setSessionPageSize] = useState(5);
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoicePageSize, setInvoicePageSize] = useState(5);

    // The calendar defaults to today but the doctor can click any day to
    // browse that day's sessions in the table below without leaving the dashboard.
    const [selectedDate, setSelectedDate] = useState(todayStr());

    // Live clock, ticks every second
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const canSeePatients = hasPermission('patient.view');
    const canSeeDoctors = hasPermission('doctor.view');
    const canSeeSessions = hasPermission('session.view');
    const canSeeStock = hasPermission('stock.view');
    const canSeeInvoices = hasPermission('invoice.view');

    useEffect(() => {
        if (canSeePatients) {
            api.get('/patients', { params: { limit: 1 } })
                .then((r) => setPatientCount(r.data.total))
                .catch(() => setPatientCount(null));
        }
    }, [canSeePatients]);

    useEffect(() => {
        if (canSeeDoctors) {
            api.get('/doctors').then((r) => setDoctorCount(r.data.length)).catch(() => setDoctorCount(null));
        }
    }, [canSeeDoctors]);

    useEffect(() => {
        if (canSeeSessions) {
            api.get('/sessions').then((r) => setSessions(r.data)).catch(() => setSessions([]));
        }
    }, [canSeeSessions]);

    useEffect(() => {
        if (canSeeStock) {
            api.get('/pharmacy/stock').then((r) => setStock(r.data)).catch(() => setStock([]));
        }
    }, [canSeeStock]);

    useEffect(() => {
        if (canSeeInvoices) {
            api.get('/billing/invoices').then((r) => setInvoices(r.data)).catch(() => setInvoices([]));
        }
    }, [canSeeInvoices]);

    useEffect(() => {
        if (canSeeSessions) {
            api.get('/appointments/queue-status/today').then((r) => setQueueStatus(r.data)).catch(() => setQueueStatus(null));
        }
    }, [canSeeSessions]);

    // Holidays are visible to everyone (not permission-gated) — they drive
    // the calendar tint/tooltip and the "Upcoming" list beside it.
    useEffect(() => {
        api.get('/holidays').then((r) => setHolidays(r.data)).catch(() => setHolidays([]));
    }, []);

    const today = todayStr();

    const holidayMap = useMemo(
        () => new Map(holidays.map((h) => [h.date.slice(0, 10), h.name])),
        [holidays],
    );
    const upcomingHolidays = useMemo(
        () => holidays
            .filter((h) => h.date.slice(0, 10) >= today)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 3),
        [holidays, today],
    );

    const todaySessions = useMemo(
        () => (sessions ?? []).filter((s) => s.session_date.slice(0, 10) === today)
            .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        [sessions, today],
    );
    const todayBookedTotal = todaySessions.reduce((sum, s) => sum + s.booked_count, 0);

    // The sessions table follows whatever day is selected on the calendar
    // (defaults to today); KPI cards and alerts above always stay tied to
    // the real "today" regardless of what the doctor is browsing.
    const selectedDateSessions = useMemo(
        () => (sessions ?? []).filter((s) => s.session_date.slice(0, 10) === selectedDate)
            .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        [sessions, selectedDate],
    );
    const sessionDates = useMemo(
        () => new Set((sessions ?? []).map((s) => s.session_date.slice(0, 10))),
        [sessions],
    );

    const lowStockItems = useMemo(() => (stock ?? []).filter((s) => s.low_stock), [stock]);

    const pendingInvoices = useMemo(
        () => (invoices ?? []).filter((i) => i.status !== 'PAID'),
        [invoices],
    );
    const revenueToday = useMemo(
        () => (invoices ?? [])
            .filter((i) => i.created_at.slice(0, 10) === today && i.status === 'PAID')
            .reduce((sum, i) => sum + Number(i.total), 0),
        [invoices, today],
    );
    useEffect(() => { setSessionPage(1); }, [selectedDate, selectedDateSessions.length]);
    useEffect(() => { setInvoicePage(1); }, [invoices]);

    const pagedSessions = selectedDateSessions.slice(
        (sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize,
    );
    const pagedInvoices = (invoices ?? []).slice(
        (invoicePage - 1) * invoicePageSize, invoicePage * invoicePageSize,
    );

    // Revenue trend — paid invoice totals for the last 7 days
    const revenueTrend = useMemo(() => {
        const days: { key: string; label: string; total: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            days.push({ key, label: d.toLocaleDateString([], { weekday: 'short' }), total: 0 });
        }
        (invoices ?? []).filter((i) => i.status === 'PAID').forEach((i) => {
            const key = i.created_at.slice(0, 10);
            const day = days.find((d) => d.key === key);
            if (day) day.total += Number(i.total);
        });
        return days;
    }, [invoices]);

    // Invoice status breakdown
    const invoiceStatusData = useMemo(() => {
        const counts: Record<string, number> = {};
        (invoices ?? []).forEach((i) => { counts[i.status] = (counts[i.status] ?? 0) + 1; });
        return Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => ({ name: status, value: count, color: INVOICE_STATUS_COLORS[status] ?? '#94a3b8' }));
    }, [invoices]);

    // Stock health breakdown
    const stockHealthData = useMemo(() => {
        const healthy = (stock ?? []).filter((s) => !s.low_stock).length;
        const low = (stock ?? []).filter((s) => s.low_stock).length;
        return [
            { name: 'Healthy', value: healthy, color: '#16a34a' },
            { name: 'Low Stock', value: low, color: '#dc2626' },
        ].filter((d) => d.value > 0);
    }, [stock]);

    // Today's patient queue breakdown
    const queueStatusData = useMemo(() => {
        if (!queueStatus) return [];
        return [
            { name: 'Waiting', value: queueStatus.waiting, color: '#f59e0b' },
            { name: 'In Consultation', value: queueStatus.in_consultation, color: '#2563eb' },
            { name: 'Completed', value: queueStatus.completed, color: '#16a34a' },
            { name: 'Not Checked In', value: queueStatus.not_checked_in, color: '#94a3b8' },
        ].filter((d) => d.value > 0);
    }, [queueStatus]);

    // Actionable alerts, most urgent first
    const alerts: Alert[] = useMemo(() => {
        const list: Alert[] = [];
        lowStockItems.slice(0, 5).forEach((s) => list.push({
            key: `stock-${s.medicine_id}`,
            icon: PackageX,
            text: `${s.generic_name} is low on stock (${s.available_quantity} left)`,
            tone: 'red',
            to: '/pharmacy',
        }));
        todaySessions.filter((s) => s.slots_remaining <= 2 && s.slots_remaining > 0).forEach((s) => list.push({
            key: `session-${s.id}`,
            icon: AlertTriangle,
            text: `${s.doctors.full_name}'s session today has only ${s.slots_remaining} slot(s) left`,
            tone: 'amber',
            to: '/sessions',
        }));
        if (pendingInvoices.length > 0) {
            list.push({
                key: 'pending-invoices',
                icon: Wallet,
                text: `${pendingInvoices.length} invoice(s) awaiting payment`,
                tone: 'amber',
                to: '/billing',
            });
        }
        return list;
    }, [lowStockItems, todaySessions, pendingInvoices]);

    const sectionsLoading = [
        canSeePatients && patientCount === null,
        canSeeDoctors && doctorCount === null,
        canSeeSessions && sessions === null,
        canSeeStock && stock === null,
        canSeeInvoices && invoices === null,
    ];
    const anyStatLoading = (loading: boolean) => loading;

    // Revenue + Invoice Status are gated by canSeeInvoices (2 cards), Stock
    // Health by canSeeStock (1 card), Queue Status by canSeeSessions (1 card)
    // — size the grid to whatever's visible so chart cards line up evenly.
    const chartCardCount = (canSeeInvoices ? 2 : 0) + (canSeeStock ? 1 : 0) + (canSeeSessions ? 1 : 0);
    const chartGridClass = chartCardCount >= 4 ? 'xl:grid-cols-4 lg:grid-cols-2'
        : chartCardCount === 3 ? 'lg:grid-cols-3'
            : chartCardCount === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1';

    return (
        <div>
            {/* Welcome hero + calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
                <div className="lg:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-primary)] to-[var(--brand-secondary)] p-5 sm:p-6 flex flex-col justify-center">
                    <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/10" />
                    <div className="pointer-events-none absolute bottom-0 -left-8 h-28 w-28 rounded-full bg-[var(--brand-accent)]/20" />

                    <div className="relative">
                        <h1 className="text-xl sm:text-2xl font-bold text-white">
                            {greeting(now.getHours())}, {user?.full_name?.split(' ')[0]}
                        </h1>
                        <p className="mt-1 text-sm text-white/70 max-w-sm">
                            Here's what's happening at the center today. Stay aware, stay ahead.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/90">
                            <span className="flex items-center gap-1.5">
                                <CalendarDays size={15} />
                                {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                            <span className="flex items-center gap-1.5 tabular-nums">
                                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {user?.role && (
                                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">{user.role}</span>
                            )}
                        </div>
                    </div>
                </div>

                <Card>
                    <CardContent className="pt-4">
                        <MiniCalendar
                            markedDates={sessionDates}
                            holidays={holidayMap}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            compact
                        />
                        {upcomingHolidays.length > 0 && (
                            <div className="mt-3 pt-2 border-t">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                                    <PartyPopper size={11} />Upcoming Holidays
                                </p>
                                <div className="space-y-1">
                                    {upcomingHolidays.slice(0, 2).map((h) => (
                                        <div key={h.id} className="flex items-center justify-between text-xs">
                                            <span className="text-slate-600 truncate">{h.name}</span>
                                            <span className="text-slate-400 shrink-0 ml-2">
                                                {new Date(h.date.slice(0, 10) + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* KPI stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {canSeePatients && (
                    <StatCard icon={Users} label="Total Patients" loading={anyStatLoading(patientCount === null)}
                        value={String(patientCount ?? 0)} />
                )}
                {canSeeDoctors && (
                    <StatCard icon={Stethoscope} label="Total Doctors" loading={anyStatLoading(doctorCount === null)}
                        value={String(doctorCount ?? 0)} />
                )}
                {canSeeSessions && (
                    <StatCard icon={CalendarDays} label="Today's Sessions" loading={anyStatLoading(sessions === null)}
                        value={String(todaySessions.length)}
                        sub={todaySessions.length > 0 ? `${todayBookedTotal} patient(s) booked` : undefined} />
                )}
                {canSeeInvoices && (
                    <StatCard icon={Wallet} label="Revenue Today" loading={anyStatLoading(invoices === null)}
                        value={`LKR ${revenueToday.toFixed(0)}`}
                        sub={pendingInvoices.length > 0 ? `${pendingInvoices.length} invoice(s) pending` : 'All settled'} />
                )}
            </div>

            {/* Charts */}
            {(canSeeInvoices || canSeeStock || canSeeSessions) && (
                <div className={`grid grid-cols-1 ${chartGridClass} gap-6 mb-6`}>
                    {canSeeInvoices && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <TrendingUp size={16} />Revenue — Last 7 Days
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {invoices === null ? (
                                    <div className="h-64 rounded bg-slate-100 animate-pulse" />
                                ) : (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={revenueTrend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }}
                                                axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }}
                                                axisLine={false} tickLine={false} width={48} />
                                            <Tooltip
                                                cursor={{ fill: '#f1f5f9' }}
                                                formatter={(value) => [`LKR ${Number(value).toFixed(2)}`, 'Revenue']}
                                                contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                                            />
                                            <Bar dataKey="total" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {canSeeInvoices && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <PieChartIcon size={16} />Invoice Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {invoices === null ? (
                                    <div className="h-64 rounded bg-slate-100 animate-pulse" />
                                ) : invoiceStatusData.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-20 text-center">No invoices yet</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <PieChart>
                                            <Pie
                                                data={invoiceStatusData} dataKey="value" nameKey="name"
                                                innerRadius={55} outerRadius={85} paddingAngle={2}
                                            >
                                                {invoiceStatusData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value, name) => [`${value} invoice(s)`, name]}
                                                contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                                            />
                                            <Legend
                                                verticalAlign="bottom" height={32}
                                                formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {canSeeStock && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Boxes size={16} />Stock Health
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {stock === null ? (
                                    <div className="h-64 rounded bg-slate-100 animate-pulse" />
                                ) : stockHealthData.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-20 text-center">No stock data</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <PieChart>
                                            <Pie
                                                data={stockHealthData} dataKey="value" nameKey="name"
                                                innerRadius={55} outerRadius={85} paddingAngle={2}
                                            >
                                                {stockHealthData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value, name) => [`${value} item(s)`, name]}
                                                contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                                            />
                                            <Legend
                                                verticalAlign="bottom" height={32}
                                                formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {canSeeSessions && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Users2 size={16} />Patient Queue Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {queueStatus === null ? (
                                    <div className="h-64 rounded bg-slate-100 animate-pulse" />
                                ) : queueStatusData.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-20 text-center">No patients in today's queue</p>
                                ) : (
                                    <>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <PieChart>
                                                <Pie
                                                    data={queueStatusData} dataKey="value" nameKey="name"
                                                    innerRadius={55} outerRadius={85} paddingAngle={2}
                                                >
                                                    {queueStatusData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value, name) => [`${value} patient(s)`, name]}
                                                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <p className="text-center text-xs text-slate-400 -mt-2">
                                            {queueStatus!.total} total today
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                                            {queueStatusData.map((d) => (
                                                <span key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                                    {d.name} ({d.value})
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions on the selected day */}
                {canSeeSessions && (
                    <Card className="lg:col-span-2">
                        <CardHeader className="flex items-center justify-between space-y-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CalendarDays size={16} />
                                {selectedDate === todayStr()
                                    ? "Today's Sessions"
                                    : `Sessions — ${new Date(selectedDate + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </CardTitle>
                            <Link to="/sessions" className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                                View all<ArrowRight size={12} />
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {sessions === null ? (
                                <div className="space-y-2 py-2">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
                                    ))}
                                </div>
                            ) : selectedDateSessions.length === 0 ? (
                                <p className="text-sm text-slate-400 py-8 text-center">
                                    {selectedDate === todayStr() ? 'No sessions scheduled for today' : 'No sessions scheduled for this day'}
                                </p>
                            ) : (
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Time</TableHead>
                                                <TableHead>Doctor</TableHead>
                                                <TableHead>Room</TableHead>
                                                <TableHead>Booked</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pagedSessions.map((s) => (
                                                <TableRow key={s.id}>
                                                    <TableCell className="text-sm">
                                                        {s.start_time.slice(11, 16)}–{s.end_time.slice(11, 16)}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        {s.doctors.full_name}
                                                        <span className="block text-xs text-slate-400 font-normal">
                                                            {s.doctors.specialties?.name}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>{s.rooms?.room_number ?? '-'}</TableCell>
                                                    <TableCell>
                                                        <span className={s.slots_remaining <= 2 ? 'text-amber-600 font-semibold' : ''}>
                                                            {s.booked_count}/{s.max_patients}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs px-2 py-1 rounded bg-slate-100">{s.status}</span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={sessionPage} pageSize={sessionPageSize} total={selectedDateSessions.length}
                                        onPageChange={setSessionPage}
                                        onPageSizeChange={(n) => { setSessionPageSize(n); setSessionPage(1); }}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Alerts / notifications */}
                <Card>
                    <CardHeader className="flex items-center justify-between space-y-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BellRing size={16} />Notifications
                        </CardTitle>
                        {alerts.length > 0 && (
                            <span className="text-xs font-semibold rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                                {alerts.length}
                            </span>
                        )}
                    </CardHeader>
                    <CardContent>
                        {sectionsLoading.some((l) => l) && alerts.length === 0 ? (
                            <div className="space-y-2 py-2">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
                                ))}
                            </div>
                        ) : alerts.length === 0 ? (
                            <p className="text-sm text-slate-400 py-8 text-center">You're all caught up — no alerts</p>
                        ) : (
                            <ul className="space-y-2">
                                {alerts.map((a) => {
                                    const Icon = a.icon;
                                    return (
                                        <li key={a.key}>
                                            <Link
                                                to={a.to}
                                                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-slate-50 ${a.tone === 'red' ? 'border-red-100 bg-red-50/50' : 'border-amber-100 bg-amber-50/50'
                                                    }`}
                                            >
                                                <Icon size={15} className={`mt-0.5 shrink-0 ${a.tone === 'red' ? 'text-red-600' : 'text-amber-600'}`} />
                                                <span className="text-slate-700">{a.text}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Invoices */}
            {canSeeInvoices && (
                <Card className="mt-6">
                    <CardHeader className="flex items-center justify-between space-y-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Receipt size={16} />Invoices
                        </CardTitle>
                        <Link to="/billing" className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                            View all<ArrowRight size={12} />
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {invoices === null ? (
                            <div className="space-y-2 py-2">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
                                ))}
                            </div>
                        ) : invoices.length === 0 ? (
                            <p className="text-sm text-slate-400 py-8 text-center">No invoices yet</p>
                        ) : (
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Invoice #</TableHead>
                                            <TableHead>Patient</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Total</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pagedInvoices.map((inv) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                                                <TableCell>{inv.patients?.full_name ?? 'Walk-in'}</TableCell>
                                                <TableCell>{inv.invoice_type}</TableCell>
                                                <TableCell className="font-semibold">LKR {Number(inv.total).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <span className={`text-xs px-2 py-1 rounded ${inv.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                                        inv.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-700'
                                                        }`}>{inv.status}</span>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-500">{inv.created_at.slice(0, 10)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <Pagination
                                    page={invoicePage} pageSize={invoicePageSize} total={invoices.length}
                                    onPageChange={setInvoicePage}
                                    onPageSizeChange={(n) => { setInvoicePageSize(n); setInvoicePage(1); }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
