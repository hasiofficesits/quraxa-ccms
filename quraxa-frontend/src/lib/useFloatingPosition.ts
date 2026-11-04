import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export interface FloatingPosition {
    top: number;
    left: number;
    width: number;
}

// Tracks a trigger element's on-screen position while `open`, so a portaled
// dropdown can be placed with `position: fixed` — escaping any ancestor's
// `overflow: hidden/auto` (e.g. a scrollable Dialog) instead of being
// clipped by it. Recomputes on scroll (capture phase, so it also catches
// scrolling inside the dialog itself) and on resize.
export function useFloatingPosition(triggerRef: RefObject<HTMLElement | null>, open: boolean): FloatingPosition | null {
    const [pos, setPos] = useState<FloatingPosition | null>(null);

    useEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const update = () => {
            const el = triggerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, triggerRef]);

    return pos;
}
