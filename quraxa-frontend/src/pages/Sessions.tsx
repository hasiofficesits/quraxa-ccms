import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { Plus, CalendarDays, UserPlus, LogIn, Pencil, Ban, Trash2, Search, RotateCcw } from 'lucide-react';

interface Session {
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    max_patients: number;
    channel_fee: string;
    hospital_fee: string;
    booked_count: number;
    slots_remaining: number;
    status: string;
    doctors: { full_name: string; specialties: { name: string } | null };
    rooms: { room_number: string } | null;
}
interface Doctor { id: string; full_name: string; }
interface Room { id: string; room_number: string; name: string | null; }
interface Patient { id: string; patient_code: string; full_name: string; phone: string | null; }
interface Appointment {
    id: string; booking_number: number; booking_reference: string; status: string;
    patients: { full_name: string; patient_code: string };
    visits: { token_number: number; status: string } | null;
}
interface QueueEntry {
    visit_id: string; token_number: number; status: string;
    patient: string; patient_code: string; booking_number: number;
}

export default function Sessions() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selected, setSelected] = useState<Session | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [queue, setQueue] = useState<QueueEntry[]>([]);

    const [sessionPage, setSessionPage] = useState(1);
    const [sessionPageSize, setSessionPageSize] = useState(5);
    // Empty = all dates; otherwise an ISO "YYYY-MM-DD" to filter the session list by.
    const [sessionDateFilter, setSessionDateFilter] = useState('');
    const [apptPage, setApptPage] = useState(1);
    const [apptPageSize, setApptPageSize] = useState(5);
    const [apptSearch, setApptSearch] = useState('');
    const [queuePage, setQueuePage] = useState(1);
    const [queuePageSize, setQueuePageSize] = useState(5);

    const [createOpen, setCreateOpen] = useState(false);
    const [bookOpen, setBookOpen] = useState(false);
    const [sessionForm, setSessionForm] = useState({
        doctor_id: '', room_id: '', session_date: '', start_time: '', end_time: '',
        max_patients: '20', channel_fee: '2000', hospital_fee: '500',
    });
    const [bookSelected, setBookSelected] = useState<Patient | null>(null);
    const [bookSearch, setBookSearch] = useState('');
    const [bookPage, setBookPage] = useState(1);

    // Quick-add: register a brand-new patient without leaving the Book
    // Patient dialog — just enough to book them today; the full profile
    // (address, guardian, etc.) gets filled in later from the Patients page.
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddSaving, setQuickAddSaving] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState({ full_name: '', phone: '', nic: '', gender: '' });
    const [bookPageSize, setBookPageSize] = useState(5);
    const [bookTotal, setBookTotal] = useState(0);
    const [bookLoading, setBookLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        doctor_id: '', room_id: '', session_date: '', start_time: '', end_time: '',
        max_patients: '20', channel_fee: '2000', hospital_fee: '500',
    });
    const [editLoading, setEditLoading] = useState(false);

    const loadSessions = useCallback(async () => {
        try {
            const res = await api.get('/sessions');
            setSessions(res.data);
            // Keep the open session detail (e.g. "slots remaining") in sync —
            // `selected` is a snapshot, so it goes stale after any booking
            // change unless refreshed from the latest list here.
            setSelected((prev) => {
                if (!prev) return prev;
                const fresh = res.data.find((s: Session) => s.id === prev.id);
                return fresh ?? prev;
            });
        } catch { toast.error('Failed to load sessions'); }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);
    useEffect(() => {
        api.get('/doctors').then((r) => setDoctors(r.data)).catch(() => { });
        api.get('/rooms').then((r) => setRooms(r.data)).catch(() => { });
    }, []);

    // Patient search for the Book Patient dialog — loaded on demand while it's open
    const loadBookPatients = useCallback(async () => {
        setBookLoading(true);
        try {
            const res = await api.get('/patients', { params: { search: bookSearch, page: bookPage, limit: bookPageSize } });
            setPatients(res.data.data);
            setBookTotal(res.data.total);
        } catch {
            toast.error('Failed to load patients');
        } finally {
            setBookLoading(false);
        }
    }, [bookSearch, bookPage, bookPageSize]);

    useEffect(() => {
        if (!bookOpen) return;
        const t = setTimeout(loadBookPatients, 300);
        return () => clearTimeout(t);
    }, [bookOpen, loadBookPatients]);

    useEffect(() => { setBookPage(1); }, [bookSearch]);

    const openBook = () => {
        setBookSelected(null);
        setBookSearch('');
        setBookPage(1);
        setQuickAddOpen(false);
        setQuickAddForm({ full_name: '', phone: '', nic: '', gender: '' });
        setBookOpen(true);
    };

    const openQuickAdd = () => {
        // Carries over whatever was already typed in the main search box,
        // so clicking "New Patient" after a failed search doesn't lose it.
        setQuickAddForm({ full_name: bookSearch.trim(), phone: '', nic: '', gender: '' });
        setQuickAddOpen(true);
    };

    // Typing in the quick-add Name field also drives the main table search
    // (via bookSearch) so a real existing match is never missed while
    // naming a "new" patient — the top search box keeps working independently.
    const handleQuickAddNameChange = (value: string) => {
        setQuickAddForm({ ...quickAddForm, full_name: value });
        setBookSearch(value);
    };

    const handleQuickAddPatient = async () => {
        const full_name = quickAddForm.full_name.trim();
        if (!full_name) { toast.error('Full name is required'); return; }
        setQuickAddSaving(true);
        try {
            const payload: any = { full_name };
            if (quickAddForm.phone) payload.phone = quickAddForm.phone;
            if (quickAddForm.nic) payload.nic = quickAddForm.nic;
            if (quickAddForm.gender) payload.gender = quickAddForm.gender;

            const res = await api.post('/patients', payload);
            toast.success(`${res.data.full_name} added — ready to book`);
            setBookSelected(res.data);
            setQuickAddOpen(false);
            setBookSearch('');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to add patient');
        } finally {
            setQuickAddSaving(false);
        }
    };

    // When a session is selected, load its appointments + queue
    const loadSessionDetail = useCallback(async (sessionId: string) => {
        try {
            const [appts, q] = await Promise.all([
                api.get(`/appointments/session/${sessionId}`),
                api.get(`/appointments/queue/${sessionId}`),
            ]);
            setAppointments(appts.data);
            setQueue(q.data);
        } catch { toast.error('Failed to load session detail'); }
    }, []);

    const selectSession = (s: Session) => {
        setSelected(s);
        setApptPage(1);
        setApptSearch('');
        setQueuePage(1);
        loadSessionDetail(s.id);
    };

    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const isTodayFilter = sessionDateFilter === todayStr();

    const filteredSessions = useMemo(() => {
        if (!sessionDateFilter) return sessions;
        return sessions.filter((s) => s.session_date.slice(0, 10) === sessionDateFilter);
    }, [sessions, sessionDateFilter]);

    useEffect(() => { setSessionPage(1); }, [sessionDateFilter]);

    const filteredAppointments = useMemo(() => {
        const q = apptSearch.trim().toLowerCase();
        if (!q) return appointments;
        return appointments.filter(
            (a) => a.patients.full_name.toLowerCase().includes(q) || a.patients.patient_code.toLowerCase().includes(q),
        );
    }, [appointments, apptSearch]);

    useEffect(() => { setApptPage(1); }, [apptSearch]);

    const handleCreateSession = async () => {
        const f = sessionForm;
        if (!f.doctor_id || !f.session_date || !f.start_time || !f.end_time) {
            toast.error('Doctor, date, and times are required');
            return;
        }
        try {
            await api.post('/sessions', {
                doctor_id: Number(f.doctor_id),
                room_id: f.room_id ? Number(f.room_id) : undefined,
                session_date: f.session_date,
                start_time: f.start_time,
                end_time: f.end_time,
                max_patients: Number(f.max_patients),
                channel_fee: Number(f.channel_fee),
                hospital_fee: Number(f.hospital_fee),
            });
            toast.success('Session created');
            setCreateOpen(false);
            loadSessions();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed');
        }
    };

    const handleBook = async () => {
        if (!bookSelected || !selected) { toast.error('Select a patient'); return; }
        try {
            const res = await api.post('/appointments', {
                session_id: Number(selected.id),
                patient_id: Number(bookSelected.id),
                booking_channel: 'WALK_IN',
            });
            toast.success(res.data.message);
            setBookOpen(false);
            setBookSelected(null);
            loadSessionDetail(selected.id);
            loadSessions();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Booking failed');
        }
    };

    const handleCheckIn = async (appointmentId: string) => {
        try {
            const res = await api.post(`/appointments/${appointmentId}/checkin`);
            toast.success(res.data.message);
            if (selected) loadSessionDetail(selected.id);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Check-in failed');
        }
    };

    const handleRemoveBooking = async (a: Appointment) => {
        if (!(await confirm(`Remove ${a.patients.full_name}'s booking (#${a.booking_number})?`, { variant: 'destructive', confirmText: 'Remove' }))) return;
        try {
            await api.delete(`/appointments/${a.id}`);
            toast.success('Booking removed');
            if (selected) loadSessionDetail(selected.id);
            loadSessions();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to remove booking');
        }
    };

    const handleRevertCheckIn = async (q: QueueEntry) => {
        if (!(await confirm(`Move ${q.patient} (token #${q.token_number}) back to the booking queue?`, { confirmText: 'Move Back' }))) return;
        try {
            const res = await api.patch(`/appointments/visit/${q.visit_id}/revert`);
            toast.success(res.data.message);
            if (selected) loadSessionDetail(selected.id);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to revert check-in');
        }
    };

    const handleRemoveFromQueue = async (q: QueueEntry) => {
        if (!(await confirm(`Remove ${q.patient} (token #${q.token_number}) from the queue? Their booking will be cancelled.`, { variant: 'destructive', confirmText: 'Remove' }))) return;
        try {
            const res = await api.delete(`/appointments/visit/${q.visit_id}`);
            toast.success(res.data.message);
            if (selected) loadSessionDetail(selected.id);
            loadSessions();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to remove from queue');
        }
    };

    const openEdit = async (id: string) => {
        setEditId(id);
        setEditOpen(true);
        setEditLoading(true);
        try {
            const res = await api.get(`/sessions/${id}`);
            const s = res.data;
            setEditForm({
                doctor_id: String(s.doctor_id),
                room_id: s.room_id ? String(s.room_id) : '',
                session_date: s.session_date.slice(0, 10),
                start_time: s.start_time.slice(11, 16),
                end_time: s.end_time.slice(11, 16),
                max_patients: String(s.max_patients),
                channel_fee: String(s.channel_fee),
                hospital_fee: String(s.hospital_fee),
            });
        } catch {
            toast.error('Failed to load session');
            setEditOpen(false);
        } finally {
            setEditLoading(false);
        }
    };

    const handleUpdateSession = async () => {
        if (!editId) return;
        const f = editForm;
        if (!f.doctor_id || !f.session_date || !f.start_time || !f.end_time) {
            toast.error('Doctor, date, and times are required');
            return;
        }
        try {
            await api.patch(`/sessions/${editId}`, {
                doctor_id: Number(f.doctor_id),
                room_id: f.room_id ? Number(f.room_id) : null,
                session_date: f.session_date,
                start_time: f.start_time,
                end_time: f.end_time,
                max_patients: Number(f.max_patients),
                channel_fee: Number(f.channel_fee),
                hospital_fee: Number(f.hospital_fee),
            });
            toast.success('Session updated');
            setEditOpen(false);
            setEditId(null);
            loadSessions();
            if (selected?.id === editId) loadSessionDetail(editId);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update session');
        }
    };

    const handleCancelSession = async (s: Session) => {
        if (!(await confirm(`Cancel the ${s.doctors.full_name} session on ${s.session_date.slice(0, 10)}? Existing bookings will be kept but marked cancelled.`, { variant: 'destructive', confirmText: 'Cancel Session' }))) return;
        try {
            await api.patch(`/sessions/${s.id}/cancel`);
            toast.success('Session cancelled');
            loadSessions();
            if (selected?.id === s.id) loadSessionDetail(s.id);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to cancel session');
        }
    };

    const handleDeleteSession = async (s: Session) => {
        if (!(await confirm(`Permanently delete the ${s.doctors.full_name} session on ${s.session_date.slice(0, 10)}? This cannot be undone.`, { variant: 'destructive', confirmText: 'Delete' }))) return;
        try {
            await api.delete(`/sessions/${s.id}`);
            toast.success('Session deleted');
            if (selected?.id === s.id) setSelected(null);
            loadSessions();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete session');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Sessions & Booking</h1>
                    <p className="text-slate-500">Manage doctor sessions, book and check in patients</p>
                </div>
                {hasPermission('session.manage') && (
                    <>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus size={16} className="mr-2" />New Session
                        </Button>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Create Session</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label>Doctor *</Label>
                                        <SearchableSelect
                                            options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
                                            value={sessionForm.doctor_id}
                                            onChange={(v) => setSessionForm({ ...sessionForm, doctor_id: v })}
                                            placeholder="Select doctor"
                                            searchPlaceholder="Search doctors..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Room</Label>
                                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                                value={sessionForm.room_id}
                                                onChange={(e) => setSessionForm({ ...sessionForm, room_id: e.target.value })}>
                                                <option value="">None</option>
                                                {rooms.map((r) => <option key={r.id} value={r.id}>{r.room_number}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Date *</Label>
                                            <Input type="date" value={sessionForm.session_date}
                                                onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Start Time *</Label>
                                            <Input type="time" value={sessionForm.start_time}
                                                onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>End Time *</Label>
                                            <Input type="time" value={sessionForm.end_time}
                                                onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label>Max Patients</Label>
                                            <Input type="number" value={sessionForm.max_patients}
                                                onChange={(e) => setSessionForm({ ...sessionForm, max_patients: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Channel Fee</Label>
                                            <Input type="number" value={sessionForm.channel_fee}
                                                onChange={(e) => setSessionForm({ ...sessionForm, channel_fee: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Hospital Fee</Label>
                                            <Input type="number" value={sessionForm.hospital_fee}
                                                onChange={(e) => setSessionForm({ ...sessionForm, hospital_fee: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                                    <Button onClick={handleCreateSession}>Create</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {/* Edit session dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Session</DialogTitle></DialogHeader>
                    {editLoading ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Doctor *</Label>
                                <SearchableSelect
                                    options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
                                    value={editForm.doctor_id}
                                    onChange={(v) => setEditForm({ ...editForm, doctor_id: v })}
                                    placeholder="Select doctor"
                                    searchPlaceholder="Search doctors..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Room</Label>
                                    <select className="w-full border rounded-md h-9 px-3 text-sm"
                                        value={editForm.room_id}
                                        onChange={(e) => setEditForm({ ...editForm, room_id: e.target.value })}>
                                        <option value="">None</option>
                                        {rooms.map((r) => <option key={r.id} value={r.id}>{r.room_number}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Date *</Label>
                                    <Input type="date" value={editForm.session_date}
                                        onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time *</Label>
                                    <Input type="time" value={editForm.start_time}
                                        onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Time *</Label>
                                    <Input type="time" value={editForm.end_time}
                                        onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Max Patients</Label>
                                    <Input type="number" value={editForm.max_patients}
                                        onChange={(e) => setEditForm({ ...editForm, max_patients: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Channel Fee</Label>
                                    <Input type="number" value={editForm.channel_fee}
                                        onChange={(e) => setEditForm({ ...editForm, channel_fee: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Hospital Fee</Label>
                                    <Input type="number" value={editForm.hospital_fee}
                                        onChange={(e) => setEditForm({ ...editForm, hospital_fee: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateSession} disabled={editLoading}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Session list */}
            <div className="flex items-center gap-2 mb-3">
                <Button
                    variant={isTodayFilter ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSessionDateFilter(isTodayFilter ? '' : todayStr())}
                >
                    <CalendarDays size={14} className="mr-1" />Today's Bookings
                </Button>
                <Input
                    type="date"
                    className="h-8 w-40 text-sm"
                    value={sessionDateFilter}
                    onChange={(e) => setSessionDateFilter(e.target.value)}
                />
                {sessionDateFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setSessionDateFilter('')}>
                        Clear
                    </Button>
                )}
                <span className="text-xs text-slate-400">
                    {sessionDateFilter
                        ? `Showing ${filteredSessions.length} session(s) on ${sessionDateFilter}`
                        : `Showing all ${sessions.length} session(s)`}
                </span>
            </div>
            <div className="bg-white rounded-md border mb-6">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Doctor</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead>Booked</TableHead>
                            <TableHead>Fee</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredSessions.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">
                                {sessionDateFilter ? `No sessions on ${sessionDateFilter}` : 'No sessions'}
                            </TableCell></TableRow>
                        ) : filteredSessions.slice((sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize).map((s) => (
                            <TableRow key={s.id} className={selected?.id === s.id ? 'bg-slate-50' : ''}>
                                <TableCell>{s.session_date.slice(0, 10)}</TableCell>
                                <TableCell className="font-medium">{s.doctors.full_name}</TableCell>
                                <TableCell>{s.start_time.slice(11, 16)}–{s.end_time.slice(11, 16)}</TableCell>
                                <TableCell>{s.rooms?.room_number ?? '-'}</TableCell>
                                <TableCell>{s.booked_count}/{s.max_patients}</TableCell>
                                <TableCell>LKR {Number(s.channel_fee).toFixed(0)}</TableCell>
                                <TableCell>
                                    <span className={`text-xs px-2 py-1 rounded ${s.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                        s.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                            s.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-700'
                                        }`}>{s.status}</span>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="outline" size="sm" onClick={() => selectSession(s)}>Open</Button>
                                        {hasPermission('session.manage') && (
                                            <>
                                                <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(s.id)}>
                                                    <Pencil size={14} />
                                                </Button>
                                                {s.status !== 'CANCELLED' && s.status !== 'COMPLETED' && (
                                                    <Button variant="ghost" size="icon-sm" title="Cancel session"
                                                        onClick={() => handleCancelSession(s)}>
                                                        <Ban size={14} />
                                                    </Button>
                                                )}
                                                {s.booked_count === 0 && (
                                                    <Button variant="ghost" size="icon-sm" title="Delete"
                                                        onClick={() => handleDeleteSession(s)}>
                                                        <Trash2 size={14} />
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Pagination
                    page={sessionPage} pageSize={sessionPageSize} total={filteredSessions.length}
                    onPageChange={setSessionPage}
                    onPageSizeChange={(n) => { setSessionPageSize(n); setSessionPage(1); }}
                />
            </div>

            {/* Selected session detail */}
            {selected && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <CalendarDays size={20} />
                                    {selected.doctors.full_name} — {selected.session_date.slice(0, 10)}
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {selected.doctors.specialties?.name} · {selected.slots_remaining} slots remaining
                                </p>
                            </div>
                            {hasPermission('appointment.create') && (
                                <>
                                    <Button size="sm" onClick={openBook}>
                                        <UserPlus size={16} className="mr-2" />Book Patient
                                    </Button>
                                    <Dialog open={bookOpen} onOpenChange={setBookOpen}>
                                        <DialogContent className="sm:max-w-2xl">
                                            <DialogHeader><DialogTitle>Book Patient</DialogTitle></DialogHeader>
                                            <div className="space-y-3 py-2">
                                                <div className="flex gap-2">
                                                    <div className="relative flex-1">
                                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        <Input
                                                            className="pl-9"
                                                            placeholder="Search by name, NIC, phone, code..."
                                                            value={bookSearch}
                                                            onChange={(e) => setBookSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    {hasPermission('patient.create') && !quickAddOpen && (
                                                        <Button variant="outline" size="sm" onClick={openQuickAdd}>
                                                            <Plus size={14} className="mr-1" />New Patient
                                                        </Button>
                                                    )}
                                                </div>

                                                <div className="border rounded-md">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Code</TableHead>
                                                                <TableHead>Name</TableHead>
                                                                <TableHead>Phone</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {bookLoading ? (
                                                                <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
                                                            ) : patients.length === 0 ? (
                                                                <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-400">
                                                                    {bookSearch.trim() ? `No patient found for "${bookSearch.trim()}"` : 'No patients found'}
                                                                </TableCell></TableRow>
                                                            ) : patients.map((p) => (
                                                                <TableRow
                                                                    key={p.id}
                                                                    onClick={() => setBookSelected(p)}
                                                                    className={`cursor-pointer ${bookSelected?.id === p.id ? 'bg-slate-100' : ''}`}
                                                                >
                                                                    <TableCell className="font-mono text-sm">{p.patient_code}</TableCell>
                                                                    <TableCell className="font-medium">{p.full_name}</TableCell>
                                                                    <TableCell>{p.phone ?? '-'}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                    <Pagination
                                                        page={bookPage} pageSize={bookPageSize} total={bookTotal}
                                                        onPageChange={setBookPage}
                                                        onPageSizeChange={(n) => { setBookPageSize(n); setBookPage(1); }}
                                                    />
                                                </div>

                                                {quickAddOpen && (
                                                    <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                                        <p className="text-sm font-medium">Register New Patient</p>
                                                        <p className="text-xs text-slate-500">
                                                            Just enough to book them today; the full profile can be completed later from the Patients page.
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="col-span-2 space-y-1">
                                                                <Label className="text-xs">Full Name *</Label>
                                                                <Input value={quickAddForm.full_name}
                                                                    onChange={(e) => handleQuickAddNameChange(e.target.value)}
                                                                    placeholder="Also searches the table above"
                                                                    autoFocus />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-xs">Phone</Label>
                                                                <PhoneInput value={quickAddForm.phone}
                                                                    onChange={(v) => setQuickAddForm({ ...quickAddForm, phone: v })} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-xs">NIC</Label>
                                                                <Input value={quickAddForm.nic}
                                                                    onChange={(e) => setQuickAddForm({ ...quickAddForm, nic: e.target.value })} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-xs">Gender</Label>
                                                                <select className="w-full border rounded-md h-9 px-3 text-sm"
                                                                    value={quickAddForm.gender}
                                                                    onChange={(e) => setQuickAddForm({ ...quickAddForm, gender: e.target.value })}>
                                                                    <option value="">Select</option>
                                                                    <option value="Male">Male</option>
                                                                    <option value="Female">Female</option>
                                                                    <option value="Other">Other</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="ghost" size="sm" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
                                                            <Button size="sm" onClick={handleQuickAddPatient} disabled={quickAddSaving || !quickAddForm.full_name.trim()}>
                                                                {quickAddSaving ? 'Adding...' : 'Add & Select'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <p className="text-sm text-slate-600 min-h-5">
                                                    {bookSelected && (
                                                        <>Selected: <span className="font-medium text-slate-800">
                                                            {bookSelected.patient_code} — {bookSelected.full_name}
                                                        </span></>
                                                    )}
                                                </p>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setBookOpen(false)}>Cancel</Button>
                                                <Button onClick={handleBook} disabled={!bookSelected}>Book</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Bookings */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-slate-700">Bookings</h3>
                                    <div className="relative w-44">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            className="pl-7 h-8 text-sm"
                                            placeholder="Search..."
                                            value={apptSearch}
                                            onChange={(e) => setApptSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Temp #</TableHead>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAppointments.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-400">
                                                    {appointments.length === 0 ? 'No bookings' : 'No matching bookings'}
                                                </TableCell></TableRow>
                                            ) : filteredAppointments.slice((apptPage - 1) * apptPageSize, apptPage * apptPageSize).map((a) => (
                                                <TableRow key={a.id}>
                                                    <TableCell className="font-bold">{a.booking_number}</TableCell>
                                                    <TableCell>{a.patients.full_name}</TableCell>
                                                    <TableCell>
                                                        <span className="text-xs px-2 py-1 rounded bg-slate-100">{a.status}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            {!a.visits && a.status !== 'CANCELLED' && hasPermission('appointment.checkin') && (
                                                                <Button size="sm" variant="outline" onClick={() => handleCheckIn(a.id)}>
                                                                    <LogIn size={14} className="mr-1" />Check In
                                                                </Button>
                                                            )}
                                                            {a.visits && (
                                                                <span className="text-xs text-green-600">Token {a.visits.token_number}</span>
                                                            )}
                                                            {!a.visits && a.status !== 'CANCELLED' && hasPermission('appointment.create') && (
                                                                <Button size="sm" variant="ghost" title="Remove booking"
                                                                    onClick={() => handleRemoveBooking(a)}>
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={apptPage} pageSize={apptPageSize} total={filteredAppointments.length}
                                        onPageChange={setApptPage}
                                        onPageSizeChange={(n) => { setApptPageSize(n); setApptPage(1); }}
                                    />
                                </div>
                            </div>

                            {/* Live Queue */}
                            <div>
                                <h3 className="font-semibold mb-2 text-slate-700">Live Queue (by token)</h3>
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Token</TableHead>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queue.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-400">No one checked in</TableCell></TableRow>
                                            ) : queue.slice((queuePage - 1) * queuePageSize, queuePage * queuePageSize).map((q) => (
                                                <TableRow key={q.visit_id}>
                                                    <TableCell className="font-bold text-lg">{q.token_number}</TableCell>
                                                    <TableCell>{q.patient}</TableCell>
                                                    <TableCell>
                                                        <span className={`text-xs px-2 py-1 rounded ${q.status === 'WAITING' ? 'bg-amber-100 text-amber-700' :
                                                                q.status === 'IN_CONSULTATION' ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-green-100 text-green-700'
                                                            }`}>{q.status}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {q.status === 'WAITING' && hasPermission('appointment.checkin') && (
                                                            <div className="flex justify-end gap-1">
                                                                <Button variant="ghost" size="icon-sm" title="Revert to booking queue"
                                                                    onClick={() => handleRevertCheckIn(q)}>
                                                                    <RotateCcw size={14} />
                                                                </Button>
                                                                <Button variant="ghost" size="icon-sm" title="Remove from queue"
                                                                    onClick={() => handleRemoveFromQueue(q)}>
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={queuePage} pageSize={queuePageSize} total={queue.length}
                                        onPageChange={setQueuePage}
                                        onPageSizeChange={(n) => { setQueuePageSize(n); setQueuePage(1); }}
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}