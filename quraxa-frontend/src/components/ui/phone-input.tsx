import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFloatingPosition } from '@/lib/useFloatingPosition';
import { COUNTRIES, flagEmoji, parsePhone, combinePhone } from '@/lib/countries';

interface PhoneInputProps {
    value: string;
    onChange: (fullNumber: string) => void;
    className?: string;
    placeholder?: string;
}

// Country-code dropdown (flag + dial code, searchable) glued to a plain
// number field. Emits/accepts one combined string ("+94771234567") so it
// drops straight into any existing `phone: string` field — no schema or
// payload changes needed anywhere it's used. The country panel is portaled
// to <body> and positioned with `fixed` coordinates so it isn't clipped
// when this sits inside a scrollable container (e.g. a Dialog).
export function PhoneInput({ value, onChange, className, placeholder }: PhoneInputProps) {
    const parsed = parsePhone(value);
    const [iso2, setIso2] = useState(parsed.iso2);
    const [local, setLocal] = useState(parsed.local);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pos = useFloatingPosition(triggerRef, open);

    // Re-sync from the parent when it hands us a different stored value
    // (e.g. switching from "Add" to "Edit" on the same mounted form).
    useEffect(() => {
        const next = parsePhone(value);
        setIso2(next.iso2);
        setLocal(next.local);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    useEffect(() => {
        if (open) {
            setQuery('');
            requestAnimationFrame(() => searchRef.current?.focus());
        }
    }, [open]);

    const selected = COUNTRIES.find((c) => c.iso2 === iso2);
    const filtered = COUNTRIES.filter((c) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso2.toLowerCase().includes(q);
    });

    const pickCountry = (nextIso2: string) => {
        setIso2(nextIso2);
        setOpen(false);
        onChange(combinePhone(nextIso2, local));
    };

    const handleLocalChange = (raw: string) => {
        setLocal(raw);
        onChange(combinePhone(iso2, raw));
    };

    return (
        <div className={cn('flex gap-1.5', className)}>
            <div className="relative shrink-0">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex h-9 items-center gap-1 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    <span>{flagEmoji(iso2)}</span>
                    <span className="text-muted-foreground">{selected?.dial ?? ''}</span>
                    <ChevronsUpDown size={12} className="shrink-0 opacity-50" />
                </button>

                {open && pos && createPortal(
                    <div
                        ref={panelRef}
                        className="fixed z-50 w-64 rounded-md border bg-white shadow-md"
                        style={{ top: pos.top, left: pos.left }}
                    >
                        <div className="relative border-b p-1.5">
                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search country or code..."
                                className="h-7 w-full rounded bg-transparent pl-6 pr-2 text-sm outline-none placeholder:text-muted-foreground"
                            />
                        </div>
                        <div className="max-h-56 overflow-y-auto p-1">
                            {filtered.length === 0 ? (
                                <p className="px-2 py-3 text-center text-sm text-slate-400">No results</p>
                            ) : (
                                filtered.map((c) => (
                                    <button
                                        type="button"
                                        key={c.iso2}
                                        onClick={() => pickCountry(c.iso2)}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                                            c.iso2 === iso2 && 'bg-slate-100 font-medium',
                                        )}
                                    >
                                        <span>{flagEmoji(c.iso2)}</span>
                                        <span className="flex-1 truncate">{c.name}</span>
                                        <span className="shrink-0 text-xs text-slate-400">{c.dial}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
            </div>
            <Input
                type="tel"
                inputMode="numeric"
                className="flex-1"
                value={local}
                placeholder={placeholder ?? 'e.g. 771234567'}
                onChange={(e) => handleLocalChange(e.target.value)}
            />
        </div>
    );
}
