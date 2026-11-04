import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
    Stethoscope, Plus, Trash2, CheckCircle, Search, Eye, Pencil,
    History, ClipboardList, Pill, FlaskConical, ChevronDown, ChevronUp, Download,
} from 'lucide-react';

interface Session {
    id: string; session_date: string;
    doctors: { full_name: string };
}
interface QueueEntry {
    visit_id: string; token_number: number; status: string;
    patient_id: string; patient: string; patient_code: string;
}
interface HistoryPrescriptionItem {
    id: string; medicine_name: string; dose: string | null;
    frequency: string | null; duration: string | null; quantity: number | null;
    status: string;
}
interface HistoryPrescription {
    id: string; prescription_code: string; notes: string | null; created_at: string;
    prescription_items: HistoryPrescriptionItem[];
}
interface HistoryTestOrder {
    id: string; status: string; ordered_at: string; result_notes: string | null;
    report_file_name: string | null;
    diagnostic_tests: { name: string; test_code: string };
}
interface HistoryConsultation {
    id: string; symptoms: string | null; diagnosis: string | null;
    clinical_notes: string | null; follow_up_date: string | null; created_at: string;
    doctors: { full_name: string };
    prescriptions: HistoryPrescription[];
    test_orders: HistoryTestOrder[];
}
interface Test { id: string; test_code: string; name: string; price: string; }
interface RxItem {
    medicine_id?: string;
    medicine_name: string;
    dose: string;
    frequency: string;
    duration: string;
}
interface StockMedicine {
    id: string; medicine_code: string; generic_name: string;
    brand_name: string | null; strength: string | null; available_quantity: number;
}
interface LookupOption { id: string; name: string; }

