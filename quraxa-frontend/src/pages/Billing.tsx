import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Receipt, Search, CreditCard, Eye, Printer, Pencil, FlaskConical } from 'lucide-react';

interface Invoice {
    id: string; invoice_number: string; invoice_type: string;
    total: string; status: string; created_at: string;
    patients: { full_name: string } | null;
    prescriptions: { id: string }[];
}
interface InpatientInvoice {
    id: string; invoice_number: string; total: string; paid_amount: string;
    balance: string; status: string; created_at: string;
    patients: { full_name: string; patient_code: string } | null;
    prescriptions: { prescription_code: string; doctors: { full_name: string } }[];
}
interface InvoiceItem {
    id: string; description: string; quantity: number; unit_price: string; line_total: string;
}
interface PrescriptionItemDetail {
    id: string; medicine_name: string; dose: string | null; frequency: string | null;
    duration: string | null; quantity: number | null; status: string;
}
interface PrescriptionDetail {
    id: string; prescription_code: string; created_at: string;
    doctors: { full_name: string };
    prescription_items: PrescriptionItemDetail[];
}
interface InvoiceDetail {
    id: string; invoice_number: string; total: string; paid_amount: string; balance: string;
    status: string; payment_method: string;
    patients: { full_name: string; patient_code: string } | null;
    invoice_items: InvoiceItem[];
    prescriptions: PrescriptionDetail[];
}
interface ReceiptData {
    invoice_number: string;
    patient_name: string;
    patient_code?: string;
    items: InvoiceItem[];
    total: string;
    paid_amount: string;
    balance: string;
    payment_method: string;
    payment_amount: number;
    reference: string;
    paid_at: string;
}
interface SaleMedicine {
    id: string; medicine_code: string; generic_name: string;
    brand_name: string | null; strength: string | null; available_quantity: number; selling_price: number;
}
interface WalkInItem {
    medicine_id: string; medicine_name: string;
    dose: string; frequency: string; duration: string;
    quantity: string; unit_price: string;
}
interface DiagnosticTest { id: string; test_code: string; name: string; price: string; }
interface LookupOption { id: string; name: string; }
interface WalkInTestItem { test_id: string; test_name: string; quantity: string; unit_price: string; }
interface WalkInServiceItem {
    description: string; item_type: 'HOSPITAL_FEE' | 'CONSULTATION' | 'OTHER';
    quantity: string; unit_price: string;
}

interface BusinessSettings {
    business_name: string; address: string | null; phone: string | null;
    business_reg_no: string | null; tin_number: string | null;
}

