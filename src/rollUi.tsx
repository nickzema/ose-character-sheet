import { useEffect, useState } from "react";
import { rollNotation } from "./dice";
import { fmtMod } from "./abilities";

export interface RollState {
  label: string;
  outcome: "success" | "fail" | "neutral";
  rolled?: number;
  target?: number;
  detail?: string; // used for plain text states like "Rolling...", "Cannot be turned", "Auto-Turn!"
  parts?: { label: string; total: number; dice: number[] }[]; // clean multi-row display (weapon attack+damage)
  fallbackNote?: string;
}

export type ModalState =
  | { type: "confirm"; message: string; yesLabel?: string; noLabel?: string; resolve: (v: boolean) => void }
  | { type: "prompt"; message: string; defaultValue: string; resolve: (v: number | null) => void }
  | { type: "choice"; message: string; options: string[]; resolve: (v: string | null) => void }
  | { type: "player"; message: string; players: { id: string; name: string; gm: boolean }[]; resolve: (v: string | null) => void };

export function RollBanner({ roll, onDismiss }: { roll: RollState | null; onDismiss: () => void }) {
  if (!roll) return null;
  const showOutcome = roll.rolled !== undefined && roll.outcome !== "neutral";
  return (
    <div className={`roll-banner ${roll.outcome}`}>
      <button className="roll-dismiss" onClick={onDismiss} data-tip="Dismiss">&times;</button>
      <div className="roll-label">{roll.label}</div>
      {roll.parts ? (
        <div className="roll-parts">
          {roll.parts.map((p, i) => (
            <div className="roll-part" key={i}>
              <span className="roll-part-label">{p.label}</span>
              <span className="roll-part-total">{p.total}</span>
              {p.dice.length > 0 && <span className="roll-part-dice">[{p.dice.join(", ")}]</span>}
            </div>
          ))}
        </div>
      ) : roll.rolled !== undefined ? (
        <div className="roll-numbers">
          {roll.rolled}
          {roll.target !== undefined && <><span className="vs">vs</span>{roll.target}</>}
        </div>
      ) : (
        <div className="roll-detail-text">{roll.detail}</div>
      )}
      {showOutcome && (
        <div className={`roll-outcome ${roll.outcome}`}>
          {roll.outcome === "success" ? <>&#10003; SUCCESS</> : <>&#10007; FAIL</>}
        </div>
      )}
      {roll.fallbackNote && <div className="roll-fallback-note">{roll.fallbackNote}</div>}
    </div>
  );
}

export function AppModal({ state }: { state: ModalState }) {
  const [inputVal, setInputVal] = useState(state.type === "prompt" ? state.defaultValue : "");

  return (
    <div className="modal-backdrop" onClick={() => state.type === "confirm" ? state.resolve(false) : state.type === "prompt" ? state.resolve(null) : state.resolve(null)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="modal-message">{state.message}</p>
        {state.type === "prompt" && (
          <input
            type="number"
            className="modal-input"
            value={inputVal}
            autoFocus
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") state.resolve(parseInt(inputVal, 10) || 0); }}
          />
        )}
        <div className="modal-actions">
          {state.type === "confirm" ? (
            <>
              <button className="btn modal-btn" onClick={() => state.resolve(true)}>{state.yesLabel || "Yes"}</button>
              <button className="btn text modal-btn" onClick={() => state.resolve(false)}>{state.noLabel || "No"}</button>
            </>
          ) : state.type === "prompt" ? (
            <>
              <button className="btn modal-btn" onClick={() => state.resolve(parseInt(inputVal, 10) || 0)}>Roll</button>
              <button className="btn text modal-btn" onClick={() => state.resolve(null)}>Cancel</button>
            </>
          ) : state.type === "player" ? (
            <div className="player-pick">
              {state.players.map((p) => (
                <button key={p.id} className="btn modal-btn" onClick={() => state.resolve(p.id)}>{p.name || "Player"}{p.gm ? " (GM)" : ""}</button>
              ))}
              <button className="btn text modal-btn" onClick={() => state.resolve(null)}>Cancel</button>
            </div>
          ) : (
            <>
              {state.options.map((opt) => (
                <button key={opt} className="btn modal-btn" onClick={() => state.resolve(opt)}>{opt}</button>
              ))}
              <button className="btn text modal-btn" onClick={() => state.resolve(null)}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const fallbackNoteFor = (reason?: "not-detected" | "timeout") => {
  if (!reason) return undefined;
  return reason === "timeout"
    ? "Dice+ didn't respond in time \u2014 this is a local roll, not Dice+'s result."
    : "Dice+ not detected in this room \u2014 local roll.";
};

/** Roll banner + modal plumbing shared by anything that rolls through Dice+. */
export function useRoller() {
  const [roll, setRoll] = useState<RollState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    if (!roll || roll.detail === "Rolling...") return;
    const timer = setTimeout(() => setRoll(null), 6000);
    return () => clearTimeout(timer);
  }, [roll]);

  const askYesNo = (message: string, yesLabel?: string, noLabel?: string) =>
    new Promise<boolean>((resolve) => {
      setModal({ type: "confirm", message, yesLabel, noLabel, resolve: (v) => { setModal(null); resolve(v); } });
    });

  const rollAndShow = async (
    label: string,
    notation: string,
    interpret: (total: number) => { outcome: RollState["outcome"]; rolled?: number; target?: number; detail?: string }
  ) => {
    setRoll({ label, detail: "Rolling...", outcome: "neutral" });
    const { total, usedFallback, fallbackReason } = await rollNotation(notation);
    setRoll({ label, ...interpret(total), fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined });
    return total;
  };

  return { roll, setRoll, modal, setModal, askYesNo, rollAndShow };
}

export { fmtMod };
