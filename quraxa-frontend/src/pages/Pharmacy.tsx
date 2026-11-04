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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
    Plus, Trash2, AlertTriangle, Package, Search, ClipboardList, CheckCircle2, Eye, Pencil,
    ShieldOff, ShieldCheck, ListChecks,
} from 'lucide-react';

interface StockLevel {
    medicine_id: string; medicine_code: string; generic_name: string;
    brand_name: string | null; available_quantity: number;
    reorder_level: number; low_stock: boolean; batch_count: number;
}
interface Medicine { id: string; medicine_code: string; generic_name: string; }
interface Supplier { id: string; supplier_code: string; name: string; }
interface DispenseItem { medicine_id: string; quantity: string; }
interface BatchLine {
    medicine_id: string; batch_number: string; expiry_date: string;
    quantity: string; cost_price: string; selling_price: string;
}
interface PendingPatient {
    id: string; patient_code: string; full_name: string; phone: string | null; pending_count: number;
}
interface PrescriptionItem {
    id: string; medicine_id: string | null; medicine_name: string;
    dose: string | null; frequency: string | null; duration: string | null;
    quantity: number | null; instructions: string | null;
    status: 'PENDING' | 'ADDED' | 'UNAVAILABLE';
}
interface PendingPrescription {
    id: string; prescription_code: string; notes: string | null; created_at: string;
    doctors: { full_name: string };
    prescription_items: PrescriptionItem[];
}
interface StockBatch {
    id: string; batch_number: string; supplier_name: string | null;
    expiry_date: string; quantity_received: number; quantity_available: number;
    cost_price: number; selling_price: number; is_expired: boolean; is_low_stock: boolean;
}
interface StockBatchesResponse {
    medicine: { id: string; medicine_code: string; generic_name: string; brand_name: string | null; reorder_level: number };
    batches: StockBatch[];
}
interface AddBatchForm {
    batch_number: string; expiry_date: string; quantity: string;
    cost_price: string; selling_price: string; supplier_id: string;
}
const emptyAddBatchForm: AddBatchForm = {
    batch_number: '', expiry_date: '', quantity: '', cost_price: '', selling_price: '', supplier_id: '',
};
interface MedicineCategory { id: string; name: string; }
interface LookupOption { id: string; name: string; is_active: boolean; }
interface SupplierFull {
    id: string; supplier_code: string; name: string; contact_person: string | null;
    phone: string | null; email: string | null; address: string | null; is_active: boolean;
}
interface SupplierForm {
    id: string | null; name: string; contact_person: string; phone: string; email: string; address: string;
}
const emptySupplierForm: SupplierForm = {
    id: null, name: '', contact_person: '', phone: '', email: '', address: '',
};
interface MedicineFull {
    id: string; medicine_code: string; generic_name: string; brand_name: string | null;
    category_id: string | null; strength: string | null; unit: string;
    reorder_level: number; default_selling_price: number; is_active: boolean;
    medicine_categories: { id: string; name: string } | null;
}
interface MedicineForm {
    id: string | null; medicine_code: string; generic_name: string; brand_name: string;
    category_id: string; strength: string; unit: string;
    reorder_level: string; default_selling_price: string; is_active: boolean;
}
const emptyMedicineForm: MedicineForm = {
    id: null, medicine_code: '', generic_name: '', brand_name: '',
    category_id: '', strength: '', unit: 'unit', reorder_level: '0', default_selling_price: '0', is_active: true,
};