export default function Billing() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [business, setBusiness] = useState<BusinessSettings | null>(null);
    useEffect(() => {
        api.get('/settings/business').then((r) => setBusiness(r.data)).catch(() => setBusiness(null));
    }, []);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoicePageSize, setInvoicePageSize] = useState(5);
    const [invSourceFilter, setInvSourceFilter] = useState<'ALL' | 'INPATIENT' | 'WALKIN'>('ALL');

    // "Invoices" tab shows completed (fully paid) invoices only — anything
    // still awaiting payment lives in the Inpatient Invoices queue instead.
    const loadInvoices = useCallback(async () => {
        try {
            const res = await api.get('/billing/invoices', { params: { status: 'PAID' } });
            setInvoices(res.data);
        } catch { toast.error('Failed to load invoices'); }
    }, []);

    useEffect(() => { loadInvoices(); }, [loadInvoices]);

    const filteredInvoices = useMemo(() => {
        if (invSourceFilter === 'ALL') return invoices;
        return invoices.filter((inv) =>
            invSourceFilter === 'INPATIENT' ? inv.prescriptions.length > 0 : inv.prescriptions.length === 0,
        );
    }, [invoices, invSourceFilter]);

    useEffect(() => { setInvoicePage(1); }, [invSourceFilter]);

    // ---- Inpatient invoices (from finalized prescriptions) ----
    const [ipSearch, setIpSearch] = useState('');
    const [ipPage, setIpPage] = useState(1);
    const [ipPageSize, setIpPageSize] = useState(5);
    const [ipTotal, setIpTotal] = useState(0);
    const [ipInvoices, setIpInvoices] = useState<InpatientInvoice[]>([]);
    const [ipLoading, setIpLoading] = useState(false);

    const loadInpatientInvoices = useCallback(async () => {
        setIpLoading(true);
        try {
            const res = await api.get('/billing/inpatient-invoices', {
                params: { search: ipSearch, page: ipPage, limit: ipPageSize },
            });
            setIpInvoices(res.data.data);
            setIpTotal(res.data.total);
        } catch {
            toast.error('Failed to load inpatient invoices');
        } finally {
            setIpLoading(false);
        }
    }, [ipSearch, ipPage, ipPageSize]);

    useEffect(() => {
        const t = setTimeout(loadInpatientInvoices, 300);
        return () => clearTimeout(t);
    }, [loadInpatientInvoices]);

    useEffect(() => { setIpPage(1); }, [ipSearch]);

    // ---- Pay dialog ----
    const [payOpen, setPayOpen] = useState(false);
    const [payDetail, setPayDetail] = useState<InvoiceDetail | null>(null);
    const [payDetailLoading, setPayDetailLoading] = useState(false);
    const [payMethodChoice, setPayMethodChoice] = useState('CASH');
    const [payAmount, setPayAmount] = useState('');
    const [payReference, setPayReference] = useState('');
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

    // Print the POS receipt as soon as its data is set, then clear it once
    // the browser's print dialog closes (Save-as-PDF counts as "printing" too).
    useEffect(() => {
        if (!receiptData) return;
        const t = setTimeout(() => window.print(), 150);
        const onAfterPrint = () => setReceiptData(null);
        window.addEventListener('afterprint', onAfterPrint);
        return () => {
            clearTimeout(t);
            window.removeEventListener('afterprint', onAfterPrint);
        };
    }, [receiptData]);

    const openPay = async (invoiceId: string) => {
        setPayOpen(true);
        setPayDetailLoading(true);
        setPayDetail(null);
        try {
            const res = await api.get(`/billing/invoice/${invoiceId}`);
            setPayDetail(res.data);
            setPayAmount(res.data.balance);
            setPayMethodChoice('CASH');
            setPayReference('');
        } catch {
            toast.error('Failed to load invoice');
            setPayOpen(false);
        } finally {
            setPayDetailLoading(false);
        }
    };

    const handleSubmitPayment = async () => {
        if (!payDetail) return;
        const amt = Number(payAmount);
        if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
        try {
            const res = await api.patch(`/billing/invoice/${payDetail.id}/pay`, {
                payment_method: payMethodChoice,
                amount: amt,
                reference: payReference || undefined,
            });
            toast.success('Payment recorded');
            setReceiptData({
                invoice_number: payDetail.invoice_number,
                patient_name: payDetail.patients?.full_name ?? 'Walk-in',
                patient_code: payDetail.patients?.patient_code,
                items: payDetail.invoice_items,
                total: res.data.total,
                paid_amount: res.data.paid_amount,
                balance: res.data.balance,
                payment_method: payMethodChoice,
                payment_amount: amt,
                reference: payReference,
                paid_at: new Date().toISOString(),
            });
            setPayOpen(false);
            loadInpatientInvoices();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Payment failed');
        }
    };

    // ---- View / Reprint (completed invoices) ----
    const [viewOpen, setViewOpen] = useState(false);
    const [viewDetail, setViewDetail] = useState<InvoiceDetail | null>(null);
    const [viewDetailLoading, setViewDetailLoading] = useState(false);

    const openView = async (invoiceId: string) => {
        setViewOpen(true);
        setViewDetailLoading(true);
        setViewDetail(null);
        try {
            const res = await api.get(`/billing/invoice/${invoiceId}`);
            setViewDetail(res.data);
        } catch {
            toast.error('Failed to load invoice');
            setViewOpen(false);
        } finally {
            setViewDetailLoading(false);
        }
    };

    const handleReprint = async (invoiceId: string) => {
        try {
            const res = await api.get(`/billing/invoice/${invoiceId}`);
            const inv: InvoiceDetail = res.data;
            setReceiptData({
                invoice_number: inv.invoice_number,
                patient_name: inv.patients?.full_name ?? 'Walk-in',
                patient_code: inv.patients?.patient_code,
                items: inv.invoice_items,
                total: inv.total,
                paid_amount: inv.paid_amount,
                balance: inv.balance,
                payment_method: inv.payment_method,
                payment_amount: Number(inv.paid_amount),
                reference: 'Reprint',
                paid_at: new Date().toISOString(),
            });
        } catch {
            toast.error('Failed to load invoice for reprint');
        }
    };

    // ---- Walk-in pharmacy sale ("New Invoice" tab) ----
    const [wiItems, setWiItems] = useState<WalkInItem[]>([]);
    const [wiPaymentMethod, setWiPaymentMethod] = useState('CASH');
    const [wiReference, setWiReference] = useState('');

    const [wiMedModalOpen, setWiMedModalOpen] = useState(false);
    const [wiMedStock, setWiMedStock] = useState<SaleMedicine[]>([]);
    const [wiMedLoading, setWiMedLoading] = useState(false);
    const [wiMedSearch, setWiMedSearch] = useState('');
    const [wiMedPage, setWiMedPage] = useState(1);
    const [wiMedPageSize, setWiMedPageSize] = useState(5);

    const [wiEditIndex, setWiEditIndex] = useState<number | null>(null);
    const [wiPickedId, setWiPickedId] = useState<string | null>(null);
    const [wiPickedLabel, setWiPickedLabel] = useState('');
    const [wiDose, setWiDose] = useState('');
    const [wiFrequency, setWiFrequency] = useState('');
    const [wiDuration, setWiDuration] = useState('');
    const [wiQty, setWiQty] = useState('1');
    const [wiUnitPrice, setWiUnitPrice] = useState('');

    // Same admin-managed dropdown lists used in Consultation's prescription form.
    const [doseOptions, setDoseOptions] = useState<LookupOption[]>([]);
    const [frequencyOptions, setFrequencyOptions] = useState<LookupOption[]>([]);
    const [durationOptions, setDurationOptions] = useState<LookupOption[]>([]);
    useEffect(() => {
        api.get('/lookups/doses').then((r) => setDoseOptions(r.data)).catch(() => { });
        api.get('/lookups/frequencies').then((r) => setFrequencyOptions(r.data)).catch(() => { });
        api.get('/lookups/durations').then((r) => setDurationOptions(r.data)).catch(() => { });
    }, []);

    const loadWiMedStock = useCallback(async () => {
        setWiMedLoading(true);
        try {
            const res = await api.get('/billing/medicines-in-stock');
            setWiMedStock(res.data);
        } catch {
            toast.error('Failed to load medicines');
        } finally {
            setWiMedLoading(false);
        }
    }, []);

    useEffect(() => { if (wiMedModalOpen) loadWiMedStock(); }, [wiMedModalOpen, loadWiMedStock]);
    useEffect(() => { setWiMedPage(1); }, [wiMedSearch]);

    const filteredWiMedStock = useMemo(() => {
        const q = wiMedSearch.trim().toLowerCase();
        if (!q) return wiMedStock;
        return wiMedStock.filter(
            (m) => m.generic_name.toLowerCase().includes(q)
                || m.medicine_code.toLowerCase().includes(q)
                || (m.brand_name ?? '').toLowerCase().includes(q),
        );
    }, [wiMedStock, wiMedSearch]);

    const pagedWiMedStock = filteredWiMedStock.slice((wiMedPage - 1) * wiMedPageSize, wiMedPage * wiMedPageSize);

    const openAddWiMedicine = () => {
        setWiEditIndex(null);
        setWiPickedId(null);
        setWiPickedLabel('');
        setWiDose(''); setWiFrequency(''); setWiDuration(''); setWiQty('1'); setWiUnitPrice('');
        setWiMedSearch('');
        setWiMedPage(1);
        setWiMedModalOpen(true);
    };

    const openEditWiMedicine = (i: number) => {
        const item = wiItems[i];
        setWiEditIndex(i);
        setWiPickedId(item.medicine_id);
        setWiPickedLabel(item.medicine_name);
        setWiDose(item.dose); setWiFrequency(item.frequency); setWiDuration(item.duration);
        setWiQty(item.quantity); setWiUnitPrice(item.unit_price);
        setWiMedSearch('');
        setWiMedPage(1);
        setWiMedModalOpen(true);
    };

    const pickWiMedicine = (m: SaleMedicine) => {
        setWiPickedId(m.id);
        setWiPickedLabel(`${m.generic_name}${m.brand_name ? ` (${m.brand_name})` : ''}`);
        setWiUnitPrice(String(m.selling_price));
    };

    const handleSaveWiItem = () => {
        if (!wiPickedId || !wiPickedLabel.trim()) { toast.error('Select a medicine'); return; }
        if (!wiQty || Number(wiQty) <= 0) { toast.error('Enter a valid quantity'); return; }
        if (wiUnitPrice === '' || Number(wiUnitPrice) < 0) { toast.error('Enter a valid price'); return; }
        const item: WalkInItem = {
            medicine_id: wiPickedId, medicine_name: wiPickedLabel,
            dose: wiDose, frequency: wiFrequency, duration: wiDuration,
            quantity: wiQty, unit_price: wiUnitPrice,
        };
        if (wiEditIndex !== null) {
            setWiItems((prev) => prev.map((it, idx) => (idx === wiEditIndex ? item : it)));
        } else {
            setWiItems((prev) => [...prev, item]);
        }
        setWiMedModalOpen(false);
    };

    const handleDeleteWiItem = async (i: number) => {
        if (!(await confirm('Remove this medicine from the invoice?', { variant: 'destructive', confirmText: 'Remove' }))) return;
        setWiItems((prev) => prev.filter((_, idx) => idx !== i));
    };

    // ---- Diagnostic tests (walk-in sale) ----
    const [wiTests, setWiTests] = useState<WalkInTestItem[]>([]);
    const [wiTestModalOpen, setWiTestModalOpen] = useState(false);
    const [wiTestList, setWiTestList] = useState<DiagnosticTest[]>([]);
    const [wiTestLoading, setWiTestLoading] = useState(false);
    const [wiTestEditIndex, setWiTestEditIndex] = useState<number | null>(null);
    const [wiTestPickedId, setWiTestPickedId] = useState<string | null>(null);
    const [wiTestPickedLabel, setWiTestPickedLabel] = useState('');
    const [wiTestQty, setWiTestQty] = useState('1');
    const [wiTestUnitPrice, setWiTestUnitPrice] = useState('');

    const loadWiTests = useCallback(async () => {
        setWiTestLoading(true);
        try {
            const res = await api.get('/billing/tests-list');
            setWiTestList(res.data);
        } catch {
            toast.error('Failed to load tests');
        } finally {
            setWiTestLoading(false);
        }
    }, []);

    useEffect(() => { if (wiTestModalOpen) loadWiTests(); }, [wiTestModalOpen, loadWiTests]);

    const openAddWiTest = () => {
        setWiTestEditIndex(null);
        setWiTestPickedId(null);
        setWiTestPickedLabel('');
        setWiTestQty('1');
        setWiTestUnitPrice('');
        setWiTestModalOpen(true);
    };

    const openEditWiTest = (i: number) => {
        const item = wiTests[i];
        setWiTestEditIndex(i);
        setWiTestPickedId(item.test_id);
        setWiTestPickedLabel(item.test_name);
        setWiTestQty(item.quantity);
        setWiTestUnitPrice(item.unit_price);
        setWiTestModalOpen(true);
    };

    const pickWiTest = (t: DiagnosticTest) => {
        setWiTestPickedId(t.id);
        setWiTestPickedLabel(t.name);
        setWiTestUnitPrice(t.price);
    };

    const handleSaveWiTest = () => {
        if (!wiTestPickedId || !wiTestPickedLabel.trim()) { toast.error('Select a test'); return; }
        if (!wiTestQty || Number(wiTestQty) <= 0) { toast.error('Enter a valid quantity'); return; }
        if (wiTestUnitPrice === '' || Number(wiTestUnitPrice) < 0) { toast.error('Enter a valid price'); return; }
        const item: WalkInTestItem = {
            test_id: wiTestPickedId, test_name: wiTestPickedLabel,
            quantity: wiTestQty, unit_price: wiTestUnitPrice,
        };
        if (wiTestEditIndex !== null) {
            setWiTests((prev) => prev.map((it, idx) => (idx === wiTestEditIndex ? item : it)));
        } else {
            setWiTests((prev) => [...prev, item]);
        }
        setWiTestModalOpen(false);
    };

    const handleDeleteWiTest = async (i: number) => {
        if (!(await confirm('Remove this test from the invoice?', { variant: 'destructive', confirmText: 'Remove' }))) return;
        setWiTests((prev) => prev.filter((_, idx) => idx !== i));
    };

    // ---- Services (walk-in sale) — hospital fee, consultation, or other misc charges ----
    const [wiServices, setWiServices] = useState<WalkInServiceItem[]>([]);
    const [wiServiceModalOpen, setWiServiceModalOpen] = useState(false);
    const [wiServiceEditIndex, setWiServiceEditIndex] = useState<number | null>(null);
    const [wiServiceDescription, setWiServiceDescription] = useState('');
    const [wiServiceType, setWiServiceType] = useState<'HOSPITAL_FEE' | 'CONSULTATION' | 'OTHER'>('HOSPITAL_FEE');
    const [wiServiceQty, setWiServiceQty] = useState('1');
    const [wiServiceUnitPrice, setWiServiceUnitPrice] = useState('');

    const openAddWiService = () => {
        setWiServiceEditIndex(null);
        setWiServiceDescription('');
        setWiServiceType('HOSPITAL_FEE');
        setWiServiceQty('1');
        setWiServiceUnitPrice('');
        setWiServiceModalOpen(true);
    };

    const openEditWiService = (i: number) => {
        const item = wiServices[i];
        setWiServiceEditIndex(i);
        setWiServiceDescription(item.description);
        setWiServiceType(item.item_type);
        setWiServiceQty(item.quantity);
        setWiServiceUnitPrice(item.unit_price);
        setWiServiceModalOpen(true);
    };

    const handleSaveWiService = () => {
        if (!wiServiceDescription.trim()) { toast.error('Enter a description'); return; }
        if (!wiServiceQty || Number(wiServiceQty) <= 0) { toast.error('Enter a valid quantity'); return; }
        if (wiServiceUnitPrice === '' || Number(wiServiceUnitPrice) < 0) { toast.error('Enter a valid price'); return; }
        const item: WalkInServiceItem = {
            description: wiServiceDescription.trim(), item_type: wiServiceType,
            quantity: wiServiceQty, unit_price: wiServiceUnitPrice,
        };
        if (wiServiceEditIndex !== null) {
            setWiServices((prev) => prev.map((it, idx) => (idx === wiServiceEditIndex ? item : it)));
        } else {
            setWiServices((prev) => [...prev, item]);
        }
        setWiServiceModalOpen(false);
    };

    const handleDeleteWiService = async (i: number) => {
        if (!(await confirm('Remove this service from the invoice?', { variant: 'destructive', confirmText: 'Remove' }))) return;
        setWiServices((prev) => prev.filter((_, idx) => idx !== i));
    };

    const wiTotal = wiItems.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0,
    ) + wiTests.reduce(
        (sum, t) => sum + (Number(t.quantity) || 0) * (Number(t.unit_price) || 0), 0,
    ) + wiServices.reduce(
        (sum, s) => sum + (Number(s.quantity) || 0) * (Number(s.unit_price) || 0), 0,
    );

    const handleCreateWalkInSale = async () => {
        if (wiItems.length === 0 && wiTests.length === 0 && wiServices.length === 0) {
            toast.error('Add at least one medicine, test or service');
            return;
        }
        try {
            const res = await api.post('/billing/walk-in-sale', {
                payment_method: wiPaymentMethod,
                items: wiItems.map((it) => ({
                    medicine_id: Number(it.medicine_id),
                    dose: it.dose || undefined,
                    frequency: it.frequency || undefined,
                    duration: it.duration || undefined,
                    quantity: Number(it.quantity),
                    unit_price: Number(it.unit_price),
                })),
                tests: wiTests.map((t) => ({
                    test_id: Number(t.test_id),
                    quantity: Number(t.quantity),
                    unit_price: Number(t.unit_price),
                })),
                services: wiServices.map((s) => ({
                    description: s.description,
                    item_type: s.item_type,
                    quantity: Number(s.quantity),
                    unit_price: Number(s.unit_price),
                })),
            });
            toast.success(`Invoice ${res.data.invoice_number} created — LKR ${Number(res.data.total).toFixed(2)}`);
            setReceiptData({
                invoice_number: res.data.invoice_number,
                patient_name: 'Walk-in',
                items: res.data.invoice_items,
                total: res.data.total,
                paid_amount: res.data.paid_amount,
                balance: res.data.balance,
                payment_method: wiPaymentMethod,
                payment_amount: Number(res.data.paid_amount),
                reference: wiReference,
                paid_at: new Date().toISOString(),
            });
            setWiItems([]);
            setWiTests([]);
            setWiServices([]);
            setWiPaymentMethod('CASH');
            setWiReference('');
            loadInvoices();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to create invoice');
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Billing</h1>
            <p className="text-slate-500 mb-6">Invoices and walk-in pharmacy sales</p>

            <Tabs defaultValue="inpatient">
                <TabsList>
                    <TabsTrigger value="inpatient">Inpatient Invoices</TabsTrigger>
                    {hasPermission('invoice.create') && <TabsTrigger value="create">New Invoice</TabsTrigger>}
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                </TabsList>

                {/* INPATIENT INVOICES — from finalized prescriptions */}
                <TabsContent value="inpatient">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-700">Inpatient Invoices</h3>
                        <div className="relative w-64">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                className="pl-7 h-8 text-sm"
                                placeholder="Search invoice, patient, code..."
                                value={ipSearch}
                                onChange={(e) => setIpSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="bg-white rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Patient</TableHead>
                                    <TableHead>Prescription</TableHead>
                                    <TableHead>Doctor</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Paid</TableHead>
                                    <TableHead>Balance</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ipLoading ? (
                                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                                ) : ipInvoices.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">No inpatient invoices</TableCell></TableRow>
                                ) : ipInvoices.map((inv) => (
                                    <TableRow key={inv.id}>
                                        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">{inv.patients?.full_name ?? '-'}</p>
                                            <p className="text-xs text-slate-400">{inv.patients?.patient_code}</p>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{inv.prescriptions[0]?.prescription_code ?? '-'}</TableCell>
                                        <TableCell>{inv.prescriptions[0]?.doctors.full_name ?? '-'}</TableCell>
                                        <TableCell className="font-bold">LKR {Number(inv.total).toFixed(2)}</TableCell>
                                        <TableCell>LKR {Number(inv.paid_amount).toFixed(2)}</TableCell>
                                        <TableCell>LKR {Number(inv.balance).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <span className={`text-xs px-2 py-1 rounded ${inv.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                                inv.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>{inv.status}</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {inv.status !== 'PAID' && hasPermission('invoice.create') && (
                                                <Button size="sm" variant="outline" onClick={() => openPay(inv.id)}>
                                                    <CreditCard size={14} className="mr-1" />Pay
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Pagination
                            page={ipPage} pageSize={ipPageSize} total={ipTotal}
                            onPageChange={setIpPage}
                            onPageSizeChange={(n) => { setIpPageSize(n); setIpPage(1); }}
                        />
                    </div>
                </TabsContent>

                {/* NEW INVOICE — walk-in pharmacy sale */}
                <TabsContent value="create">
                    <Card><CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-700">Walk-in Patient</h3>
                                <p className="text-xs text-slate-500">Pharmacy sale — no patient registration required</p>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={openAddWiMedicine}>
                                    <Plus size={14} className="mr-1" />Add Medicine
                                </Button>
                                <Button size="sm" variant="outline" onClick={openAddWiTest}>
                                    <FlaskConical size={14} className="mr-1" />Add Test
                                </Button>
                                <Button size="sm" variant="outline" onClick={openAddWiService}>
                                    <Plus size={14} className="mr-1" />Add Service
                                </Button>
                            </div>
                        </div>

                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Medicine</TableHead>
                                        <TableHead>Dose</TableHead>
                                        <TableHead>Frequency</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Unit Price</TableHead>
                                        <TableHead>Line Total</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {wiItems.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="text-center py-6 text-slate-400">No medicines added</TableCell></TableRow>
                                    ) : wiItems.map((item, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                            <TableCell>{item.dose || '-'}</TableCell>
                                            <TableCell>{item.frequency || '-'}</TableCell>
                                            <TableCell>{item.duration || '-'}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>LKR {Number(item.unit_price).toFixed(2)}</TableCell>
                                            <TableCell className="font-medium">
                                                LKR {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEditWiMedicine(i)}>
                                                        <Pencil size={14} />
                                                    </Button>
                                                    <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => handleDeleteWiItem(i)}>
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div>
                            <Label className="mb-2 block">Diagnostic Tests</Label>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Test</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit Price</TableHead>
                                            <TableHead>Line Total</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {wiTests.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-400">No tests added</TableCell></TableRow>
                                        ) : wiTests.map((item, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="font-medium">{item.test_name}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                                <TableCell>LKR {Number(item.unit_price).toFixed(2)}</TableCell>
                                                <TableCell className="font-medium">
                                                    LKR {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEditWiTest(i)}>
                                                            <Pencil size={14} />
                                                        </Button>
                                                        <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => handleDeleteWiTest(i)}>
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

                        <div>
                            <Label className="mb-2 block">Services (optional — hospital fee, consultation, etc.)</Label>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit Price</TableHead>
                                            <TableHead>Line Total</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {wiServices.length === 0 ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-400">No services added</TableCell></TableRow>
                                        ) : wiServices.map((item, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="font-medium">{item.description}</TableCell>
                                                <TableCell>{item.item_type.replace('_', ' ')}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                                <TableCell>LKR {Number(item.unit_price).toFixed(2)}</TableCell>
                                                <TableCell className="font-medium">
                                                    LKR {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEditWiService(i)}>
                                                            <Pencil size={14} />
                                                        </Button>
                                                        <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => handleDeleteWiService(i)}>
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

                        <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-lg font-bold">Total: LKR {wiTotal.toFixed(2)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                            <div className="space-y-2">
                                <Label>Payment Method</Label>
                                <select className="w-full border rounded-md h-9 px-3 text-sm"
                                    value={wiPaymentMethod} onChange={(e) => setWiPaymentMethod(e.target.value)}>
                                    <option value="CASH">Cash</option>
                                    <option value="CARD">Card</option>
                                    <option value="MIXED">Mixed</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Payment Details (reference, notes...)</Label>
                                <Input value={wiReference} onChange={(e) => setWiReference(e.target.value)} placeholder="Optional" />
                            </div>
                        </div>

                        <Button onClick={handleCreateWalkInSale}
                            disabled={wiItems.length === 0 && wiTests.length === 0 && wiServices.length === 0}>
                            <Receipt size={16} className="mr-2" />Create & Print Invoice
                        </Button>
                    </CardContent></Card>
                </TabsContent>

                {/* INVOICE LIST — completed invoices, inpatient + walk-in */}
                <TabsContent value="invoices">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-700">Invoices</h3>
                        <select
                            className="border rounded-md h-8 px-2 text-sm"
                            value={invSourceFilter}
                            onChange={(e) => setInvSourceFilter(e.target.value as 'ALL' | 'INPATIENT' | 'WALKIN')}
                        >
                            <option value="ALL">All Sources</option>
                            <option value="INPATIENT">Inpatient</option>
                            <option value="WALKIN">Walk-in</option>
                        </select>
                    </div>
                    <div className="bg-white rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Patient</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No invoices</TableCell></TableRow>
                                ) : filteredInvoices.slice((invoicePage - 1) * invoicePageSize, invoicePage * invoicePageSize).map((inv) => (
                                    <TableRow key={inv.id}>
                                        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                                        <TableCell>{inv.patients?.full_name ?? 'Walk-in'}</TableCell>
                                        <TableCell>{inv.invoice_type}</TableCell>
                                        <TableCell>
                                            <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                                                {inv.prescriptions.length > 0 ? 'Inpatient' : 'Walk-in'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-bold">LKR {Number(inv.total).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <span className={`text-xs px-2 py-1 rounded ${inv.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                                    inv.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-slate-100 text-slate-700'
                                                }`}>{inv.status}</span>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-500">{inv.created_at.slice(0, 10)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon-sm" title="View" onClick={() => openView(inv.id)}>
                                                    <Eye size={14} />
                                                </Button>
                                                <Button variant="ghost" size="icon-sm" title="Reprint invoice" onClick={() => handleReprint(inv.id)}>
                                                    <Printer size={14} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Pagination
                            page={invoicePage} pageSize={invoicePageSize} total={filteredInvoices.length}
                            onPageChange={setInvoicePage}
                            onPageSizeChange={(n) => { setInvoicePageSize(n); setInvoicePage(1); }}
                        />
                    </div>
                </TabsContent>

            </Tabs>

            {/* Pay invoice dialog */}
            <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader><DialogTitle>Pay Invoice</DialogTitle></DialogHeader>
                    {payDetailLoading || !payDetail ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-sm text-slate-500">{payDetail.invoice_number}</p>
                                    <p className="font-bold text-lg">{payDetail.patients?.full_name ?? 'Walk-in'}</p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${payDetail.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                                    }`}>{payDetail.status}</span>
                            </div>

                            {/* Prescription — everything the doctor assigned */}
                            {payDetail.prescriptions.map((rx) => (
                                <div key={rx.id}>
                                    <Label className="mb-1 block">
                                        Prescription {rx.prescription_code} — Dr. {rx.doctors.full_name}
                                    </Label>
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Medicine</TableHead>
                                                    <TableHead>Dose</TableHead>
                                                    <TableHead>Frequency</TableHead>
                                                    <TableHead>Duration</TableHead>
                                                    <TableHead>Qty</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rx.prescription_items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                                        <TableCell>{item.dose ?? '-'}</TableCell>
                                                        <TableCell>{item.frequency ?? '-'}</TableCell>
                                                        <TableCell>{item.duration ?? '-'}</TableCell>
                                                        <TableCell>{item.quantity ?? '-'}</TableCell>
                                                        <TableCell>
                                                            <span className={`text-xs px-2 py-1 rounded ${item.status === 'ADDED' ? 'bg-green-100 text-green-700' :
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
                            ))}

                            {/* Completed / billed items */}
                            <div>
                                <Label className="mb-1 block">Billed Items</Label>
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Qty</TableHead>
                                                <TableHead>Unit Price</TableHead>
                                                <TableHead>Line Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {payDetail.invoice_items.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.description}</TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell>LKR {Number(item.unit_price).toFixed(2)}</TableCell>
                                                    <TableCell className="font-medium">LKR {Number(item.line_total).toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <div className="flex justify-between text-sm border-t pt-3">
                                <span>Total: <span className="font-bold">LKR {Number(payDetail.total).toFixed(2)}</span></span>
                                <span>Paid: <span className="font-bold">LKR {Number(payDetail.paid_amount).toFixed(2)}</span></span>
                                <span>Balance: <span className="font-bold text-red-600">LKR {Number(payDetail.balance).toFixed(2)}</span></span>
                            </div>

                            {/* Payment form */}
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                                <div className="space-y-2">
                                    <Label>Payment Method</Label>
                                    <select className="w-full border rounded-md h-9 px-3 text-sm"
                                        value={payMethodChoice} onChange={(e) => setPayMethodChoice(e.target.value)}>
                                        <option value="CASH">Cash</option>
                                        <option value="CARD">Card</option>
                                        <option value="MIXED">Mixed</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount *</Label>
                                    <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Payment Details (reference, cheque #, notes...)</Label>
                                <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Optional" />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitPayment} disabled={payDetailLoading || !payDetail}>Pay</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View invoice dialog (read-only) */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader><DialogTitle>Invoice Details</DialogTitle></DialogHeader>
                    {viewDetailLoading || !viewDetail ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-sm text-slate-500">{viewDetail.invoice_number}</p>
                                    <p className="font-bold text-lg">{viewDetail.patients?.full_name ?? 'Walk-in'}</p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{viewDetail.status}</span>
                            </div>

                            {viewDetail.prescriptions.map((rx) => (
                                <div key={rx.id}>
                                    <Label className="mb-1 block">
                                        Prescription {rx.prescription_code} — Dr. {rx.doctors.full_name}
                                    </Label>
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Medicine</TableHead>
                                                    <TableHead>Dose</TableHead>
                                                    <TableHead>Frequency</TableHead>
                                                    <TableHead>Duration</TableHead>
                                                    <TableHead>Qty</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rx.prescription_items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                                        <TableCell>{item.dose ?? '-'}</TableCell>
                                                        <TableCell>{item.frequency ?? '-'}</TableCell>
                                                        <TableCell>{item.duration ?? '-'}</TableCell>
                                                        <TableCell>{item.quantity ?? '-'}</TableCell>
                                                        <TableCell>
                                                            <span className={`text-xs px-2 py-1 rounded ${item.status === 'ADDED' ? 'bg-green-100 text-green-700' :
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
                            ))}

                            <div>
                                <Label className="mb-1 block">Billed Items</Label>
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Qty</TableHead>
                                                <TableHead>Unit Price</TableHead>
                                                <TableHead>Line Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {viewDetail.invoice_items.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.description}</TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell>LKR {Number(item.unit_price).toFixed(2)}</TableCell>
                                                    <TableCell className="font-medium">LKR {Number(item.line_total).toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <div className="flex justify-between text-sm border-t pt-3">
                                <span>Total: <span className="font-bold">LKR {Number(viewDetail.total).toFixed(2)}</span></span>
                                <span>Paid: <span className="font-bold">LKR {Number(viewDetail.paid_amount).toFixed(2)}</span></span>
                                <span>Method: <span className="font-bold">{viewDetail.payment_method}</span></span>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
                        {viewDetail && (
                            <Button onClick={() => handleReprint(viewDetail.id)}>
                                <Printer size={14} className="mr-2" />Reprint
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Edit Medicine modal (walk-in sale) */}
            <Dialog open={wiMedModalOpen} onOpenChange={setWiMedModalOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{wiEditIndex !== null ? 'Edit Medicine' : 'Add Medicine'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input className="pl-9" placeholder="Search medicines by name or code..."
                                value={wiMedSearch} onChange={(e) => setWiMedSearch(e.target.value)} />
                        </div>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Medicine</TableHead>
                                        <TableHead>Strength</TableHead>
                                        <TableHead>In Stock</TableHead>
                                        <TableHead>Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {wiMedLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
                                    ) : pagedWiMedStock.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-400">No medicines in stock</TableCell></TableRow>
                                    ) : pagedWiMedStock.map((m) => (
                                        <TableRow
                                            key={m.id}
                                            onClick={() => pickWiMedicine(m)}
                                            className={`cursor-pointer ${wiPickedId === m.id ? 'bg-slate-100' : ''}`}
                                        >
                                            <TableCell className="font-mono text-sm">{m.medicine_code}</TableCell>
                                            <TableCell className="font-medium">
                                                {m.generic_name}
                                                {m.brand_name && <span className="text-slate-400"> ({m.brand_name})</span>}
                                            </TableCell>
                                            <TableCell>{m.strength ?? '-'}</TableCell>
                                            <TableCell>{m.available_quantity}</TableCell>
                                            <TableCell>LKR {m.selling_price.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Pagination
                                page={wiMedPage} pageSize={wiMedPageSize} total={filteredWiMedStock.length}
                                onPageChange={setWiMedPage}
                                onPageSizeChange={(n) => { setWiMedPageSize(n); setWiMedPage(1); }}
                            />
                        </div>

                        {wiPickedLabel && (
                            <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                <p className="text-sm font-medium">Selected: {wiPickedLabel}</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Dose</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={wiDose} onChange={(e) => setWiDose(e.target.value)}>
                                            <option value="">Select dose</option>
                                            {doseOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Frequency</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={wiFrequency} onChange={(e) => setWiFrequency(e.target.value)}>
                                            <option value="">Select frequency</option>
                                            {frequencyOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Duration</Label>
                                        <select className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={wiDuration} onChange={(e) => setWiDuration(e.target.value)}>
                                            <option value="">Select duration</option>
                                            {durationOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Quantity</Label>
                                        <Input type="number" value={wiQty} onChange={(e) => setWiQty(e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Unit Price (LKR)</Label>
                                    <Input type="number" value={wiUnitPrice} onChange={(e) => setWiUnitPrice(e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWiMedModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveWiItem} disabled={!wiPickedLabel}>
                            {wiEditIndex !== null ? 'Save Changes' : 'Add to Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Edit Test modal (walk-in sale) */}
            <Dialog open={wiTestModalOpen} onOpenChange={setWiTestModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{wiTestEditIndex !== null ? 'Edit Test' : 'Add Test'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="border rounded-md max-h-56 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Test</TableHead>
                                        <TableHead>Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {wiTestLoading ? (
                                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
                                    ) : wiTestList.length === 0 ? (
                                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-400">No tests available</TableCell></TableRow>
                                    ) : wiTestList.map((t) => (
                                        <TableRow
                                            key={t.id}
                                            onClick={() => pickWiTest(t)}
                                            className={`cursor-pointer ${wiTestPickedId === t.id ? 'bg-slate-100' : ''}`}
                                        >
                                            <TableCell className="font-mono text-sm">{t.test_code}</TableCell>
                                            <TableCell className="font-medium">{t.name}</TableCell>
                                            <TableCell>LKR {Number(t.price).toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {wiTestPickedLabel && (
                            <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                <p className="text-sm font-medium">Selected: {wiTestPickedLabel}</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Quantity</Label>
                                        <Input type="number" value={wiTestQty} onChange={(e) => setWiTestQty(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Unit Price (LKR)</Label>
                                        <Input type="number" value={wiTestUnitPrice} onChange={(e) => setWiTestUnitPrice(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWiTestModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveWiTest} disabled={!wiTestPickedLabel}>
                            {wiTestEditIndex !== null ? 'Save Changes' : 'Add to Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Edit Service modal (walk-in sale) */}
            <Dialog open={wiServiceModalOpen} onOpenChange={setWiServiceModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{wiServiceEditIndex !== null ? 'Edit Service' : 'Add Service'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Description *</Label>
                            <Input value={wiServiceDescription} onChange={(e) => setWiServiceDescription(e.target.value)}
                                placeholder="e.g. Hospital Fee, Consultation Fee" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={wiServiceType}
                                onChange={(e) => setWiServiceType(e.target.value as 'HOSPITAL_FEE' | 'CONSULTATION' | 'OTHER')}>
                                <option value="HOSPITAL_FEE">Hospital Fee</option>
                                <option value="CONSULTATION">Consultation</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Quantity</Label>
                                <Input type="number" min={1} value={wiServiceQty} onChange={(e) => setWiServiceQty(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Unit Price (LKR)</Label>
                                <Input type="number" min={0} value={wiServiceUnitPrice} onChange={(e) => setWiServiceUnitPrice(e.target.value)} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWiServiceModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveWiService} disabled={!wiServiceDescription.trim()}>
                            {wiServiceEditIndex !== null ? 'Save Changes' : 'Add to Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* POS receipt — hidden on screen, only shown to the printer via .pos-receipt CSS */}
            {receiptData && (
                <div className="pos-receipt">
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 'bold', fontSize: 14 }}>{business?.business_name || 'QuraXa Channeling Center'}</div>
                        {business?.address && <div>{business.address}</div>}
                        {business?.phone && <div>{business.phone}</div>}
                        {business?.business_reg_no && <div>Reg No: {business.business_reg_no}</div>}
                        {business?.tin_number && <div>TIN: {business.tin_number}</div>}
                        <div>{new Date(receiptData.paid_at).toLocaleString()}</div>
                    </div>
                    <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                    <div>Invoice: {receiptData.invoice_number}</div>
                    <div>Patient: {receiptData.patient_name}{receiptData.patient_code ? ` (${receiptData.patient_code})` : ''}</div>
                    <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                    {receiptData.items.map((item) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span>{item.description} x{item.quantity}</span>
                            <span>{Number(item.line_total).toFixed(2)}</span>
                        </div>
                    ))}
                    <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total</span><span>LKR {Number(receiptData.total).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Paid Now</span><span>LKR {receiptData.payment_amount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Paid</span><span>LKR {Number(receiptData.paid_amount).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Balance</span><span>LKR {Number(receiptData.balance).toFixed(2)}</span>
                    </div>
                    <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                    <div>Method: {receiptData.payment_method}</div>
                    {receiptData.reference && <div>Ref: {receiptData.reference}</div>}
                    <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                    <div style={{ textAlign: 'center' }}>Thank you!</div>
                </div>
            )}
        </div>
    );
}
