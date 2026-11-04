import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
    FlaskConical, ClipboardList, History, Search, UploadCloud, CheckCircle2, XCircle, Download, FileText,
} from 'lucide-react';

interface TestOrder {
    id: string;
    status: 'ORDERED' | 'SAMPLE_COLLECTED' | 'COMPLETED' | 'CANCELLED';
    ordered_at: string;
    sample_collected_at: string | null;
    completed_at: string | null;
    result_notes: string | null;
    report_file_name: string | null;
    patients: { id: string; full_name: string; patient_code: string; phone: string | null };
    diagnostic_tests: { id: string; name: string; test_code: string };
    consultations: { doctors: { full_name: string } };
}

const STATUS_STYLE: Record<TestOrder['status'], string> = {
    ORDERED: 'bg-amber-100 text-amber-700',
    SAMPLE_COLLECTED: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-slate-200 text-slate-500',
};
const STATUS_LABEL: Record<TestOrder['status'], string> = {
    ORDERED: 'Awaiting Sample',
    SAMPLE_COLLECTED: 'Sample Collected',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

export default function LabReports() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const canManage = hasPermission('lab.manage');

    const [queue, setQueue] = useState<TestOrder[]>([]);
    const [queueTotal, setQueueTotal] = useState(0);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueSearch, setQueueSearch] = useState('');
    const [queueStatus, setQueueStatus] = useState<'' | 'ORDERED' | 'SAMPLE_COLLECTED'>('');
    const [queuePage, setQueuePage] = useState(1);
    const [queuePageSize, setQueuePageSize] = useState(10);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [completed, setCompleted] = useState<TestOrder[]>([]);
    const [completedTotal, setCompletedTotal] = useState(0);
    const [completedLoading, setCompletedLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState<'' | 'COMPLETED' | 'CANCELLED'>('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [uploadTarget, setUploadTarget] = useState<TestOrder | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadNotes, setUploadNotes] = useState('');
    const [uploading, setUploading] = useState(false);

    const loadQueue = useCallback(() => {
        setQueueLoading(true);
        api.get('/lab/queue', {
            params: { search: queueSearch || undefined, status: queueStatus || undefined, page: queuePage, limit: queuePageSize },
        })
            .then((r) => { setQueue(r.data.data); setQueueTotal(r.data.total); })
            .catch(() => { setQueue([]); setQueueTotal(0); })
            .finally(() => setQueueLoading(false));
    }, [queueSearch, queueStatus, queuePage, queuePageSize]);

    const loadCompleted = useCallback(() => {
        setCompletedLoading(true);
        api.get('/lab/completed', {
            params: { search: search || undefined, status: historyStatus || undefined, page, limit: pageSize },
        })
            .then((r) => { setCompleted(r.data.data); setCompletedTotal(r.data.total); })
            .catch(() => { setCompleted([]); setCompletedTotal(0); })
            .finally(() => setCompletedLoading(false));
    }, [search, historyStatus, page, pageSize]);

    useEffect(() => { loadQueue(); }, [loadQueue]);
    useEffect(() => { loadCompleted(); }, [loadCompleted]);

    const handleCollect = async (order: TestOrder) => {
        setBusyId(order.id);
        try {
            await api.patch(`/lab/${order.id}/collect`);
            toast.success('Sample marked as collected');
            loadQueue();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to update');
        } finally {
            setBusyId(null);
        }
    };

    const handleCancel = async (order: TestOrder) => {
        if (!(await confirm(
            `Cancel the "${order.diagnostic_tests.name}" test order for ${order.patients.full_name}?`,
            { variant: 'destructive', confirmText: 'Cancel Order' },
        ))) return;
        setBusyId(order.id);
        try {
            await api.patch(`/lab/${order.id}/cancel`);
            toast.success('Test order cancelled');
            loadQueue();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to cancel');
        } finally {
            setBusyId(null);
        }
    };

    const openUpload = (order: TestOrder) => {
        setUploadTarget(order);
        setUploadFile(null);
        setUploadNotes('');
    };

    const handleUpload = async () => {
        if (!uploadTarget || !uploadFile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            if (uploadNotes.trim()) formData.append('result_notes', uploadNotes.trim());
            await api.post(`/lab/${uploadTarget.id}/report`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Report uploaded — test order completed');
            setUploadTarget(null);
            loadQueue();
            loadCompleted();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to upload report');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (order: TestOrder) => {
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

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                <FlaskConical size={28} className="text-[var(--brand-primary)]" />Lab Reports
            </h1>
            <p className="text-slate-500 mb-6">
                Diagnostic tests ordered by doctors — track samples and upload results.
            </p>

            <Tabs defaultValue="queue">
                <TabsList>
                    <TabsTrigger value="queue" className="flex items-center gap-1.5">
                        <ClipboardList size={14} />Queue
                        {queueTotal > 0 && (
                            <span className="ml-1 rounded-full bg-[var(--brand-primary)] text-white text-[10px] leading-none px-1.5 py-0.5">
                                {queueTotal}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-1.5">
                        <History size={14} />History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="queue">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <div className="relative max-w-sm flex-1 min-w-[200px]">
                                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        placeholder="Search patient, code, or test..."
                                        className="pl-8"
                                        value={queueSearch}
                                        onChange={(e) => { setQueueSearch(e.target.value); setQueuePage(1); }}
                                    />
                                </div>
                                <select
                                    className="border rounded-md h-9 px-2 text-sm"
                                    value={queueStatus}
                                    onChange={(e) => { setQueueStatus(e.target.value as typeof queueStatus); setQueuePage(1); }}
                                >
                                    <option value="">All statuses</option>
                                    <option value="ORDERED">Awaiting Sample</option>
                                    <option value="SAMPLE_COLLECTED">Sample Collected</option>
                                </select>
                            </div>

                            {queueLoading ? (
                                <div className="space-y-2 py-2">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
                                    ))}
                                </div>
                            ) : queue.length === 0 ? (
                                <p className="text-sm text-slate-400 py-16 text-center">
                                    {queueSearch || queueStatus
                                        ? 'No test orders match your search or filter.'
                                        : 'No tests are currently awaiting sample collection or results.'}
                                </p>
                            ) : (
                                <div className="border rounded-md overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Test</TableHead>
                                                <TableHead>Doctor</TableHead>
                                                <TableHead>Ordered</TableHead>
                                                <TableHead>Status</TableHead>
                                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queue.map((o) => (
                                                <TableRow key={o.id}>
                                                    <TableCell>
                                                        <div className="font-medium">{o.patients.full_name}</div>
                                                        <div className="text-xs text-slate-400">
                                                            {o.patients.patient_code}
                                                            {o.patients.phone ? ` · ${o.patients.phone}` : ''}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{o.diagnostic_tests.name}</div>
                                                        <div className="text-xs text-slate-400">{o.diagnostic_tests.test_code}</div>
                                                    </TableCell>
                                                    <TableCell className="text-sm">{o.consultations.doctors.full_name}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {new Date(o.ordered_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[o.status]}`}>
                                                            {STATUS_LABEL[o.status]}
                                                        </span>
                                                    </TableCell>
                                                    {canManage && (
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {o.status === 'ORDERED' && (
                                                                    <Button
                                                                        size="sm" variant="outline"
                                                                        disabled={busyId === o.id}
                                                                        onClick={() => handleCollect(o)}
                                                                    >
                                                                        <CheckCircle2 size={14} className="mr-1" />Sample Collected
                                                                    </Button>
                                                                )}
                                                                {o.status !== 'CANCELLED' && (
                                                                    <Button
                                                                        size="sm"
                                                                        disabled={busyId === o.id}
                                                                        onClick={() => openUpload(o)}
                                                                    >
                                                                        <UploadCloud size={14} className="mr-1" />Upload Report
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    size="icon-sm" variant="outline"
                                                                    disabled={busyId === o.id}
                                                                    onClick={() => handleCancel(o)}
                                                                    title="Cancel order"
                                                                >
                                                                    <XCircle size={14} />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={queuePage} pageSize={queuePageSize} total={queueTotal}
                                        onPageChange={setQueuePage}
                                        onPageSizeChange={(n) => { setQueuePageSize(n); setQueuePage(1); }}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <div className="relative max-w-sm flex-1 min-w-[200px]">
                                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        placeholder="Search patient, code, or test..."
                                        className="pl-8"
                                        value={search}
                                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <select
                                    className="border rounded-md h-9 px-2 text-sm"
                                    value={historyStatus}
                                    onChange={(e) => { setHistoryStatus(e.target.value as typeof historyStatus); setPage(1); }}
                                >
                                    <option value="">All statuses</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                            </div>

                            {completedLoading ? (
                                <div className="space-y-2 py-2">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
                                    ))}
                                </div>
                            ) : completed.length === 0 ? (
                                <p className="text-sm text-slate-400 py-16 text-center">
                                    {search || historyStatus
                                        ? 'No test orders match your search or filter.'
                                        : 'No completed or cancelled test orders yet.'}
                                </p>
                            ) : (
                                <div className="border rounded-md overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Test</TableHead>
                                                <TableHead>Doctor</TableHead>
                                                <TableHead>Completed</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Report</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {completed.map((o) => (
                                                <TableRow key={o.id}>
                                                    <TableCell>
                                                        <div className="font-medium">{o.patients.full_name}</div>
                                                        <div className="text-xs text-slate-400">{o.patients.patient_code}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{o.diagnostic_tests.name}</div>
                                                        <div className="text-xs text-slate-400">{o.diagnostic_tests.test_code}</div>
                                                    </TableCell>
                                                    <TableCell className="text-sm">{o.consultations.doctors.full_name}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {o.completed_at
                                                            ? new Date(o.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                                                            : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[o.status]}`}>
                                                            {STATUS_LABEL[o.status]}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {o.report_file_name ? (
                                                            <Button size="sm" variant="outline" onClick={() => handleDownload(o)}>
                                                                <Download size={14} className="mr-1" />Download
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">-</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={page} pageSize={pageSize} total={completedTotal}
                                        onPageChange={setPage}
                                        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={!!uploadTarget} onOpenChange={(open) => !open && setUploadTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Upload Report</DialogTitle>
                    </DialogHeader>
                    {uploadTarget && (
                        <div className="space-y-4">
                            <div className="text-sm bg-slate-50 rounded-md p-3">
                                <div className="font-medium">{uploadTarget.diagnostic_tests.name}</div>
                                <div className="text-slate-500">
                                    {uploadTarget.patients.full_name} ({uploadTarget.patients.patient_code})
                                </div>
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Report File (PDF, JPG, PNG) *</Label>
                                <label className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                                    <FileText size={16} className="text-slate-400 shrink-0" />
                                    <span className="truncate text-slate-600">
                                        {uploadFile ? uploadFile.name : 'Choose a file...'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        className="hidden"
                                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                                    />
                                </label>
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Result Notes (optional)</Label>
                                <Textarea
                                    rows={3}
                                    value={uploadNotes}
                                    onChange={(e) => setUploadNotes(e.target.value)}
                                    placeholder="Any remarks about the result..."
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUploadTarget(null)}>Cancel</Button>
                        <Button disabled={!uploadFile || uploading} onClick={handleUpload}>
                            {uploading ? 'Uploading...' : 'Upload & Complete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
