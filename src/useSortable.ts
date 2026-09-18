import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Pointer-driven drag-to-reorder for a list of rows.
 *
 * Replaces native HTML5 drag-and-drop (clunky ghost image, tooltips stuck
 * on screen, a hairline "drop here" marker). Instead the grabbed row
 * follows the pointer and the rows it passes over nudge out of the way,
 * so the list always shows exactly where the row will land. Releasing
 * settles the row into its slot, then commits the reorder.
 *
 * Usage:
 *   const sort = useSortable(items.length, (from, to) => onReorder(from, to));
 *   rows:   const r = sort.rowProps(i);  <div ref={r.ref} className={`row ${r.className}`} style={r.style}>
 *   handle: <DragHandle {...sort.handleProps(i)} />
 */

interface DragState {
  from: number;
  to: number;
  dy: number;
  pitch: number; // distance from one row's top to the next - row height plus gap
  settling: boolean;
}

const SETTLE_MS = 140;

export function useSortable(count: number, onReorder: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const reorderRef = useRef(onReorder);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { reorderRef.current = onReorder; });
  useEffect(() => () => cleanupRef.current?.(), []);

  const start = (i: number, e: ReactPointerEvent) => {
    if (e.button !== 0 || cleanupRef.current) return;
    const els = rows.current.slice(0, count);
    if (els.length < count || els.some((el) => !el)) return;
    e.preventDefault();

    // Measure once, in document coordinates, so scrolling mid-drag just works.
    const scroll0 = window.scrollY;
    const rects = els.map((el) => el!.getBoundingClientRect());
    const centers = rects.map((r) => r.top + scroll0 + r.height / 2);
    const startY = e.clientY + scroll0;
    const pitch = i < count - 1 ? rects[i + 1].top - rects[i].top : i > 0 ? rects[i].top - rects[i - 1].top : 0;

    let clientY = e.clientY;
    let to = i;
    let frame = 0;
    let scrollFrame = 0;
    let settleTimer = 0;
    let finished = false;

    document.body.classList.add("is-dragging");
    setDrag({ from: i, to: i, dy: 0, pitch, settling: false });

    const update = () => {
      frame = 0;
      const dy = clientY + window.scrollY - startY;
      const center = centers[i] + dy;
      let t = 0;
      for (let k = 0; k < count; k++) if (k !== i && centers[k] < center) t++;
      to = t;
      setDrag({ from: i, to, dy, pitch, settling: false });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

    // Scroll the page when the pointer nears the top/bottom edge.
    const autoscroll = () => {
      const margin = 56;
      let d = 0;
      if (clientY < margin) d = -Math.ceil((margin - clientY) / 5);
      else if (clientY > window.innerHeight - margin) d = Math.ceil((clientY - (window.innerHeight - margin)) / 5);
      if (d) { window.scrollBy(0, d); schedule(); }
      scrollFrame = requestAnimationFrame(autoscroll);
    };
    scrollFrame = requestAnimationFrame(autoscroll);

    const onMove = (ev: PointerEvent) => { clientY = ev.clientY; schedule(); };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") finish(false); };

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
    const teardown = () => {
      detach();
      window.clearTimeout(settleTimer);
      document.body.classList.remove("is-dragging");
      cleanupRef.current = null;
    };

    function finish(commit: boolean) {
      if (finished) return;
      finished = true;
      detach();
      const target = commit ? to : i;
      // Glide the grabbed row into its slot, then commit the reorder.
      setDrag({ from: i, to: target, dy: centers[target] - centers[i], pitch, settling: true });
      settleTimer = window.setTimeout(() => {
        teardown();
        setDrag(null);
        if (commit && target !== i) reorderRef.current(i, target);
      }, SETTLE_MS);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    cleanupRef.current = teardown;
  };

  const rowProps = (i: number): { ref: (el: HTMLElement | null) => void; className: string; style?: CSSProperties } => {
    const ref = (el: HTMLElement | null) => { rows.current[i] = el; };
    if (!drag) return { ref, className: "" };
    if (i === drag.from) {
      return {
        ref,
        className: `sort-dragging${drag.settling ? " sort-settling" : ""}`,
        style: { transform: `translateY(${drag.dy}px)` },
      };
    }
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.pitch;
    else if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = drag.pitch;
    return { ref, className: "sort-nudge", style: shift ? { transform: `translateY(${shift}px)` } : undefined };
  };

  const handleProps = (i: number) => ({ onPointerDown: (e: ReactPointerEvent) => start(i, e) });

  return { rowProps, handleProps };
}
