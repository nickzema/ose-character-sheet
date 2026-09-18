import { useEffect, useState } from "react";

export interface TourStep {
  selector: string;
  text: string;
}

/** Tracks the live bounding rect of the DOM element matching `selector`,
 *  re-measuring on resize/scroll and on a short interval (cheap - only
 *  runs while a tour step is open) so it stays correct even if an
 *  accordion or other layout shift moves the target after the step opens. */
function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    const id = window.setInterval(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector]);

  return rect;
}

export default function HelpButton({ title, steps }: { title: string; steps: TourStep[] }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const close = () => { setOpen(false); setI(0); };

  const step = open ? steps[i] : null;
  const rect = useTargetRect(step?.selector ?? null);

  // Scroll the target into view each time the step changes, so a highlight
  // further down the sheet is actually visible when its step opens.
  useEffect(() => {
    if (!step) return;
    document.querySelector(step.selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [i, open, step]);

  if (!open) {
    return <button className="help-btn" data-tip={title} onClick={() => setOpen(true)}>?</button>;
  }
  if (!step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const calloutWidth = 250;
  const placeBelow = !rect || vh - rect.bottom > 150;
  const left = rect
    ? Math.min(Math.max(rect.left - 20, 10), vw - calloutWidth - 10)
    : Math.max((vw - calloutWidth) / 2, 10);
  const top = rect && placeBelow ? rect.bottom + 14 : undefined;
  const bottom = rect && !placeBelow ? vh - rect.top + 14 : undefined;
  const centerY = !rect ? vh / 2 - 70 : undefined;
  const arrowLeft = rect ? Math.min(Math.max(rect.left + rect.width / 2 - left, 18), calloutWidth - 18) : calloutWidth / 2;

  return (
    <div className="tour-overlay" onClick={close}>
      {rect && (
        <div
          className="tour-highlight"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        className="tour-callout"
        style={{ top: top ?? centerY, bottom, left, width: calloutWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {rect && <div className={`tour-arrow ${placeBelow ? "up" : "down"}`} style={{ left: arrowLeft }} />}
        <button className="tour-skip" onClick={close}>&times;</button>
        <p>{step.text}</p>
        <div className="tour-actions">
          <span className="tour-progress">{i + 1} / {steps.length}</span>
          <div className="tour-buttons">
            {i > 0 && <button className="btn text" onClick={() => setI((n) => n - 1)}>Back</button>}
            {i < steps.length - 1 ? (
              <button className="btn" onClick={() => setI((n) => n + 1)}>Next</button>
            ) : (
              <button className="btn" onClick={close}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