export default function Consultation() {
    const confirm = useConfirm();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [sessionId, setSessionId] = useState('');
    const [queue, setQueue] = useState<QueueEntry[]>([]);
    const [selected, setSelected] = useState<QueueEntry | null>(null);
    const [tests, setTests] = useState<Test[]>([]);

    // Patient history — every past consultation (diagnoses, prescriptions,
    // tests) for a patient, permanently retained (soft-deleted at most, via
    // consultations.is_deleted — never hard-removed), reachable from the
    // queue or from the active consultation panel.
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPatient, setHistoryPatient] = useState<{ name: string; code: string } | null>(null);
    const [historyData, setHistoryData] = useState<HistoryConsultation[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState<Set<string>>(new Set());

    // consultation form
    const [symptoms, setSymptoms] = useState('');
    const [diagnosis, setDiagnosis] = useState('');
    const [notes, setNotes] = useState('');
    const [rxItems, setRxItems] = useState<RxItem[]>([]);
    const [selectedTests, setSelectedTests] = useState<string[]>([]);
    const [consultationId, setConsultationId] = useState<string | null>(null);

    // "Add Medicine" picker modal
    const [medStock, setMedStock] = useState<StockMedicine[]>([]);
    const [medStockLoading, setMedStockLoading] = useState(false);
    const [medSearch, setMedSearch] = useState('');
    const [medPage, setMedPage] = useState(1);
    const [medPageSize, setMedPageSize] = useState(5);

    const [rxModalOpen, setRxModalOpen] = useState(false);
    const [rxEditIndex, setRxEditIndex] = useState<number | null>(null);
    const [rxPickedId, setRxPickedId] = useState<string | null>(null);
    const [rxPickedLabel, setRxPickedLabel] = useState('');
    const [rxDose, setRxDose] = useState('');
    const [rxFrequency, setRxFrequency] = useState('');
    const [rxDuration, setRxDuration] = useState('');
    const [rxViewIndex, setRxViewIndex] = useState<number | null>(null);
    const [showSaveWarning, setShowSaveWarning] = useState(false);

    // Admin-managed dropdown options for Dose/Frequency/Duration
    const [doseOptions, setDoseOptions] = useState<LookupOption[]>([]);
    const [frequencyOptions, setFrequencyOptions] = useState<LookupOption[]>([]);
    const [durationOptions, setDurationOptions] = useState<LookupOption[]>([]);

    useEffect(() => {
        api.get('/sessions').then((r) => setSessions(r.data)).catch(() => { });
        api.get('/rooms').catch(() => { }); // warm
        api.get('/lookups/doses').then((r) => setDoseOptions(r.data)).catch(() => { });
        api.get('/lookups/frequencies').then((r) => setFrequencyOptions(r.data)).catch(() => { });
        api.get('/lookups/durations').then((r) => setDurationOptions(r.data)).catch(() => { });
    }, []);

    // Load diagnostic tests (we'll add a simple endpoint; for now via billing-less route)
    useEffect(() => {
        api.get('/clinical/tests-list').then((r) => setTests(r.data)).catch(() => {
            // fallback: no endpoint yet
        });
    }, []);

    const loadQueue = useCallback(async (sid: string) => {
        if (!sid) return;
        try {
            const res = await api.get(`/appointments/queue/${sid}`);
            setQueue(res.data);
        } catch { toast.error('Failed to load queue'); }
    }, []);

    useEffect(() => { if (sessionId) loadQueue(sessionId); }, [sessionId, loadQueue]);

    const selectPatient = async (q: QueueEntry) => {
        setSelected(q);
        // reset form
        setSymptoms(''); setDiagnosis(''); setNotes('');
        setRxItems([]); setSelectedTests([]); setConsultationId(null);
        // move visit to IN_CONSULTATION
        try {
            await api.patch(`/clinical/visit/${q.visit_id}/start`);
            loadQueue(sessionId);
        } catch { /* may already be started */ }
    };

    // ---- Patient history ----
    const openHistory = async (patientId: string, name: string, code: string) => {
        setHistoryPatient({ name, code });
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryData([]);
        setHistoryExpanded(new Set());
        try {
            const res = await api.get(`/clinical/patient/${patientId}/history`);
            setHistoryData(res.data);
            // Most recent visit open by default — earlier ones collapsed so a
            // long history doesn't turn into an unreadable wall of text.
            if (res.data.length > 0) setHistoryExpanded(new Set([res.data[0].id]));
        } catch {
            toast.error('Failed to load patient history');
            setHistoryOpen(false);
        } finally {
            setHistoryLoading(false);
        }
    };

    const toggleHistoryExpand = (id: string) => {
        setHistoryExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const downloadLabReport = async (order: HistoryTestOrder) => {
        try {
            const res = await api.get(`/lab/${order.id}/download`, { responseType: 'blob' });
            const blob = new Blob([res.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = order.report_file_name ?? `report-${order.id}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download report');
        }
    };

    // ---- Medicine picker (Add / Edit) ----
    const loadMedStock = useCallback(async () => {
        setMedStockLoading(true);
        try {
            const res = await api.get('/clinical/medicines-in-stock');
            setMedStock(res.data);
        } catch {
            toast.error('Failed to load medicines');
        } finally {
            setMedStockLoading(false);
        }
    }, []);

    useEffect(() => { if (rxModalOpen) loadMedStock(); }, [rxModalOpen, loadMedStock]);
    useEffect(() => { setMedPage(1); }, [medSearch]);

    const filteredMedStock = useMemo(() => {
        const q = medSearch.trim().toLowerCase();
        if (!q) return medStock;
        return medStock.filter(
            (m) => m.generic_name.toLowerCase().includes(q)
                || m.medicine_code.toLowerCase().includes(q)
                || (m.brand_name ?? '').toLowerCase().includes(q),
        );
    }, [medStock, medSearch]);

    const pagedMedStock = filteredMedStock.slice((medPage - 1) * medPageSize, medPage * medPageSize);

    const openAddMedicine = () => {
        setRxEditIndex(null);
        setRxPickedId(null);
        setRxPickedLabel('');
        setRxDose(''); setRxFrequency(''); setRxDuration('');
        setMedSearch('');
        setMedPage(1);
        setRxModalOpen(true);
    };

    const openEditMedicine = (i: number) => {
        const item = rxItems[i];
        setRxEditIndex(i);
        setRxPickedId(item.medicine_id ?? null);
        setRxPickedLabel(item.medicine_name);
        setRxDose(item.dose); setRxFrequency(item.frequency);
        setRxDuration(item.duration);
        setMedSearch('');
        setMedPage(1);
        setRxModalOpen(true);
    };

    const pickMedicine = (m: StockMedicine) => {
        setRxPickedId(m.id);
        setRxPickedLabel(`${m.generic_name}${m.brand_name ? ` (${m.brand_name})` : ''}`);
    };

    const handleSaveRxItem = () => {
        if (!rxPickedLabel.trim()) { toast.error('Select a medicine'); return; }
        const item: RxItem = {
            medicine_id: rxPickedId ?? undefined,
            medicine_name: rxPickedLabel,
            dose: rxDose, frequency: rxFrequency, duration: rxDuration,
        };
        if (rxEditIndex !== null) {
            setRxItems((prev) => prev.map((it, idx) => (idx === rxEditIndex ? item : it)));
        } else {
            setRxItems((prev) => [...prev, item]);
        }
        setRxModalOpen(false);
    };

    const handleDeleteRxItem = async (i: number) => {
        if (!(await confirm('Remove this medicine from the prescription?', { variant: 'destructive', confirmText: 'Remove' }))) return;
        setRxItems((prev) => prev.filter((_, idx) => idx !== i));
    };

    const toggleTest = (id: string) => {
        setSelectedTests((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
        );
    };

    const saveConsultation = async () => {
        if (!selected) return;
        try {
            // 1. Create consultation
            const c = await api.post('/clinical/consultation', {
                visit_id: Number(selected.visit_id),
                symptoms, diagnosis, clinical_notes: notes,
            });
            const cid = c.data.id;
            setConsultationId(cid);

            // 2. Prescription (if any items)
            const validRx = rxItems.filter((r) => r.medicine_name.trim());
            if (validRx.length > 0) {
                await api.post('/clinical/prescription', {
                    consultation_id: Number(cid),
                    items: validRx.map((r) => ({
                        medicine_id: r.medicine_id ? Number(r.medicine_id) : undefined,
                        medicine_name: r.medicine_name,
                        dose: r.dose || undefined,
                        frequency: r.frequency || undefined,
                        duration: r.duration || undefined,
                    })),
                });
            }

            // 3. Tests (if any)
            if (selectedTests.length > 0) {
                await api.post('/clinical/tests', {
                    consultation_id: Number(cid),
                    test_ids: selectedTests.map(Number),
                });
            }

            toast.success('Consultation saved');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save');
        }
    };

    const completeVisit = async () => {
        if (!selected) return;
        if (!consultationId) {
            setShowSaveWarning(true);
            return;
        }
        try {
            await api.patch(`/clinical/visit/${selected.visit_id}/complete`);
            toast.success('Visit completed');
            setSelected(null);
            loadQueue(sessionId);
        } catch { toast.error('Failed to complete'); }
    };

    const handleSaveThenClose = async () => {
        await saveConsultation();
        setShowSaveWarning(false);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Consultation</h1>
            <p className="text-slate-500 mb-6">Select a session, then a patient from the queue</p>

            <div className="mb-6 max-w-md">
                <Label>Session</Label>
                <select className="w-full border rounded-md h-9 px-3 text-sm mt-1"
                    value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                    <option value="">Select session</option>
                    {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.doctors.full_name} — {s.session_date.slice(0, 10)}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Queue */}
                <div className="col-span-1">
                    <h3 className="font-semibold mb-2 text-slate-700">Queue</h3>
                    <div className="space-y-2">
                        {queue.length === 0 ? (
                            <p className="text-sm text-slate-400">No patients in queue</p>
                        ) : queue.map((q) => (
                            <div key={q.visit_id}
                                role="button"
                                tabIndex={q.status === 'DONE' ? -1 : 0}
                                onClick={() => q.status !== 'DONE' && selectPatient(q)}
                                className={`w-full text-left p-3 rounded-md border transition-colors cursor-pointer ${selected?.visit_id === q.visit_id ? 'border-slate-900 bg-slate-50' :
                                        q.status === 'DONE' ? 'opacity-50 bg-slate-50 cursor-default' : 'hover:bg-slate-50'
                                    }`}>
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-lg">#{q.token_number}</span>
                                    <div className="flex items-center gap-1">
                                        <span className={`text-xs px-2 py-1 rounded ${q.status === 'WAITING' ? 'bg-amber-100 text-amber-700' :
                                                q.status === 'IN_CONSULTATION' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-green-100 text-green-700'
                                            }`}>{q.status}</span>
                                        <button
                                            type="button"
                                            title="View patient history"
                                            onClick={(e) => { e.stopPropagation(); openHistory(q.patient_id, q.patient, q.patient_code); }}
                                            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                        >
                                            <History size={14} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm mt-1">{q.patient}</p>
                                <p className="text-xs text-slate-500">{q.patient_code}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Consultation form */}
                <div className="col-span-2">
                    {!selected ? (
                        <Card><CardContent className="py-16 text-center text-slate-400">
                            <Stethoscope size={40} className="mx-auto mb-3 opacity-40" />
                            Select a patient from the queue to begin
                        </CardContent></Card>
                    ) : (
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold">{selected.patient}</h2>
                                        <p className="text-xs text-slate-400">{selected.patient_code}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button variant="outline" size="sm"
                                            onClick={() => openHistory(selected.patient_id, selected.patient, selected.patient_code)}>
                                            <History size={14} className="mr-1" />Patient History
                                        </Button>
                                        <span className="text-sm text-slate-500">Token #{selected.token_number}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Symptoms</Label>
                                    <Textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
                                        placeholder="Presenting complaints..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Diagnosis</Label>
                                    <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                                        placeholder="Diagnosis..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Clinical Notes</Label>
                                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Notes, advice..." />
                                </div>

                                {/* Prescription */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label>Prescription</Label>
                                        <Button size="sm" variant="outline" onClick={openAddMedicine}>
                                            <Plus size={14} className="mr-1" />Add Medicine
                                        </Button>
                                    </div>
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Medicine</TableHead>
                                                    <TableHead>Dose</TableHead>
                                                    <TableHead>Frequency</TableHead>
                                                    <TableHead>Duration</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rxItems.length === 0 ? (
                                                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-slate-400">No medicines added</TableCell></TableRow>
                                                ) : rxItems.map((item, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                                        <TableCell>{item.dose || '-'}</TableCell>
                                                        <TableCell>{item.frequency || '-'}</TableCell>
                                                        <TableCell>{item.duration || '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <Button variant="ghost" size="icon-sm" title="View"
                                                                    onClick={() => setRxViewIndex(i)}>
                                                                    <Eye size={14} />
                                                                </Button>
                                                                <Button variant="ghost" size="icon-sm" title="Edit"
                                                                    onClick={() => openEditMedicine(i)}>
                                                                    <Pencil size={14} />
                                                                </Button>
                                                                <Button variant="ghost" size="icon-sm" title="Delete"
                                                                    onClick={() => handleDeleteRxItem(i)}>
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                {/* Tests */}
                                {tests.length > 0 && (
                                    <div>
                                        <Label className="mb-2 block">Diagnostic Tests</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {tests.map((t) => (
                                                <button key={t.id} onClick={() => toggleTest(t.id)}
                                                    className={`text-xs px-3 py-1.5 rounded-full border ${selectedTests.includes(t.id)
                                                            ? 'bg-slate-900 text-white border-slate-900'
                                                            : 'bg-white hover:bg-slate-50'
                                                        }`}>
                                                    {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <Button onClick={saveConsultation}>Save Consultation</Button>
                                    <Button variant="outline" onClick={completeVisit}>
                                        <CheckCircle size={16} className="mr-2" />Complete Visit
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Add / Edit Medicine modal */}
            <Dialog open={rxModalOpen} onOpenChange={setRxModalOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{rxEditIndex !== null ? 'Edit Medicine' : 'Add Medicine'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input className="pl-9" placeholder="Search medicines by name or code..."
                                value={medSearch} onChange={(e) => setMedSearch(e.target.value)} />
                        </div>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Medicine</TableHead>
                                        <TableHead>Strength</TableHead>
                                        <TableHead>In Stock</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {medStockLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
                                    ) : pagedMedStock.length === 0 ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-400">No medicines in stock</TableCell></TableRow>
                                    ) : pagedMedStock.map((m) => (
                                        <TableRow
                                            key={m.id}
                                            onClick={() => pickMedicine(m)}
                                            className={`cursor-pointer ${rxPickedId === m.id ? 'bg-slate-100' : ''}`}
                                        >
                                            <TableCell className="font-mono text-sm">{m.medicine_code}</TableCell>
                                            <TableCell className="font-medium">
                                                {m.generic_name}
                                                {m.brand_name && <span className="text-slate-400"> ({m.brand_name})</span>}
                                            </TableCell>
                                            <TableCell>{m.strength ?? '-'}</TableCell>
                                            <TableCell>{m.available_quantity}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Pagination
                                page={medPage} pageSize={medPageSize} total={filteredMedStock.length}
                                onPageChange={setMedPage}
                                onPageSizeChange={(n) => { setMedPageSize(n); setMedPage(1); }}
                            />
                        </div>

                        {rxPickedLabel && (
                            <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                <p className="text-sm font-medium">Selected: {rxPickedLabel}</p>
                                <p className="text-xs text-slate-500">
                                    Quantity is set later by the pharmacist when dispensing.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Dose</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={rxDose} onChange={(e) => setRxDose(e.target.value)}>
                                            <option value="">Select dose</option>
                                            {doseOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Frequency</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={rxFrequency} onChange={(e) => setRxFrequency(e.target.value)}>
                                            <option value="">Select frequency</option>
                                            {frequencyOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Duration</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={rxDuration} onChange={(e) => setRxDuration(e.target.value)}>
                                            <option value="">Select duration</option>
                                            {durationOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRxModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveRxItem} disabled={!rxPickedLabel}>
                            {rxEditIndex !== null ? 'Save Changes' : 'Add to Prescription'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View medicine dialog */}
            <Dialog open={rxViewIndex !== null} onOpenChange={(o) => !o && setRxViewIndex(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Medicine Details</DialogTitle></DialogHeader>
                    {rxViewIndex !== null && (
                        <div className="space-y-3 py-2 text-sm">
                            <div>
                                <Label className="text-slate-500">Medicine</Label>
                                <p className="font-medium">{rxItems[rxViewIndex].medicine_name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Dose</Label><p>{rxItems[rxViewIndex].dose || '-'}</p></div>
                                <div><Label className="text-slate-500">Frequency</Label><p>{rxItems[rxViewIndex].frequency || '-'}</p></div>
                            </div>
                            <div>
                                <Label className="text-slate-500">Duration</Label>
                                <p>{rxItems[rxViewIndex].duration || '-'}</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRxViewIndex(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Warning: consultation must be saved before completing the visit */}
            <Dialog open={showSaveWarning} onOpenChange={setShowSaveWarning}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Consultation Not Saved</DialogTitle></DialogHeader>
                    <p className="py-2 text-sm text-slate-600">
                        Please save the consultation before completing the visit — the symptoms, diagnosis,
                        prescription, and tests you've entered here haven't been recorded yet.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveWarning(false)}>Cancel</Button>
                        <Button onClick={handleSaveThenClose}>Save Consultation</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Patient history — every past consultation, permanently retained */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History size={18} />Patient History
                            {historyPatient && (
                                <span className="text-sm font-normal text-slate-500">
                                    — {historyPatient.name} ({historyPatient.code})
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {historyLoading ? (
                        <div className="py-10 text-center text-slate-400">Loading...</div>
                    ) : historyData.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                            <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
                            No past consultations recorded for this patient
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                            {historyData.map((c) => {
                                const expanded = historyExpanded.has(c.id);
                                return (
                                    <div key={c.id} className="border rounded-md overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => toggleHistoryExpand(c.id)}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-slate-800">
                                                    {new Date(c.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    <span className="text-slate-400 font-normal"> · Dr. {c.doctors.full_name}</span>
                                                </p>
                                                {c.diagnosis && (
                                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.diagnosis}</p>
                                                )}
                                            </div>
                                            {expanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                                        </button>

                                        {expanded && (
                                            <div className="p-3 space-y-3 text-sm">
                                                {(c.symptoms || c.diagnosis || c.clinical_notes) && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        {c.symptoms && (
                                                            <div>
                                                                <Label className="text-xs text-slate-400">Symptoms</Label>
                                                                <p className="text-slate-700">{c.symptoms}</p>
                                                            </div>
                                                        )}
                                                        {c.diagnosis && (
                                                            <div>
                                                                <Label className="text-xs text-slate-400">Diagnosis</Label>
                                                                <p className="text-slate-700">{c.diagnosis}</p>
                                                            </div>
                                                        )}
                                                        {c.clinical_notes && (
                                                            <div>
                                                                <Label className="text-xs text-slate-400">Notes</Label>
                                                                <p className="text-slate-700">{c.clinical_notes}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {c.follow_up_date && (
                                                    <p className="text-xs text-amber-600">
                                                        Follow-up recommended: {c.follow_up_date.slice(0, 10)}
                                                    </p>
                                                )}

                                                {c.prescriptions.some((p) => p.prescription_items.length > 0) && (
                                                    <div>
                                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                                                            <Pill size={12} />Prescriptions
                                                        </p>
                                                        <div className="border rounded-md">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Medicine</TableHead>
                                                                        <TableHead>Dose</TableHead>
                                                                        <TableHead>Frequency</TableHead>
                                                                        <TableHead>Duration</TableHead>
                                                                        <TableHead>Status</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {c.prescriptions.flatMap((p) => p.prescription_items).map((item) => (
                                                                        <TableRow key={item.id}>
                                                                            <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                                                            <TableCell>{item.dose ?? '-'}</TableCell>
                                                                            <TableCell>{item.frequency ?? '-'}</TableCell>
                                                                            <TableCell>{item.duration ?? '-'}</TableCell>
                                                                            <TableCell>
                                                                                <span className={`text-xs px-2 py-0.5 rounded ${item.status === 'ADDED' ? 'bg-green-100 text-green-700' :
                                                                                        item.status === 'UNAVAILABLE' ? 'bg-red-100 text-red-700' :
                                                                                            'bg-slate-100 text-slate-700'
                                                                                    }`}>{item.status}</span>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </div>
                                                )}

                                                {c.test_orders.length > 0 && (
                                                    <div>
                                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                                                            <FlaskConical size={12} />Tests
                                                        </p>
                                                        <div className="border rounded-md">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Test</TableHead>
                                                                        <TableHead>Ordered</TableHead>
                                                                        <TableHead>Status</TableHead>
                                                                        <TableHead className="text-right">Report</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {c.test_orders.map((t) => (
                                                                        <TableRow key={t.id}>
                                                                            <TableCell className="font-medium">{t.diagnostic_tests.name}</TableCell>
                                                                            <TableCell>{t.ordered_at.slice(0, 10)}</TableCell>
                                                                            <TableCell>
                                                                                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">{t.status}</span>
                                                                            </TableCell>
                                                                            <TableCell className="text-right">
                                                                                {t.report_file_name ? (
                                                                                    <Button
                                                                                        size="sm" variant="outline"
                                                                                        onClick={() => downloadLabReport(t)}
                                                                                    >
                                                                                        <Download size={13} className="mr-1" />Download
                                                                                    </Button>
                                                                                ) : (
                                                                                    <span className="text-xs text-slate-400">-</span>
                                                                                )}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </div>
                                                )}

                                                {!c.symptoms && !c.diagnosis && !c.clinical_notes &&
                                                    c.prescriptions.every((p) => p.prescription_items.length === 0) &&
                                                    c.test_orders.length === 0 && (
                                                        <p className="text-slate-400 text-xs">No further details recorded for this visit</p>
                                                    )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
