import { useState } from "react";

export default function HelpButton({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-wrap">
      <button className="help-btn" data-tip="Help" onClick={() => setOpen((o) => !o)}>?</button>
      {open && (
        <div className="help-backdrop" onClick={() => setOpen(false)}>
          <div className="help-panel" onClick={(e) => e.stopPropagation()}>
            <div className="help-panel-title">{title}</div>
            <ul>
              {lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <button className="btn text" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
