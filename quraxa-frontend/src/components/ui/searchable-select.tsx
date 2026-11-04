import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFloatingPosition } from '@/lib/useFloatingPosition';

interface Option {
    value: string;
    label: string;
    sublabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    className?: string;
}

// Lightweight combobox: a button that opens a search box + filtered list.
// Used wherever a plain <select> would get unwieldy with many options
// (e.g. picking a doctor from a long list). The panel is portaled to
// <body> and positioned with `fixed` coordinates so it isn't clipped when
// this sits inside a scrollable container (e.g. a Dialog).
export function SearchableSelect({
    options, value, onChange, placeholder = 'Select...',
    searchPlaceholder = 'Search...', emptyText = 'No results', className,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pos = useFloatingPosition(triggerRef, open);

    const selected = options.find((o) => o.value === value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
        );
    }, [options, query]);

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

    return (
        <div className={cn('relative', className)}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <span className={selected ? '' : 'text-muted-foreground'}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
            </button>

            {open && pos && createPortal(
                <div
                    ref={panelRef}
                    className="fixed z-50 rounded-md border bg-white shadow-md"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}
                >
                    <div className="relative border-b p-1.5">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="h-7 w-full rounded bg-transparent pl-6 pr-2 text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                        {filtered.length === 0 ? (
                            <p className="px-2 py-3 text-center text-sm text-slate-400">{emptyText}</p>
                        ) : (
                            filtered.map((o) => (
                                <button
                                    type="button"
                                    key={o.value}
                                    onClick={() => { onChange(o.value); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                                        o.value === value && 'bg-slate-100 font-medium',
                                    )}
                                >
                                    <span className="truncate">
                                        {o.label}
                                        {o.sublabel && <span className="ml-1.5 text-xs text-slate-400">{o.sublabel}</span>}
                                    </span>
                                    {o.value === value && <Check size={14} className="shrink-0" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
