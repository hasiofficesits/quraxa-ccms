import { useState, useEffect, useCallback, useRef } from 'react';
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
    ShieldPlus, ClipboardList, Building2, Search, Plus, Pencil, ShieldOff, ShieldCheck,
    Eye, FileText, UploadCloud, Download, Trash2, CheckCircle2, XCircle, Send, Banknote,
} from 'lucide-react';

type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED';

interface ClaimDocument { id: string; file_name: string; created_at: string; }
interface Claim {
    id: string; claim_number: string; status: ClaimStatus;
    policy_number: string; claimed_amount: string; approved_amount: string | null;
    rejection_reason: string | null; notes: string | null;
    submitted_at: string | null; decided_at: string | null; paid_at: string | null;
    created_at: string;
    patients: { id: string; full_name: string; patient_code: string; phone: string | null };
    insurers: { id: string; name: string; insurer_code: string };
    invoices: { id: string; invoice_number: string; total: string; status: string };
    documents: ClaimDocument[];
}
interface InsurerOption { id: string; insurer_code: string; name: string; }
interface InsurerFull {
    id: string; insurer_code: string; name: string; contact_person: string | null;
    phone: string | null; email: string | null; address: string | null; is_active: boolean;
}
interface InsurerForm {
    id: string | null; name: string; contact_person: string; phone: string; email: string; address: string;
}
const emptyInsurerForm: InsurerForm = { id: null, name: '', contact_person: '', phone: '', email: '', address: '' };

interface InvoiceSearchResult {
    id: string; invoice_number: string; total: string; status: string; created_at: string;
    patients: { id: string; full_name: string; patient_code: string };
}

const STATUS_STYLE: Record<ClaimStatus, string> = {
    DRAFT: 'bg-slate-100 text-slate-600',
    SUBMITTED: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    REJECTED: 'bg-red-100 text-red-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-slate-200 text-slate-500',
};