export default function Pharmacy() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [stock, setStock] = useState<StockLevel[]>([]);
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    // const [stockPage, setStockPage] = useState(1);
    // const [stockPageSize, setStockPageSize] = useState(5);

    // ---- Stock Levels: view batches modal ----
    const [batchesOpen, setBatchesOpen] = useState(false);
    const [batchesLoading, setBatchesLoading] = useState(false);
    const [batchesData, setBatchesData] = useState<StockBatchesResponse | null>(null);
    const [batchesPage, setBatchesPage] = useState(1);
    const [batchesPageSize, setBatchesPageSize] = useState(5);
    const [viewedMedicineId, setViewedMedicineId] = useState<string | null>(null);
    const [addBatchOpen, setAddBatchOpen] = useState(false);
    const [addBatchForm, setAddBatchForm] = useState<AddBatchForm>(emptyAddBatchForm);
    const [addBatchSaving, setAddBatchSaving] = useState(false);

    const viewBatches = async (medicineId: string) => {
        setViewedMedicineId(medicineId);
        setBatchesOpen(true);
        setBatchesLoading(true);
        setBatchesData(null);
        setBatchesPage(1);
        setBatchesPageSize(5);
        setAddBatchOpen(false);
        setAddBatchForm(emptyAddBatchForm);
        try {
            const res = await api.get(`/pharmacy/stock/${medicineId}/batches`);
            setBatchesData(res.data);
        } catch {
            toast.error('Failed to load batches');
            setBatchesOpen(false);
        } finally {
            setBatchesLoading(false);
        }
    };

    const handleAddBatch = async () => {
        if (!viewedMedicineId) return;
        if (!addBatchForm.batch_number || !addBatchForm.expiry_date || !addBatchForm.quantity) {
            toast.error('Batch #, expiry date and quantity are required');
            return;
        }
        setAddBatchSaving(true);
        try {
            await api.post(`/pharmacy/stock/${viewedMedicineId}/batches`, {
                batch_number: addBatchForm.batch_number,
                expiry_date: addBatchForm.expiry_date,
                quantity: Number(addBatchForm.quantity),
                cost_price: Number(addBatchForm.cost_price || 0),
                selling_price: Number(addBatchForm.selling_price || 0),
                supplier_id: addBatchForm.supplier_id ? Number(addBatchForm.supplier_id) : undefined,
            });
            toast.success('Batch added');
            setAddBatchOpen(false);
            setAddBatchForm(emptyAddBatchForm);
            const res = await api.get(`/pharmacy/stock/${viewedMedicineId}/batches`);
            setBatchesData(res.data);
            loadStock();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to add batch');
        } finally {
            setAddBatchSaving(false);
        }
    };

    const loadStock = useCallback(async () => {
        try {
            const res = await api.get('/pharmacy/stock');
            setStock(res.data);
        } catch { toast.error('Failed to load stock'); }
    }, []);

    useEffect(() => { loadStock(); }, [loadStock]);
    useEffect(() => {
        api.get('/pharmacy/medicines-list').then((r) => setMedicines(r.data)).catch(() => { });
        api.get('/pharmacy/suppliers-list').then((r) => setSuppliers(r.data)).catch(() => { });
    }, []);

    // ---- Manage Medicines ----
    const [medicineList, setMedicineList] = useState<MedicineFull[]>([]);
    const [medicineCategories, setMedicineCategories] = useState<MedicineCategory[]>([]);
    const [medicinesLoading, setMedicinesLoading] = useState(false);
    const [medicinePage, setMedicinePage] = useState(1);
    const [medicinePageSize, setMedicinePageSize] = useState(5);
    const [medicineSearch, setMedicineSearch] = useState('');
    const [medicineFormOpen, setMedicineFormOpen] = useState(false);
    const [medicineForm, setMedicineForm] = useState<MedicineForm>(emptyMedicineForm);
    const [medicineSaving, setMedicineSaving] = useState(false);

    const loadMedicineList = useCallback(async () => {
        setMedicinesLoading(true);
        try {
            const res = await api.get('/pharmacy/medicines');
            setMedicineList(res.data);
        } catch {
            toast.error('Failed to load medicines');
        } finally {
            setMedicinesLoading(false);
        }
    }, []);

    useEffect(() => { loadMedicineList(); }, [loadMedicineList]);
    useEffect(() => {
        api.get('/pharmacy/medicine-categories-list').then((r) => setMedicineCategories(r.data)).catch(() => { });
    }, []);

    // Active-only option lists for the Add/Edit Medicine form's Strength/Unit
    // dropdowns — managed separately (with inactive values too) in the
    // "Attributes" tab below.
    const [strengthOptions, setStrengthOptions] = useState<LookupOption[]>([]);
    const [unitOptions, setUnitOptions] = useState<LookupOption[]>([]);
    const loadStrengthUnitOptions = useCallback(() => {
        api.get('/lookups/strengths').then((r) => setStrengthOptions(r.data)).catch(() => { });
        api.get('/lookups/units').then((r) => setUnitOptions(r.data)).catch(() => { });
    }, []);
    useEffect(() => { loadStrengthUnitOptions(); }, [loadStrengthUnitOptions]);

    const filteredMedicineList = medicineList.filter((m) => {
        const q = medicineSearch.trim().toLowerCase();
        if (!q) return true;
        return m.medicine_code.toLowerCase().includes(q)
            || m.generic_name.toLowerCase().includes(q)
            || (m.brand_name ?? '').toLowerCase().includes(q);
    });

    const openAddMedicine = () => {
        setMedicineForm(emptyMedicineForm);
        setMedicineFormOpen(true);
    };

    const openEditMedicine = (m: MedicineFull) => {
        setMedicineForm({
            id: m.id,
            medicine_code: m.medicine_code,
            generic_name: m.generic_name,
            brand_name: m.brand_name ?? '',
            category_id: m.category_id ?? '',
            strength: m.strength ?? '',
            unit: m.unit,
            reorder_level: String(m.reorder_level),
            default_selling_price: String(m.default_selling_price),
            is_active: m.is_active,
        });
        setMedicineFormOpen(true);
    };

    const handleSaveMedicine = async () => {
        if (!medicineForm.medicine_code || !medicineForm.generic_name) {
            toast.error('Medicine code and generic name are required');
            return;
        }
        const payload = {
            medicine_code: medicineForm.medicine_code,
            generic_name: medicineForm.generic_name,
            brand_name: medicineForm.brand_name || undefined,
            category_id: medicineForm.category_id ? Number(medicineForm.category_id) : undefined,
            strength: medicineForm.strength || undefined,
            unit: medicineForm.unit || undefined,
            reorder_level: Number(medicineForm.reorder_level || 0),
            default_selling_price: Number(medicineForm.default_selling_price || 0),
            is_active: medicineForm.is_active,
        };
        setMedicineSaving(true);
        try {
            if (medicineForm.id) {
                await api.patch(`/pharmacy/medicines/${medicineForm.id}`, payload);
                toast.success('Medicine updated');
            } else {
                await api.post('/pharmacy/medicines', payload);
                toast.success('Medicine added');
            }
            setMedicineFormOpen(false);
            loadMedicineList();
            api.get('/pharmacy/medicines-list').then((r) => setMedicines(r.data)).catch(() => { });
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save medicine');
        } finally {
            setMedicineSaving(false);
        }
    };

    // ---- Manage Suppliers ----
    const [supplierList, setSupplierList] = useState<SupplierFull[]>([]);
    const [suppliersLoading, setSuppliersLoading] = useState(false);
    const [supplierPage, setSupplierPage] = useState(1);
    const [supplierPageSize, setSupplierPageSize] = useState(5);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [supplierFormOpen, setSupplierFormOpen] = useState(false);
    const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplierForm);
    const [supplierSaving, setSupplierSaving] = useState(false);

    const loadSupplierList = useCallback(async () => {
        setSuppliersLoading(true);
        try {
            const res = await api.get('/pharmacy/suppliers');
            setSupplierList(res.data);
        } catch {
            toast.error('Failed to load suppliers');
        } finally {
            setSuppliersLoading(false);
        }
    }, []);

    useEffect(() => { loadSupplierList(); }, [loadSupplierList]);

    const filteredSupplierList = supplierList.filter((s) => {
        const q = supplierSearch.trim().toLowerCase();
        if (!q) return true;
        return s.supplier_code.toLowerCase().includes(q)
            || s.name.toLowerCase().includes(q)
            || (s.contact_person ?? '').toLowerCase().includes(q);
    });

    const refreshSupplierDropdown = () => {
        api.get('/pharmacy/suppliers-list').then((r) => setSuppliers(r.data)).catch(() => { });
    };

    const openAddSupplier = () => {
        setSupplierForm(emptySupplierForm);
        setSupplierFormOpen(true);
    };

    const openEditSupplier = (s: SupplierFull) => {
        setSupplierForm({
            id: s.id, name: s.name, contact_person: s.contact_person ?? '',
            phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
        });
        setSupplierFormOpen(true);
    };

    const handleSaveSupplier = async () => {
        if (!supplierForm.name) {
            toast.error('Supplier name is required');
            return;
        }
        const payload = {
            name: supplierForm.name,
            contact_person: supplierForm.contact_person || undefined,
            phone: supplierForm.phone || undefined,
            email: supplierForm.email || undefined,
            address: supplierForm.address || undefined,
        };
        setSupplierSaving(true);
        try {
            if (supplierForm.id) {
                await api.patch(`/pharmacy/suppliers/${supplierForm.id}`, payload);
                toast.success('Supplier updated');
            } else {
                await api.post('/pharmacy/suppliers', payload);
                toast.success('Supplier added');
            }
            setSupplierFormOpen(false);
            loadSupplierList();
            refreshSupplierDropdown();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save supplier');
        } finally {
            setSupplierSaving(false);
        }
    };

    const handleToggleSupplierActive = async (s: SupplierFull) => {
        const activating = !s.is_active;
        if (!activating && !(await confirm(`Deactivate "${s.name}"? It will no longer appear when receiving stock.`, { variant: 'destructive', confirmText: 'Deactivate' }))) return;
        try {
            await api.patch(`/pharmacy/suppliers/${s.id}`, { is_active: activating });
            toast.success(activating ? 'Supplier activated' : 'Supplier deactivated');
            loadSupplierList();
            refreshSupplierDropdown();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update supplier');
        }
    };

    // ---- Patient Medicines (in-house prescription fulfillment) ----
    const [pmSearch, setPmSearch] = useState('');
    const [pmPage, setPmPage] = useState(1);
    const [pmPageSize, setPmPageSize] = useState(5);
    const [pmTotal, setPmTotal] = useState(0);
    const [pmPatients, setPmPatients] = useState<PendingPatient[]>([]);
    const [pmLoading, setPmLoading] = useState(false);

    const [pmSelectedPatient, setPmSelectedPatient] = useState<PendingPatient | null>(null);
    const [pmPrescriptions, setPmPrescriptions] = useState<PendingPrescription[]>([]);
    const [pmPrescriptionsLoading, setPmPrescriptionsLoading] = useState(false);

    const loadPendingPatients = useCallback(async () => {
        setPmLoading(true);
        try {
            const res = await api.get('/pharmacy/prescriptions/pending-patients', {
                params: { search: pmSearch, page: pmPage, limit: pmPageSize },
            });
            setPmPatients(res.data.data);
            setPmTotal(res.data.total);
        } catch {
            toast.error('Failed to load patients');
        } finally {
            setPmLoading(false);
        }
    }, [pmSearch, pmPage, pmPageSize]);

    useEffect(() => {
        const t = setTimeout(loadPendingPatients, 300);
        return () => clearTimeout(t);
    }, [loadPendingPatients]);

    useEffect(() => { setPmPage(1); }, [pmSearch]);

    const selectPmPatient = async (p: PendingPatient) => {
        setPmSelectedPatient(p);
        setPmPrescriptions([]);
        setPmPrescriptionsLoading(true);
        try {
            const res = await api.get(`/pharmacy/prescriptions/patient/${p.id}`);
            setPmPrescriptions(res.data);
        } catch {
            toast.error('Failed to load prescriptions');
        } finally {
            setPmPrescriptionsLoading(false);
        }
    };

    const handleSetItemStatus = async (itemId: string, status: PrescriptionItem['status']) => {
        try {
            await api.patch(`/pharmacy/prescriptions/item/${itemId}/status`, { status });
            setPmPrescriptions((prev) => prev.map((rx) => ({
                ...rx,
                prescription_items: rx.prescription_items.map((it) => (it.id === itemId ? { ...it, status } : it)),
            })));
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update status');
        }
    };

    // Optimistic local update as the pharmacist types; the real save happens on blur.
    const handleQuantityChange = (rxId: string, itemId: string, value: string) => {
        const quantity = value === '' ? null : Number(value);
        setPmPrescriptions((prev) => prev.map((rx) => (rx.id !== rxId ? rx : {
            ...rx,
            prescription_items: rx.prescription_items.map((it) => (it.id === itemId ? { ...it, quantity } : it)),
        })));
    };

    const handleQuantityBlur = async (itemId: string, quantity: number | null) => {
        if (!quantity || quantity < 1) return;
        try {
            await api.patch(`/pharmacy/prescriptions/item/${itemId}/quantity`, { quantity });
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update quantity');
        }
    };

    const handleFinalizePrescription = async (rx: PendingPrescription) => {
        if (!(await confirm(`Finalize ${rx.prescription_code}? Medicines marked "Added" will be deducted from stock and sent to Billing.`, { confirmText: 'Finalize' }))) return;
        try {
            const res = await api.post(`/pharmacy/prescriptions/${rx.id}/finalize`);
            toast.success(`Finalized. Invoice ${res.data.invoice_number} sent to Billing.`);
            setPmPrescriptions((prev) => prev.filter((p) => p.id !== rx.id));
            loadPendingPatients();
            if (pmSelectedPatient) {
                const stillPending = pmPrescriptions.filter((p) => p.id !== rx.id).length;
                if (stillPending === 0) setPmSelectedPatient(null);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to finalize');
        }
    };

    // ---- Dispense state ----
    const [dispenseItems, setDispenseItems] = useState<DispenseItem[]>([
        { medicine_id: '', quantity: '' },
    ]);
    const addDispenseRow = () => setDispenseItems([...dispenseItems, { medicine_id: '', quantity: '' }]);
    const updateDispense = (i: number, field: keyof DispenseItem, v: string) => {
        const copy = [...dispenseItems]; copy[i][field] = v; setDispenseItems(copy);
    };
    const removeDispense = (i: number) => setDispenseItems(dispenseItems.filter((_, idx) => idx !== i));

    // medicine_id -> current stock info, so the Dispense tab can show available
    // quantity and validate against it before the pharmacist ever submits.
    const stockByMedicine = useMemo(
        () => Object.fromEntries(stock.map((s) => [s.medicine_id, s])),
        [stock],
    );

    const dispenseHasExceeded = dispenseItems.some((d) => {
        const s = stockByMedicine[d.medicine_id];
        return s && d.quantity !== '' && Number(d.quantity) > s.available_quantity;
    });
    const dispenseHasValidItem = dispenseItems.some((d) => d.medicine_id && d.quantity && Number(d.quantity) > 0);
    const dispenseValid = dispenseHasValidItem && !dispenseHasExceeded;

    const handleDispense = async () => {
        const valid = dispenseItems.filter((d) => d.medicine_id && d.quantity);
        if (valid.length === 0) { toast.error('Add at least one item'); return; }
        if (dispenseHasExceeded) { toast.error('One or more items exceed available stock'); return; }
        try {
            const res = await api.post('/pharmacy/dispense', {
                items: valid.map((d) => ({ medicine_id: Number(d.medicine_id), quantity: Number(d.quantity) })),
            });
            // Summarize what came from which batch
            const summary = res.data.map((r: any) =>
                `${r.dispensed_from.map((b: any) => `${b.quantity} from ${b.batch_number}`).join(', ')}`
            ).join(' | ');
            toast.success('Dispensed: ' + summary);
            setDispenseItems([{ medicine_id: '', quantity: '' }]);
            loadStock();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Dispense failed');
        }
    };

    // ---- GRN state ----
    const [grnSupplier, setGrnSupplier] = useState('');
    const [grnDate, setGrnDate] = useState('');
    const [grnInvoice, setGrnInvoice] = useState('');
    const [batches, setBatches] = useState<BatchLine[]>([
        { medicine_id: '', batch_number: '', expiry_date: '', quantity: '', cost_price: '', selling_price: '' },
    ]);
    const addBatch = () => setBatches([...batches, { medicine_id: '', batch_number: '', expiry_date: '', quantity: '', cost_price: '', selling_price: '' }]);
    const updateBatch = (i: number, field: keyof BatchLine, v: string) => {
        const copy = [...batches]; copy[i][field] = v; setBatches(copy);
    };
    const removeBatch = (i: number) => setBatches(batches.filter((_, idx) => idx !== i));

    const handleGrn = async () => {
        if (!grnSupplier || !grnDate) { toast.error('Supplier and date required'); return; }
        const valid = batches.filter((b) => b.medicine_id && b.batch_number && b.expiry_date && b.quantity);
        if (valid.length === 0) { toast.error('Add at least one batch'); return; }
        try {
            await api.post('/pharmacy/grn', {
                supplier_id: Number(grnSupplier),
                invoice_number: grnInvoice || undefined,
                received_date: grnDate,
                batches: valid.map((b) => ({
                    medicine_id: Number(b.medicine_id),
                    batch_number: b.batch_number,
                    expiry_date: b.expiry_date,
                    quantity: Number(b.quantity),
                    cost_price: Number(b.cost_price || 0),
                    selling_price: Number(b.selling_price || 0),
                })),
            });
            toast.success('Stock received');
            setBatches([{ medicine_id: '', batch_number: '', expiry_date: '', quantity: '', cost_price: '', selling_price: '' }]);
            setGrnSupplier(''); setGrnDate(''); setGrnInvoice('');
            loadStock();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'GRN failed');
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Pharmacy</h1>
            <p className="text-slate-500 mb-6">Stock, receiving, and FEFO dispensing</p>

            <Tabs defaultValue={hasPermission('sale.create') ? 'patient-meds' : 'stock'}>
                <TabsList>
                    {hasPermission('sale.create') && <TabsTrigger value="patient-meds">Patient Medicines</TabsTrigger>}
                    {/* <TabsTrigger value="stock">Stock Levels</TabsTrigger> */}
                    {hasPermission('sale.create') && <TabsTrigger value="dispense">Dispense</TabsTrigger>}
                    {hasPermission('stock.receive') && <TabsTrigger value="manage-medicines">Manage Medicines</TabsTrigger>}
                    {hasPermission('stock.receive') && <TabsTrigger value="attributes">Attributes</TabsTrigger>}
                    {hasPermission('stock.receive') && <TabsTrigger value="receive">Receive (GRN)</TabsTrigger>}
                    {hasPermission('stock.receive') && <TabsTrigger value="suppliers">Manage Suppliers</TabsTrigger>}
                </TabsList>

                {/* PATIENT MEDICINES — in-house prescription fulfillment */}
                {hasPermission('sale.create') && (
                    <TabsContent value="patient-meds">
                        <div className="grid grid-cols-3 gap-6">
                            {/* Patients with pending prescriptions */}
                            <div className="col-span-1">
                                <div className="relative mb-3">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input className="pl-9" placeholder="Search patients..."
                                        value={pmSearch} onChange={(e) => setPmSearch(e.target.value)} />
                                </div>
                                <div className="bg-white rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Pending</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pmLoading ? (
                                                <TableRow><TableCell colSpan={2} className="text-center py-6 text-slate-400">Loading...</TableCell></TableRow>
                                            ) : pmPatients.length === 0 ? (
                                                <TableRow><TableCell colSpan={2} className="text-center py-6 text-slate-400">No pending prescriptions</TableCell></TableRow>
                                            ) : pmPatients.map((p) => (
                                                <TableRow
                                                    key={p.id}
                                                    onClick={() => selectPmPatient(p)}
                                                    className={`cursor-pointer ${pmSelectedPatient?.id === p.id ? 'bg-slate-100' : ''}`}
                                                >
                                                    <TableCell>
                                                        <p className="font-medium">{p.full_name}</p>
                                                        <p className="text-xs text-slate-400">{p.patient_code}</p>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">
                                                            {p.pending_count}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <Pagination
                                        page={pmPage} pageSize={pmPageSize} total={pmTotal}
                                        onPageChange={setPmPage}
                                        onPageSizeChange={(n) => { setPmPageSize(n); setPmPage(1); }}
                                    />
                                </div>
                            </div>

                            {/* Selected patient's prescriptions */}
                            <div className="col-span-2">
                                {!pmSelectedPatient ? (
                                    <Card><CardContent className="py-16 text-center text-slate-400">
                                        <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
                                        Select a patient to view their prescription
                                    </CardContent></Card>
                                ) : pmPrescriptionsLoading ? (
                                    <Card><CardContent className="py-16 text-center text-slate-400">Loading...</CardContent></Card>
                                ) : pmPrescriptions.length === 0 ? (
                                    <Card><CardContent className="py-16 text-center text-slate-400">
                                        Nothing pending for {pmSelectedPatient.full_name}
                                    </CardContent></Card>
                                ) : (
                                    <div className="space-y-4">
                                        {pmPrescriptions.map((rx) => {
                                            const addedCount = rx.prescription_items.filter((i) => i.status === 'ADDED').length;
                                            return (
                                                <Card key={rx.id}>
                                                    <CardContent className="pt-6">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div>
                                                                <h3 className="font-bold">{rx.prescription_code}</h3>
                                                                <p className="text-xs text-slate-500">
                                                                    Dr. {rx.doctors.full_name} · {rx.created_at.slice(0, 10)}
                                                                </p>
                                                            </div>
                                                            <Button size="sm" onClick={() => handleFinalizePrescription(rx)}
                                                                disabled={addedCount === 0}>
                                                                <CheckCircle2 size={14} className="mr-1" />Finalize Prescription
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
                                                                        <TableHead>Qty</TableHead>
                                                                        <TableHead>Status</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {rx.prescription_items.map((item) => (
                                                                        <TableRow key={item.id}>
                                                                            <TableCell className="font-medium">
                                                                                {item.medicine_name}
                                                                                {!item.medicine_id && (
                                                                                    <span className="block text-xs text-amber-600">
                                                                                        Not linked to stock — cannot be dispensed
                                                                                    </span>
                                                                                )}
                                                                            </TableCell>
                                                                            <TableCell>{item.dose ?? '-'}</TableCell>
                                                                            <TableCell>{item.frequency ?? '-'}</TableCell>
                                                                            <TableCell>{item.duration ?? '-'}</TableCell>
                                                                            <TableCell>
                                                                                <Input
                                                                                    type="number" min={1}
                                                                                    className="h-8 w-20"
                                                                                    value={item.quantity ?? ''}
                                                                                    onChange={(e) => handleQuantityChange(rx.id, item.id, e.target.value)}
                                                                                    onBlur={() => handleQuantityBlur(item.id, item.quantity)}
                                                                                />
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <select
                                                                                    className={`border rounded-md h-8 px-2 text-xs ${item.status === 'ADDED' ? 'bg-green-100 text-green-700' :
                                                                                        item.status === 'UNAVAILABLE' ? 'bg-red-100 text-red-700' :
                                                                                            'bg-slate-100 text-slate-700'
                                                                                        }`}
                                                                                    value={item.status}
                                                                                    disabled={!item.medicine_id}
                                                                                    onChange={(e) => handleSetItemStatus(item.id, e.target.value as PrescriptionItem['status'])}
                                                                                >
                                                                                    <option value="PENDING">Pending</option>
                                                                                    <option value="ADDED">Added</option>
                                                                                    <option value="UNAVAILABLE">Unavailable</option>
                                                                                </select>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                )}

                {/* STOCK */}
                {/* <TabsContent value="stock">
                    <div className="bg-white rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Medicine</TableHead>
                                    <TableHead>Available</TableHead>
                                    <TableHead>Reorder Level</TableHead>
                                    <TableHead>Batches</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stock.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No stock</TableCell></TableRow>
                                ) : stock.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize).map((s) => (
                                    <TableRow key={s.medicine_id}>
                                        <TableCell className="font-mono text-sm">{s.medicine_code}</TableCell>
                                        <TableCell className="font-medium">
                                            {s.generic_name}{s.brand_name && <span className="text-slate-400"> ({s.brand_name})</span>}
                                        </TableCell>
                                        <TableCell className="font-bold">{s.available_quantity}</TableCell>
                                        <TableCell>{s.reorder_level}</TableCell>
                                        <TableCell>{s.batch_count}</TableCell>
                                        <TableCell>
                                            {s.low_stock ? (
                                                <span className="flex items-center gap-1 text-xs text-red-600">
                                                    <AlertTriangle size={14} />Low Stock
                                                </span>
                                            ) : (
                                                <span className="text-xs text-green-600">OK</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm" onClick={() => viewBatches(s.medicine_id)}>
                                                <Eye size={14} className="mr-1" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Pagination
                            page={stockPage} pageSize={stockPageSize} total={stock.length}
                            onPageChange={setStockPage}
                            onPageSizeChange={(n) => { setStockPageSize(n); setStockPage(1); }}
                        />
                    </div>
                </TabsContent> */}

                {/* DISPENSE */}
                <TabsContent value="dispense">
                    <Card><CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-slate-700">
                            <Package size={18} /><span className="font-semibold">Dispense Stock</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">
                            Stock is deducted automatically from the batch closest to expiry first (FEFO).
                            Pick each medicine and how much to dispense — available quantity is shown per item.
                        </p>

                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-1/2">Medicine</TableHead>
                                        <TableHead>Available Stock</TableHead>
                                        <TableHead>Quantity to Dispense</TableHead>
                                        <TableHead className="w-10"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dispenseItems.map((item, i) => {
                                        const selected = item.medicine_id ? stockByMedicine[item.medicine_id] : undefined;
                                        const exceeds = !!selected && item.quantity !== '' && Number(item.quantity) > selected.available_quantity;
                                        return (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    <select className="w-full border rounded-md h-9 px-3 text-sm"
                                                        value={item.medicine_id}
                                                        onChange={(e) => updateDispense(i, 'medicine_id', e.target.value)}>
                                                        <option value="">Select medicine</option>
                                                        {medicines.map((m) => (
                                                            <option key={m.id} value={m.id}>{m.medicine_code} — {m.generic_name}</option>
                                                        ))}
                                                    </select>
                                                </TableCell>
                                                <TableCell>
                                                    {!item.medicine_id ? (
                                                        <span className="text-xs text-slate-400">Select a medicine</span>
                                                    ) : !selected ? (
                                                        <span className="text-xs text-slate-400">No stock data</span>
                                                    ) : (
                                                        <span className={`flex items-center gap-1 text-xs font-medium ${selected.low_stock ? 'text-red-600' : 'text-slate-600'}`}>
                                                            {selected.low_stock && <AlertTriangle size={12} />}
                                                            {selected.available_quantity} units
                                                            {selected.low_stock && ' (Low Stock)'}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number" min={1} placeholder="Qty"
                                                        className={exceeds ? 'border-red-400 focus-visible:ring-red-300' : ''}
                                                        value={item.quantity}
                                                        onChange={(e) => updateDispense(i, 'quantity', e.target.value)}
                                                    />
                                                    {exceeds && (
                                                        <p className="text-xs text-red-600 mt-1">
                                                            Exceeds available stock ({selected!.available_quantity})
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="sm" onClick={() => removeDispense(i)}
                                                        disabled={dispenseItems.length === 1}>
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                            <Button variant="outline" size="sm" onClick={addDispenseRow}>
                                <Plus size={14} className="mr-1" />Add Item
                            </Button>
                            <Button size="sm" onClick={handleDispense} disabled={!dispenseValid}>Dispense</Button>
                        </div>
                    </CardContent></Card>
                </TabsContent>

                {/* MANAGE MEDICINES */}
                <TabsContent value="manage-medicines">
                    <div className="flex items-center justify-between mb-3">
                        <div className="relative w-72">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input className="pl-9" placeholder="Search by code, generic or brand name..."
                                value={medicineSearch} onChange={(e) => { setMedicineSearch(e.target.value); setMedicinePage(1); }} />
                        </div>
                        <Button size="sm" onClick={openAddMedicine}>
                            <Plus size={14} className="mr-1" />Add Medicine
                        </Button>
                    </div>

                    <div className="bg-white rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Generic Name</TableHead>
                                    <TableHead>Brand Name</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Strength</TableHead>
                                    <TableHead>Reorder Level</TableHead>
                                    <TableHead>Selling Price</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Stock Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {medicinesLoading ? (
                                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                                ) : filteredMedicineList.length === 0 ? (
                                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">No medicines found</TableCell></TableRow>
                                ) : filteredMedicineList
                                    .slice((medicinePage - 1) * medicinePageSize, medicinePage * medicinePageSize)
                                    .map((m) => {
                                        const s = stockByMedicine[m.id];
                                        return (
                                            <TableRow key={m.id}>
                                                <TableCell className="font-mono text-sm">{m.medicine_code}</TableCell>
                                                <TableCell className="font-medium">{m.generic_name}</TableCell>
                                                <TableCell>{m.brand_name ?? '-'}</TableCell>
                                                <TableCell>{m.medicine_categories?.name ?? '-'}</TableCell>
                                                <TableCell>{m.strength ?? '-'}</TableCell>
                                                <TableCell>{m.reorder_level}</TableCell>
                                                <TableCell>{Number(m.default_selling_price).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    {m.is_active ? (
                                                        <span className="text-xs text-green-600">Active</span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">Inactive</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {!s ? (
                                                        <span className="text-xs text-slate-400">No stock</span>
                                                    ) : s.low_stock ? (
                                                        <span className="flex items-center gap-1 text-xs text-red-600">
                                                            <AlertTriangle size={14} />Low Stock
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-green-600">OK</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" size="sm" onClick={() => viewBatches(m.id)}>
                                                            <Eye size={14} className="mr-1" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => openEditMedicine(m)}>
                                                            <Pencil size={14} className="mr-1" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                            </TableBody>
                        </Table>
                        <Pagination
                            page={medicinePage} pageSize={medicinePageSize} total={filteredMedicineList.length}
                            onPageChange={setMedicinePage}
                            onPageSizeChange={(n) => { setMedicinePageSize(n); setMedicinePage(1); }}
                        />
                    </div>
                </TabsContent>

                {/* ATTRIBUTES — admin-managed dropdown lists used by the medicine form and prescriptions */}
                <TabsContent value="attributes">
                    <p className="text-sm text-slate-500 mb-4 max-w-2xl">
                        Manage the dropdown values used across Pharmacy and Consultation. Retiring a value
                        hides it from new selections without affecting medicines or prescriptions that already use it.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <LookupManager type="strengths" title="Strengths" onChange={loadStrengthUnitOptions} />
                        <LookupManager type="units" title="Units" onChange={loadStrengthUnitOptions} />
                        <LookupManager type="doses" title="Doses" />
                        <LookupManager type="frequencies" title="Frequencies" />
                        <LookupManager type="durations" title="Durations" />
                    </div>
                </TabsContent>

                {/* GRN */}
                <TabsContent value="receive">
                    <Card><CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Supplier *</Label>
                                <select className="w-full border rounded-md h-9 px-3 text-sm"
                                    value={grnSupplier} onChange={(e) => setGrnSupplier(e.target.value)}>
                                    <option value="">Select supplier</option>
                                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Received Date *</Label>
                                <Input type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Supplier Invoice #</Label>
                                <Input value={grnInvoice} onChange={(e) => setGrnInvoice(e.target.value)} />
                            </div>
                        </div>

                        <div>
                            <Label className="mb-2 block">Batches</Label>
                            <div className="grid grid-cols-12 gap-2 mb-1 px-0.5 text-xs font-medium text-slate-500">
                                <span className="col-span-3">Medicine</span>
                                <span className="col-span-2">Batch #</span>
                                <span className="col-span-2">Expiry Date</span>
                                <span className="col-span-1">Qty</span>
                                <span className="col-span-1">Cost Price</span>
                                <span className="col-span-2">Sell Price</span>
                                <span className="col-span-1"></span>
                            </div>
                            {batches.map((b, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                                    <select className="col-span-3 border rounded-md h-9 px-2 text-sm"
                                        value={b.medicine_id} onChange={(e) => updateBatch(i, 'medicine_id', e.target.value)}>
                                        <option value="">Medicine</option>
                                        {medicines.map((m) => <option key={m.id} value={m.id}>{m.generic_name}</option>)}
                                    </select>
                                    <Input className="col-span-2" placeholder="Batch #" value={b.batch_number}
                                        onChange={(e) => updateBatch(i, 'batch_number', e.target.value)} />
                                    <Input className="col-span-2" type="date" value={b.expiry_date}
                                        onChange={(e) => updateBatch(i, 'expiry_date', e.target.value)} />
                                    <Input className="col-span-1" type="number" placeholder="Qty" value={b.quantity}
                                        onChange={(e) => updateBatch(i, 'quantity', e.target.value)} />
                                    <Input className="col-span-1" type="number" placeholder="Cost" value={b.cost_price}
                                        onChange={(e) => updateBatch(i, 'cost_price', e.target.value)} />
                                    <Input className="col-span-2" type="number" placeholder="Sell price" value={b.selling_price}
                                        onChange={(e) => updateBatch(i, 'selling_price', e.target.value)} />
                                    <Button className="col-span-1" variant="ghost" size="sm" onClick={() => removeBatch(i)}>
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={addBatch} className="mt-1">
                                <Plus size={14} className="mr-1" />Add Batch
                            </Button>
                        </div>

                        <Button onClick={handleGrn}>Receive Stock</Button>
                    </CardContent></Card>
                </TabsContent>

                {/* MANAGE SUPPLIERS */}
                <TabsContent value="suppliers">
                    <div className="flex items-center justify-between mb-3">
                        <div className="relative w-72">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input className="pl-9" placeholder="Search by code, name or contact..."
                                value={supplierSearch} onChange={(e) => { setSupplierSearch(e.target.value); setSupplierPage(1); }} />
                        </div>
                        <Button size="sm" onClick={openAddSupplier}>
                            <Plus size={14} className="mr-1" />Add Supplier
                        </Button>
                    </div>

                    <div className="bg-white rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Contact Person</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliersLoading ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                                ) : filteredSupplierList.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No suppliers found</TableCell></TableRow>
                                ) : filteredSupplierList
                                    .slice((supplierPage - 1) * supplierPageSize, supplierPage * supplierPageSize)
                                    .map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-mono text-sm">{s.supplier_code}</TableCell>
                                            <TableCell className="font-medium">{s.name}</TableCell>
                                            <TableCell>{s.contact_person ?? '-'}</TableCell>
                                            <TableCell>{s.phone ?? '-'}</TableCell>
                                            <TableCell>{s.email ?? '-'}</TableCell>
                                            <TableCell>
                                                {s.is_active ? (
                                                    <span className="text-xs text-green-600">Active</span>
                                                ) : (
                                                    <span className="text-xs text-red-600">Inactive</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => openEditSupplier(s)}>
                                                        <Pencil size={14} className="mr-1" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleToggleSupplierActive(s)}>
                                                        {s.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                        <Pagination
                            page={supplierPage} pageSize={supplierPageSize} total={filteredSupplierList.length}
                            onPageChange={setSupplierPage}
                            onPageSizeChange={(n) => { setSupplierPageSize(n); setSupplierPage(1); }}
                        />
                    </div>
                </TabsContent>
            </Tabs>

            {/* View Batches modal */}
            <Dialog open={batchesOpen} onOpenChange={setBatchesOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <div className="flex items-center justify-between pr-8">
                            <DialogTitle>
                                {batchesData
                                    ? `Batches — ${batchesData.medicine.generic_name}${batchesData.medicine.brand_name ? ` (${batchesData.medicine.brand_name})` : ''}`
                                    : 'Batches'}
                            </DialogTitle>
                            {batchesData && hasPermission('stock.receive') && (
                                <Button variant="outline" size="sm" onClick={() => setAddBatchOpen((v) => !v)}>
                                    <Plus size={14} className="mr-1" />Add Batch
                                </Button>
                            )}
                        </div>
                    </DialogHeader>

                    {batchesData && addBatchOpen && (
                        <div className="border rounded-md p-3 bg-slate-50 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Batch # *</Label>
                                    <Input value={addBatchForm.batch_number}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, batch_number: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Expiry Date *</Label>
                                    <Input type="date" value={addBatchForm.expiry_date}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, expiry_date: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Quantity *</Label>
                                    <Input type="number" min={1} value={addBatchForm.quantity}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, quantity: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Supplier</Label>
                                    <select className="w-full border rounded-md h-9 px-3 text-sm"
                                        value={addBatchForm.supplier_id}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, supplier_id: e.target.value })}>
                                        <option value="">None</option>
                                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Cost Price</Label>
                                    <Input type="number" min={0} value={addBatchForm.cost_price}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, cost_price: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Selling Price</Label>
                                    <Input type="number" min={0} value={addBatchForm.selling_price}
                                        onChange={(e) => setAddBatchForm({ ...addBatchForm, selling_price: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setAddBatchOpen(false); setAddBatchForm(emptyAddBatchForm); }}>
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={handleAddBatch} disabled={addBatchSaving}>
                                    Save Batch
                                </Button>
                            </div>
                        </div>
                    )}

                    {batchesLoading ? (
                        <div className="py-10 text-center text-slate-400">Loading...</div>
                    ) : !batchesData ? (
                        <div className="py-10 text-center text-slate-400">No data</div>
                    ) : batchesData.batches.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">No batches for this medicine</div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex gap-3 text-xs">
                                <span className="flex items-center gap-1 text-red-600">
                                    <AlertTriangle size={12} />
                                    {batchesData.batches.filter((b) => b.is_expired).length} expired
                                </span>
                                <span className="flex items-center gap-1 text-amber-600">
                                    <AlertTriangle size={12} />
                                    {batchesData.batches.filter((b) => b.is_low_stock).length} low stock
                                </span>
                            </div>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Batch #</TableHead>
                                            <TableHead>Supplier</TableHead>
                                            <TableHead>Expiry</TableHead>
                                            <TableHead>Available</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {batchesData.batches
                                            .slice((batchesPage - 1) * batchesPageSize, batchesPage * batchesPageSize)
                                            .map((b) => (
                                                <TableRow key={b.id} className={b.is_expired ? 'bg-red-50' : b.is_low_stock ? 'bg-amber-50' : ''}>
                                                    <TableCell className="font-mono text-sm">{b.batch_number}</TableCell>
                                                    <TableCell>{b.supplier_name ?? '-'}</TableCell>
                                                    <TableCell>{b.expiry_date.slice(0, 10)}</TableCell>
                                                    <TableCell className="font-bold">{b.quantity_available}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            {b.is_expired && (
                                                                <span className="flex items-center gap-1 text-xs text-red-600">
                                                                    <AlertTriangle size={12} />Expired
                                                                </span>
                                                            )}
                                                            {b.is_low_stock && (
                                                                <span className="flex items-center gap-1 text-xs text-amber-600">
                                                                    <AlertTriangle size={12} />Low Stock
                                                                </span>
                                                            )}
                                                            {!b.is_expired && !b.is_low_stock && (
                                                                <span className="text-xs text-green-600">OK</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                                <Pagination
                                    page={batchesPage} pageSize={batchesPageSize} total={batchesData.batches.length}
                                    onPageChange={setBatchesPage}
                                    onPageSizeChange={(n) => { setBatchesPageSize(n); setBatchesPage(1); }}
                                />
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Add / Edit Medicine modal */}
            <Dialog open={medicineFormOpen} onOpenChange={setMedicineFormOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{medicineForm.id ? 'Edit Medicine' : 'Add Medicine'}</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Medicine Code *</Label>
                            <Input value={medicineForm.medicine_code}
                                onChange={(e) => setMedicineForm({ ...medicineForm, medicine_code: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Generic Name *</Label>
                            <Input value={medicineForm.generic_name}
                                onChange={(e) => setMedicineForm({ ...medicineForm, generic_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Brand Name</Label>
                            <Input value={medicineForm.brand_name}
                                onChange={(e) => setMedicineForm({ ...medicineForm, brand_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={medicineForm.category_id}
                                onChange={(e) => setMedicineForm({ ...medicineForm, category_id: e.target.value })}>
                                <option value="">Uncategorized</option>
                                {medicineCategories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Strength</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={medicineForm.strength}
                                onChange={(e) => setMedicineForm({ ...medicineForm, strength: e.target.value })}>
                                <option value="">Select strength</option>
                                {strengthOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Unit</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={medicineForm.unit}
                                onChange={(e) => setMedicineForm({ ...medicineForm, unit: e.target.value })}>
                                <option value="">Select unit</option>
                                {unitOptions.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Reorder Level</Label>
                            <Input type="number" min={0} value={medicineForm.reorder_level}
                                onChange={(e) => setMedicineForm({ ...medicineForm, reorder_level: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Default Selling Price</Label>
                            <Input type="number" min={0} value={medicineForm.default_selling_price}
                                onChange={(e) => setMedicineForm({ ...medicineForm, default_selling_price: e.target.value })} />
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                            <input type="checkbox" id="medicine-active" checked={medicineForm.is_active}
                                onChange={(e) => setMedicineForm({ ...medicineForm, is_active: e.target.checked })} />
                            <Label htmlFor="medicine-active">Active</Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMedicineFormOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveMedicine} disabled={medicineSaving}>
                            {medicineForm.id ? 'Save Changes' : 'Add Medicine'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Edit Supplier modal */}
            <Dialog open={supplierFormOpen} onOpenChange={setSupplierFormOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{supplierForm.id ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-2">
                            <Label>Supplier Name *</Label>
                            <Input value={supplierForm.name}
                                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Contact Person</Label>
                            <Input value={supplierForm.contact_person}
                                onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <PhoneInput value={supplierForm.phone}
                                onChange={(v) => setSupplierForm({ ...supplierForm, phone: v })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={supplierForm.email}
                                onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Input value={supplierForm.address}
                                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSupplierFormOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveSupplier} disabled={supplierSaving}>
                            {supplierForm.id ? 'Save Changes' : 'Add Supplier'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ============================================================
// Generic manager for one admin-managed dropdown list (strengths, units,
// doses, frequencies, durations) — same {id, name, is_active} shape and
// /lookups/:type API for all five, so one component covers every card.
// ============================================================

function LookupManager({ type, title, onChange }: { type: string; title: string; onChange?: () => void }) {
    const confirm = useConfirm();
    const [items, setItems] = useState<LookupOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/lookups/${type}`, { params: { include_inactive: 'true' } });
            setItems(res.data);
        } catch {
            toast.error(`Failed to load ${title.toLowerCase()}`);
        } finally {
            setLoading(false);
        }
    }, [type, title]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            await api.post(`/lookups/${type}`, { name: newName.trim() });
            setNewName('');
            load();
            onChange?.();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to add');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (item: LookupOption) => {
        const activating = !item.is_active;
        if (!activating && !(await confirm(`Retire "${item.name}"? It will no longer appear as an option, but existing records keep it.`, { variant: 'destructive', confirmText: 'Retire' }))) return;
        try {
            await api.patch(`/lookups/${type}/${item.id}`, { is_active: activating });
            load();
            onChange?.();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update');
        }
    };

    return (
        <div className="bg-white rounded-md border p-4">
            <div className="flex items-center gap-2 mb-3">
                <ListChecks size={16} className="text-slate-500" />
                <h3 className="font-semibold text-slate-800">{title}</h3>
            </div>

            <div className="flex gap-2 mb-3">
                <Input className="h-8 text-sm" placeholder={`Add ${title.toLowerCase().slice(0, -1) || title}...`}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
                <Button size="sm" onClick={handleAdd} disabled={saving || !newName.trim()}>
                    <Plus size={14} />
                </Button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1">
                {loading ? (
                    <p className="text-xs text-slate-400 text-center py-4">Loading...</p>
                ) : items.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No values yet</p>
                ) : items.map((item) => (
                    <div key={item.id} className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${item.is_active ? '' : 'opacity-50'}`}>
                        <span className="truncate">{item.name}</span>
                        <Button variant="ghost" size="icon-sm" title={item.is_active ? 'Retire' : 'Restore'}
                            onClick={() => handleToggle(item)}>
                            {item.is_active ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}