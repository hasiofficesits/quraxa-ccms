import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';

interface Session { id: string; session_date: string; doctors: { full_name: string }; }
interface SettlementPreview {
    session_id: string; doctor_name: string; session_date: string;
    already_settled: boolean;
    existing_payment: {
        payment_number: string; payment_status: string; doctor_share: string; hospital_share: string;
    } | null;
    total_patients: number; channel_fee: number; gross_amount: number;
    commission_rate: number; doctor_share: number; hospital_share: number;
}
interface Employee { id: string; full_name: string; username: string; roles: { name: string }; }
interface EmployeePayment {
    id: string; payment_number: string; amount: string;
    payment_status: string; payment_method: string | null;
    period_start: string | null; period_end: string | null; created_at: string;
    employee: { full_name: string; username: string };
}

export default function SalarySettlements() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Salary Settlements</h1>
            <p className="text-slate-500 mb-6">Doctor commission and employee salary settlements</p>

            <Tabs defaultValue="doctors">
                <TabsList>
                    <TabsTrigger value="doctors">Doctor Settlements</TabsTrigger>
                    <TabsTrigger value="employees">Employee Settlements</TabsTrigger>
                </TabsList>

                <TabsContent value="doctors">
                    <DoctorSettlements />
                </TabsContent>

                <TabsContent value="employees">
                    <EmployeeSettlements />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function DoctorSettlements() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [settleSession, setSettleSession] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [preview, setPreview] = useState<SettlementPreview | null>(null);

    // Editable, pre-filled from the preview — the base inputs that drive the calc.
    const [totalPatients, setTotalPatients] = useState('');
    const [channelFee, setChannelFee] = useState('');
    const [commissionRate, setCommissionRate] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
    const [notes, setNotes] = useState('');
    const [settling, setSettling] = useState(false);
    const [lastSettled, setLastSettled] = useState<any>(null);

    useEffect(() => {
        api.get('/sessions').then((r) => setSessions(r.data)).catch(() => { });
    }, []);

    // Derived, always consistent with the editable base inputs above.
    const gross = (Number(totalPatients) || 0) * (Number(channelFee) || 0);
    const rate = Number(commissionRate) || 0;
    const doctorShare = Math.round(gross * rate) / 100;
    const hospitalShare = Math.round(gross * (100 - rate)) / 100;

    const loadPreview = async (sessionId: string) => {
        setSettleSession(sessionId);
        setPreview(null);
        setLastSettled(null);
        if (!sessionId) return;
        setPreviewLoading(true);
        try {
            const res = await api.get(`/billing/settle-doctor/preview/${sessionId}`);
            const p: SettlementPreview = res.data;
            setPreview(p);
            setTotalPatients(String(p.total_patients));
            setChannelFee(String(p.channel_fee));
            setCommissionRate(String(p.commission_rate));
        } catch {
            toast.error('Failed to load session data');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSettle = async () => {
        if (!preview) return;
        setSettling(true);
        try {
            const res = await api.post('/billing/settle-doctor', {
                session_id: Number(preview.session_id),
                total_patients: Number(totalPatients) || 0,
                channel_fee: Number(channelFee) || 0,
                gross_amount: gross,
                commission_rate: rate,
                doctor_share: doctorShare,
                hospital_share: hospitalShare,
                payment_method: paymentMethod,
                notes: notes || undefined,
            });
            toast.success(`Settled: ${res.data.payment_number}`);
            setLastSettled(res.data);
            setPreview(null);
            setSettleSession('');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Settlement failed');
        } finally {
            setSettling(false);
        }
    };

    return (
        <Card className="overflow-visible"><CardContent className="pt-6 space-y-4">
            <div className="space-y-2 max-w-md">
                <Label>Session to settle</Label>
                <SearchableSelect
                    options={sessions.map((s) => ({
                        value: s.id,
                        label: `${s.doctors.full_name} — ${s.session_date.slice(0, 10)}`,
                    }))}
                    value={settleSession}
                    onChange={loadPreview}
                    placeholder="Search sessions..."
                    searchPlaceholder="Search by doctor or date..."
                />
            </div>

            {previewLoading && <p className="text-sm text-slate-400">Loading session data...</p>}

            {preview?.already_settled && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-md max-w-md text-sm">
                    This session is already settled ({preview.existing_payment?.payment_number},{' '}
                    {preview.existing_payment?.payment_status}).
                </div>
            )}

            {preview && !preview.already_settled && (
                <div className="space-y-4 max-w-lg">
                    <p className="text-sm text-slate-500">
                        {preview.doctor_name} — {preview.session_date.slice(0, 10)}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Patients Attended</Label>
                            <Input type="number" value={totalPatients} onChange={(e) => setTotalPatients(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Channel Fee</Label>
                            <Input type="number" value={channelFee} onChange={(e) => setChannelFee(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Commission %</Label>
                            <Input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-md border space-y-1 text-sm">
                        <div className="flex justify-between"><span>Gross:</span><span>LKR {gross.toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold text-green-700">
                            <span>Doctor share:</span><span>LKR {doctorShare.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span>Hospital share:</span><span>LKR {hospitalShare.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Payment Method</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CASH">Cash</option>
                                <option value="CHEQUE">Cheque</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                        </div>
                    </div>

                    <Button onClick={handleSettle} disabled={settling}>
                        {settling ? 'Processing...' : 'Proceed to Pay'}
                    </Button>
                </div>
            )}

            {lastSettled && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md max-w-md">
                    <h3 className="font-bold mb-2 text-green-800">{lastSettled.payment_number} — Settled</h3>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>Doctor share:</span><span>LKR {Number(lastSettled.doctor_share).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Hospital share:</span><span>LKR {Number(lastSettled.hospital_share).toFixed(2)}</span></div>
                    </div>
                </div>
            )}
        </CardContent></Card>
    );
}

function EmployeeSettlements() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payments, setPayments] = useState<EmployeePayment[]>([]);
    const [loading, setLoading] = useState(false);

    const [empId, setEmpId] = useState('');
    const [amount, setAmount] = useState('');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
    const [notes, setNotes] = useState('');

    const loadPayments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/billing/employee-payments');
            setPayments(res.data);
        } catch {
            toast.error('Failed to load employee payments');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        api.get('/billing/employees-list').then((r) => setEmployees(r.data)).catch(() => { });
        loadPayments();
    }, [loadPayments]);

    const handleSettle = async () => {
        if (!empId) { toast.error('Select an employee'); return; }
        if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }
        try {
            const res = await api.post('/billing/settle-employee', {
                user_id: Number(empId),
                amount: Number(amount),
                period_start: periodStart || undefined,
                period_end: periodEnd || undefined,
                payment_method: paymentMethod || undefined,
                notes: notes || undefined,
            });
            toast.success(`Settled: ${res.data.payment_number}`);
            setEmpId(''); setAmount(''); setPeriodStart(''); setPeriodEnd(''); setNotes('');
            loadPayments();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Settlement failed');
        }
    };

    const handleMarkPaid = async (id: string) => {
        try {
            await api.patch(`/billing/employee-payment/${id}/paid`);
            toast.success('Marked as paid');
            loadPayments();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update');
        }
    };

    return (
        <div className="space-y-6">
            <Card><CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Employee *</Label>
                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                            value={empId} onChange={(e) => setEmpId(e.target.value)}>
                            <option value="">Select employee</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>{e.full_name} — {e.roles.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Amount (LKR) *</Label>
                        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label>Period Start</Label>
                        <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Period End</Label>
                        <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                            value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CASH">Cash</option>
                            <option value="CHEQUE">Cheque</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </div>
                <Button onClick={handleSettle}>Settle Payment</Button>
            </CardContent></Card>

            <div className="bg-white rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Payment #</TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                        ) : payments.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No employee payments yet</TableCell></TableRow>
                        ) : payments.map((p) => (
                            <TableRow key={p.id}>
                                <TableCell className="font-mono text-sm">{p.payment_number}</TableCell>
                                <TableCell>{p.employee.full_name}</TableCell>
                                <TableCell className="font-bold">LKR {Number(p.amount).toFixed(2)}</TableCell>
                                <TableCell className="text-sm text-slate-500">
                                    {p.period_start && p.period_end
                                        ? `${p.period_start.slice(0, 10)} – ${p.period_end.slice(0, 10)}`
                                        : '-'}
                                </TableCell>
                                <TableCell>{p.payment_method ?? '-'}</TableCell>
                                <TableCell>
                                    <span className={`text-xs px-2 py-1 rounded ${p.payment_status === 'PAID' ? 'bg-green-100 text-green-700' :
                                        p.payment_status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>{p.payment_status}</span>
                                </TableCell>
                                <TableCell className="text-right">
                                    {p.payment_status === 'PENDING' && (
                                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)}>
                                            Mark Paid
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