export default function InsuranceClaims() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const canManage = hasPermission('claim.manage');

    // ---- Claims list ----
    const [claims, setClaims] = useState<Claim[]>([]);
    const [claimsTotal, setClaimsTotal] = useState(0);
    const [claimsLoading, setClaimsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'' | ClaimStatus>('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [insurerOptions, setInsurerOptions] = useState<InsurerOption[]>([]);

    const loadClaims = useCallback(() => {
        setClaimsLoading(true);
        api.get('/insurance/claims', { params: { search: search || undefined, status: status || undefined, page, limit: pageSize } })
            .then((r) => { setClaims(r.data.data); setClaimsTotal(r.data.total); })
            .catch(() => { setClaims([]); setClaimsTotal(0); })
            .finally(() => setClaimsLoading(false));
    }, [search, status, page, pageSize]);

    const loadInsurerOptions = useCallback(() => {
        api.get('/insurance/insurers').then((r) => setInsurerOptions(r.data)).catch(() => setInsurerOptions([]));
    }, []);

    useEffect(() => { loadClaims(); }, [loadClaims]);
    useEffect(() => { loadInsurerOptions(); }, [loadInsurerOptions]);

    // ---- New claim ----
    const [newClaimOpen, setNewClaimOpen] = useState(false);
    const [invoiceQuery, setInvoiceQuery] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<InvoiceSearchResult[]>([]);
    const [invoiceSearching, setInvoiceSearching] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSearchResult | null>(null);
    const [newInsurerId, setNewInsurerId] = useState('');
    const [newPolicyNumber, setNewPolicyNumber] = useState('');
    const [newClaimedAmount, setNewClaimedAmount] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [creatingClaim, setCreatingClaim] = useState(false);
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openNewClaim = () => {
        setInvoiceQuery(''); setInvoiceResults([]); setSelectedInvoice(null);
        setNewInsurerId(''); setNewPolicyNumber(''); setNewClaimedAmount(''); setNewNotes('');
        setNewClaimOpen(true);
    };

    const onInvoiceQueryChange = (value: string) => {
        setInvoiceQuery(value);
        setSelectedInvoice(null);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        if (value.trim().length < 2) { setInvoiceResults([]); return; }
        searchDebounce.current = setTimeout(async () => {
            setInvoiceSearching(true);
            try {
                const res = await api.get('/insurance/invoices/search', { params: { q: value.trim() } });
                setInvoiceResults(res.data);
            } catch {
                setInvoiceResults([]);
            } finally {
                setInvoiceSearching(false);
            }
        }, 300);
    };

    const pickInvoice = (inv: InvoiceSearchResult) => {
        setSelectedInvoice(inv);
        setInvoiceResults([]);
        setInvoiceQuery(`${inv.invoice_number} — ${inv.patients.full_name}`);
        setNewClaimedAmount(inv.total);
    };

    const handleCreateClaim = async () => {
        if (!selectedInvoice || !newInsurerId || !newPolicyNumber.trim() || !newClaimedAmount) {
            toast.error('Select an invoice, insurer, policy number and claimed amount');
            return;
        }
        setCreatingClaim(true);
        try {
            await api.post('/insurance/claims', {
                invoice_id: selectedInvoice.id,
                insurer_id: newInsurerId,
                policy_number: newPolicyNumber.trim(),
                claimed_amount: newClaimedAmount,
                notes: newNotes.trim() || undefined,
            });
            toast.success('Claim created as Draft');
            setNewClaimOpen(false);
            loadClaims();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to create claim');
        } finally {
            setCreatingClaim(false);
        }
    };

    // ---- Claim detail / status / documents ----
    const [detailClaim, setDetailClaim] = useState<Claim | null>(null);
    const [detailBusy, setDetailBusy] = useState(false);
    const [approvedAmountInput, setApprovedAmountInput] = useState('');
    const [rejectionReasonInput, setRejectionReasonInput] = useState('');
    const [pendingAction, setPendingAction] = useState<'' | 'APPROVED' | 'REJECTED'>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const openDetail = (claim: Claim) => {
        setDetailClaim(claim);
        setApprovedAmountInput('');
        setRejectionReasonInput('');
        setPendingAction('');
    };

    const refreshDetail = async (id: string) => {
        try {
            const res = await api.get(`/insurance/claims/${id}`);
            setDetailClaim(res.data);
            setClaims((prev) => prev.map((c) => (c.id === id ? res.data : c)));
        } catch { /* ignore */ }
    };

    const handleStatusChange = async (target: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED') => {
        if (!detailClaim) return;
        if (target === 'CANCELLED' && !(await confirm(
            `Cancel claim ${detailClaim.claim_number}? This cannot be undone.`,
            { variant: 'destructive', confirmText: 'Cancel Claim' },
        ))) return;
        if (target === 'APPROVED' && !approvedAmountInput) { setPendingAction('APPROVED'); return; }
        if (target === 'REJECTED' && !rejectionReasonInput) { setPendingAction('REJECTED'); return; }

        setDetailBusy(true);
        try {
            await api.patch(`/insurance/claims/${detailClaim.id}/status`, {
                status: target,
                ...(target === 'APPROVED' && { approved_amount: approvedAmountInput }),
                ...(target === 'REJECTED' && { rejection_reason: rejectionReasonInput }),
            });
            toast.success(`Claim marked ${target.toLowerCase()}`);
            setPendingAction('');
            await refreshDetail(detailClaim.id);
            loadClaims();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to update claim');
        } finally {
            setDetailBusy(false);
        }
    };

    const handleUploadDoc = async (file: File) => {
        if (!detailClaim) return;
        setDetailBusy(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            await api.post(`/insurance/claims/${detailClaim.id}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Document attached');
            await refreshDetail(detailClaim.id);
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to upload document');
        } finally {
            setDetailBusy(false);
        }
    };

    const handleDownloadDoc = async (doc: ClaimDocument) => {
        if (!detailClaim) return;
        try {
            const res = await api.get(`/insurance/claims/${detailClaim.id}/documents/${doc.id}/download`, { responseType: 'blob' });
            const blob = new Blob([res.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = doc.file_name;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download document');
        }
    };

    const handleRemoveDoc = async (doc: ClaimDocument) => {
        if (!detailClaim) return;
        if (!(await confirm(`Remove "${doc.file_name}"?`, { variant: 'destructive', confirmText: 'Remove' }))) return;
        setDetailBusy(true);
        try {
            await api.delete(`/insurance/claims/${detailClaim.id}/documents/${doc.id}`);
            await refreshDetail(detailClaim.id);
        } catch {
            toast.error('Failed to remove document');
        } finally {
            setDetailBusy(false);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                <ShieldPlus size={28} className="text-[var(--brand-primary)]" />Insurance Claims
            </h1>
            <p className="text-slate-500 mb-6">
                Track insurance claims for invoices, from filing through to payment — internal record-keeping only.
            </p>

            <Tabs defaultValue="claims">
                <TabsList>
                    <TabsTrigger value="claims" className="flex items-center gap-1.5">
                        <ClipboardList size={14} />Claims
                    </TabsTrigger>
                    {canManage && (
                        <TabsTrigger value="insurers" className="flex items-center gap-1.5">
                            <Building2 size={14} />Manage Insurers
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="claims">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <div className="relative max-w-sm flex-1 min-w-[200px]">
                                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        placeholder="Search claim #, patient, invoice, policy..."
                                        className="pl-8"
                                        value={search}
                                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <select
                                    className="border rounded-md h-9 px-2 text-sm"
                                    value={status}
                                    onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}
                                >
                                    <option value="">All statuses</option>
                                    <option value="DRAFT">Draft</option>
                                    <option value="SUBMITTED">Submitted</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="PAID">Paid</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                                {canManage && (
                                    <Button className="ml-auto" onClick={openNewClaim}>
                                        <Plus size={16} className="mr-1" />New Claim
                                    </Button>
                                )}
                            </div>

                            {claimsLoading ? (
                                <div className="space-y-2 py-2">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
                                    ))}
                                </div>
                            ) : claims.length === 0 ? (
                                <p className="text-sm text-slate-400 py-16 text-center">
                                    {search || status ? 'No claims match your search or filter.' : 'No insurance claims filed yet.'}
                                </p>
                            ) : (
                                <div className="border rounded-md overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Claim #</TableHead>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Insurer</TableHead>
                                                <TableHead>Invoice</TableHead>
                                                <TableHead>Claimed</TableHead>
                                                <TableHead>Approved</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {claims.map((c) => (
                                                <TableRow key={c.id}>
                                                    <TableCell className="font-medium">{c.claim_number}</TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{c.patients.full_name}</div>
                                                        <div className="text-xs text-slate-400">{c.patients.patient_code}</div>
                                                    </TableCell>
                                                    <TableCell className="text-sm">{c.insurers.name}</TableCell>
                                                    <TableCell className="text-sm">{c.invoices.invoice_number}</TableCell>
                                                    <TableCell className="text-sm">LKR {Number(c.claimed_amount).toFixed(2)}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {c.approved_amount ? `LKR ${Number(c.approved_amount).toFixed(2)}` : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[c.status]}`}>
                                                            {c.status}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="icon-sm" variant="ghost" title="View / manage" onClick={() => openDetail(c)}>
                                                            <Eye size={15} />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={page} pageSize={pageSize} total={claimsTotal}
                                        onPageChange={setPage}
                                        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {canManage && (
                    <TabsContent value="insurers">
                        <InsurerManager onChange={loadInsurerOptions} />
                    </TabsContent>
                )}
            </Tabs>

            {/* New claim modal */}
            <Dialog open={newClaimOpen} onOpenChange={setNewClaimOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader><DialogTitle>New Insurance Claim</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="mb-1.5 block">Invoice *</Label>
                            <div className="relative">
                                <Input
                                    placeholder="Search by invoice #, patient name or code..."
                                    value={invoiceQuery}
                                    onChange={(e) => onInvoiceQueryChange(e.target.value)}
                                />
                                {invoiceQuery && !selectedInvoice && (invoiceResults.length > 0 || invoiceSearching) && (
                                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-white shadow-lg">
                                        {invoiceSearching ? (
                                            <div className="p-3 text-sm text-slate-400">Searching...</div>
                                        ) : invoiceResults.map((inv) => (
                                            <button
                                                key={inv.id}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0"
                                                onClick={() => pickInvoice(inv)}
                                            >
                                                <div className="font-medium">{inv.invoice_number} — LKR {Number(inv.total).toFixed(2)}</div>
                                                <div className="text-xs text-slate-400">
                                                    {inv.patients.full_name} ({inv.patients.patient_code}) · {inv.status}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedInvoice && (
                            <>
                                <div>
                                    <Label className="mb-1.5 block">Insurer *</Label>
                                    <select
                                        className="w-full border rounded-md h-9 px-2 text-sm"
                                        value={newInsurerId}
                                        onChange={(e) => setNewInsurerId(e.target.value)}
                                    >
                                        <option value="">Select insurer...</option>
                                        {insurerOptions.map((i) => (
                                            <option key={i.id} value={i.id}>{i.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="mb-1.5 block">Policy / Member Number *</Label>
                                    <Input value={newPolicyNumber} onChange={(e) => setNewPolicyNumber(e.target.value)} />
                                </div>
                                <div>
                                    <Label className="mb-1.5 block">Claimed Amount (LKR) *</Label>
                                    <Input type="number" min="0" step="0.01" value={newClaimedAmount} onChange={(e) => setNewClaimedAmount(e.target.value)} />
                                </div>
                                <div>
                                    <Label className="mb-1.5 block">Notes</Label>
                                    <Textarea rows={2} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewClaimOpen(false)}>Cancel</Button>
                        <Button disabled={!selectedInvoice || creatingClaim} onClick={handleCreateClaim}>
                            {creatingClaim ? 'Creating...' : 'Create Claim'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Claim detail / manage modal */}
            <Dialog open={!!detailClaim} onOpenChange={(open) => !open && setDetailClaim(null)}>
                <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                    {detailClaim && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {detailClaim.claim_number}
                                    <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[detailClaim.status]}`}>
                                        {detailClaim.status}
                                    </span>
                                </DialogTitle>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-md p-3">
                                    <div><span className="text-slate-400">Patient</span><div className="font-medium">{detailClaim.patients.full_name}</div></div>
                                    <div><span className="text-slate-400">Invoice</span><div className="font-medium">{detailClaim.invoices.invoice_number} (LKR {Number(detailClaim.invoices.total).toFixed(2)})</div></div>
                                    <div><span className="text-slate-400">Insurer</span><div className="font-medium">{detailClaim.insurers.name}</div></div>
                                    <div><span className="text-slate-400">Policy #</span><div className="font-medium">{detailClaim.policy_number}</div></div>
                                    <div><span className="text-slate-400">Claimed</span><div className="font-medium">LKR {Number(detailClaim.claimed_amount).toFixed(2)}</div></div>
                                    <div><span className="text-slate-400">Approved</span><div className="font-medium">{detailClaim.approved_amount ? `LKR ${Number(detailClaim.approved_amount).toFixed(2)}` : '-'}</div></div>
                                    {detailClaim.rejection_reason && (
                                        <div className="col-span-2"><span className="text-slate-400">Rejection reason</span><div className="font-medium text-red-600">{detailClaim.rejection_reason}</div></div>
                                    )}
                                    {detailClaim.notes && (
                                        <div className="col-span-2"><span className="text-slate-400">Notes</span><div className="font-medium">{detailClaim.notes}</div></div>
                                    )}
                                </div>

                                {canManage && pendingAction === 'APPROVED' && (
                                    <div className="border rounded-md p-3 space-y-2">
                                        <Label className="block">Approved Amount (LKR) *</Label>
                                        <Input type="number" min="0" step="0.01" value={approvedAmountInput} onChange={(e) => setApprovedAmountInput(e.target.value)} />
                                        <div className="flex gap-2 justify-end">
                                            <Button size="sm" variant="outline" onClick={() => setPendingAction('')}>Cancel</Button>
                                            <Button size="sm" disabled={detailBusy || !approvedAmountInput} onClick={() => handleStatusChange('APPROVED')}>Confirm Approval</Button>
                                        </div>
                                    </div>
                                )}
                                {canManage && pendingAction === 'REJECTED' && (
                                    <div className="border rounded-md p-3 space-y-2">
                                        <Label className="block">Rejection Reason *</Label>
                                        <Textarea rows={2} value={rejectionReasonInput} onChange={(e) => setRejectionReasonInput(e.target.value)} />
                                        <div className="flex gap-2 justify-end">
                                            <Button size="sm" variant="outline" onClick={() => setPendingAction('')}>Cancel</Button>
                                            <Button size="sm" variant="destructive" disabled={detailBusy || !rejectionReasonInput} onClick={() => handleStatusChange('REJECTED')}>Confirm Rejection</Button>
                                        </div>
                                    </div>
                                )}

                                {canManage && !pendingAction && (
                                    <div className="flex flex-wrap gap-2">
                                        {detailClaim.status === 'DRAFT' && (
                                            <Button size="sm" disabled={detailBusy} onClick={() => handleStatusChange('SUBMITTED')}>
                                                <Send size={14} className="mr-1" />Mark Submitted
                                            </Button>
                                        )}
                                        {detailClaim.status === 'SUBMITTED' && (
                                            <>
                                                <Button size="sm" disabled={detailBusy} onClick={() => setPendingAction('APPROVED')}>
                                                    <CheckCircle2 size={14} className="mr-1" />Approve
                                                </Button>
                                                <Button size="sm" variant="outline" disabled={detailBusy} onClick={() => setPendingAction('REJECTED')}>
                                                    <XCircle size={14} className="mr-1" />Reject
                                                </Button>
                                            </>
                                        )}
                                        {detailClaim.status === 'REJECTED' && (
                                            <Button size="sm" disabled={detailBusy} onClick={() => handleStatusChange('SUBMITTED')}>
                                                <Send size={14} className="mr-1" />Resubmit
                                            </Button>
                                        )}
                                        {detailClaim.status === 'APPROVED' && (
                                            <Button size="sm" disabled={detailBusy} onClick={() => handleStatusChange('PAID')}>
                                                <Banknote size={14} className="mr-1" />Mark Paid
                                            </Button>
                                        )}
                                        {!['PAID', 'CANCELLED'].includes(detailClaim.status) && (
                                            <Button size="sm" variant="outline" disabled={detailBusy} onClick={() => handleStatusChange('CANCELLED')}>
                                                Cancel Claim
                                            </Button>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label className="block">Supporting Documents</Label>
                                        {canManage && (
                                            <>
                                                <input
                                                    ref={fileInputRef} type="file" className="hidden"
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDoc(f); e.target.value = ''; }}
                                                />
                                                <Button size="sm" variant="outline" disabled={detailBusy} onClick={() => fileInputRef.current?.click()}>
                                                    <UploadCloud size={14} className="mr-1" />Attach File
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    {detailClaim.documents.length === 0 ? (
                                        <p className="text-xs text-slate-400">No documents attached yet.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {detailClaim.documents.map((doc) => (
                                                <div key={doc.id} className="flex items-center gap-2 text-sm border rounded-md px-2.5 py-1.5">
                                                    <FileText size={14} className="text-slate-400 shrink-0" />
                                                    <span className="truncate flex-1">{doc.file_name}</span>
                                                    <Button size="icon-sm" variant="ghost" onClick={() => handleDownloadDoc(doc)} title="Download">
                                                        <Download size={13} />
                                                    </Button>
                                                    {canManage && (
                                                        <Button size="icon-sm" variant="ghost" onClick={() => handleRemoveDoc(doc)} title="Remove">
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDetailClaim(null)}>Close</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ---- Manage Insurers tab ----
function InsurerManager({ onChange }: { onChange?: () => void }) {
    const confirm = useConfirm();
    const [items, setItems] = useState<InsurerFull[]>([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<InsurerForm>(emptyInsurerForm);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/insurance/insurers/full').then((r) => setItems(r.data)).catch(() => setItems([])).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => { setForm(emptyInsurerForm); setFormOpen(true); };
    const openEdit = (i: InsurerFull) => {
        setForm({
            id: i.id, name: i.name, contact_person: i.contact_person ?? '',
            phone: i.phone ?? '', email: i.email ?? '', address: i.address ?? '',
        });
        setFormOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Insurer name is required'); return; }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                contact_person: form.contact_person.trim() || undefined,
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                address: form.address.trim() || undefined,
            };
            if (form.id) {
                await api.patch(`/insurance/insurers/${form.id}`, payload);
                toast.success('Insurer updated');
            } else {
                await api.post('/insurance/insurers', payload);
                toast.success('Insurer added');
            }
            setFormOpen(false);
            load();
            onChange?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to save insurer');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (i: InsurerFull) => {
        const activating = !i.is_active;
        if (!activating && !(await confirm(`Deactivate "${i.name}"? It will no longer appear when filing a new claim.`, { variant: 'destructive', confirmText: 'Deactivate' }))) return;
        try {
            await api.patch(`/insurance/insurers/${i.id}`, { is_active: activating });
            toast.success(activating ? 'Insurer activated' : 'Insurer deactivated');
            load();
            onChange?.();
        } catch {
            toast.error('Failed to update insurer');
        }
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex justify-end mb-4">
                    <Button onClick={openCreate}><Plus size={16} className="mr-1" />Add Insurer</Button>
                </div>

                {loading ? (
                    <div className="space-y-2 py-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />)}
                    </div>
                ) : items.length === 0 ? (
                    <p className="text-sm text-slate-400 py-16 text-center">No insurers added yet.</p>
                ) : (
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((i) => (
                                    <TableRow key={i.id}>
                                        <TableCell className="text-sm">{i.insurer_code}</TableCell>
                                        <TableCell className="font-medium">{i.name}</TableCell>
                                        <TableCell className="text-sm">{i.contact_person ?? '-'}</TableCell>
                                        <TableCell className="text-sm">{i.phone ?? '-'}</TableCell>
                                        <TableCell>
                                            <span className={`text-xs px-2 py-1 rounded font-medium ${i.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                {i.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button size="icon-sm" variant="ghost" onClick={() => openEdit(i)} title="Edit"><Pencil size={14} /></Button>
                                                <Button size="icon-sm" variant="ghost" onClick={() => toggleActive(i)} title={i.is_active ? 'Deactivate' : 'Activate'}>
                                                    {i.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{form.id ? 'Edit Insurer' : 'Add Insurer'}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="mb-1.5 block">Name *</Label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Contact Person</Label>
                            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Phone</Label>
                            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Email</Label>
                            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Address</Label>
                            <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
