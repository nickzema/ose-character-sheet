import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Character } from "./types";
import type { Retainer } from "./retainerTypes";
import type { ClassKey } from "./classData";
import { POSTIT_SWATCHES } from "./retainerTypes";
import { abilityMod, fmtMod } from "./abilities";
import { hdOf, maxLevelOf } from "./classData";
import { applyLevel } from "./retainerGen";
import { rollWeapon, termString } from "./dice";
import { RollBanner, AppModal, fallbackNoteFor, useRoller } from "./rollUi";

interface Props {
  retainers: Retainer[];
  characters: Character[];
  playerId: string;
  isGM: boolean;
  onSave: (r: Retainer) => void;
  onSaveMany: (rs: Retainer[]) => void;
  onDelete: (id: string) => void;
  onGenerate: () => void;
}

const CARD_H = 340;
const TOP_PAD = 40; // room above the row for the selected card's bump up
const ROW_GAP = 8;
const STRIP = 120; // visible width of a covered card

const SAVE_LABELS: { key: keyof Retainer["saves"]; chip: string; name: string; alwaysMagic: boolean; askMagic: boolean }[] = [
  { key: "death", chip: "D", name: "Death", alwaysMagic: false, askMagic: true },
  { key: "wands", chip: "W", name: "Wands", alwaysMagic: true, askMagic: false },
  { key: "paralysis", chip: "P", name: "Paralysis", alwaysMagic: false, askMagic: true },
  { key: "breath", chip: "B", name: "Breath", alwaysMagic: false, askMagic: true },
  { key: "spells", chip: "S", name: "Spells", alwaysMagic: true, askMagic: false },
];

const labelFor = (r: Retainer) => (r.classKey === "Normal Human" ? "Normal Human" : `Level ${r.level} ${r.classKey}`);

export default function RetainerStack({ retainers, characters, playerId, isGM, onSave, onSaveMany, onDelete, onGenerate }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [sel, setSel] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [colorOpen, setColorOpen] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tipTimer = useRef<number | null>(null);
  const tipFor = useRef<string | null>(null);
  const { roll, setRoll, modal, askYesNo, rollAndShow } = useRoller();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 700);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ownerOf = (r: Retainer) => characters.find((c) => c.id === r.ownerCharacterId) ?? null;
  const mine = (r: Retainer) => ownerOf(r)?.ownerId === playerId;

  // ---- visible list (with live reorder while dragging) -------------------
  const [dragView, setDragView] = useState<{ id: string; px: number; py: number; ox: number; oy: number; order: string[] } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; ox: number; oy: number; on: boolean; order: string[] } | null>(null);
  const suppressClick = useRef(false);

  const base = retainers.filter((r) => (isGM || !r.hidden) && (isGM || !onlyMine || mine(r)));
  const visible = dragView
    ? dragView.order.map((id) => base.find((r) => r.id === id)).filter((r): r is Retainer => !!r)
    : base;

  const cw = Math.min(width, 340);
  const per = Math.max(1, Math.floor((width - cw) / STRIP) + 1);
  const rowH = TOP_PAD + CARD_H + ROW_GAP;
  const stepFor = (n: number) => (n > 1 ? Math.min(STRIP + 8, (width - cw) / (n - 1)) : 0);

  useEffect(() => {
    if (sel && !visible.some((r) => r.id === sel)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((r) => r.id).join(",")]);

  // ---- drag to reorder (GM) ---------------------------------------------
  const onPointerDown = (e: React.PointerEvent, r: Retainer) => {
    if (!isGM || e.button !== 0 || (e.target as HTMLElement).closest("select")) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { id: r.id, x0: e.clientX, y0: e.clientY, ox: e.clientX - rect.left, oy: e.clientY - rect.top, on: false, order: base.map((x) => x.id) };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
        d.on = true;
        setSel(d.id);
        document.body.style.userSelect = "none";
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.getSelection()?.removeAllRanges();
      }
      const box = wrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const n = d.order.length;
      const rows = Math.ceil(n / per);
      const ri = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - box.top) / rowH)));
      const rowLen = Math.min(per, n - ri * per);
      const step = stepFor(rowLen);
      const left = e.clientX - d.ox - box.left;
      const i = step ? Math.max(0, Math.min(rowLen - 1, Math.round(left / step))) : 0;
      const target = Math.min(n - 1, ri * per + i);
      const from = d.order.indexOf(d.id);
      if (target !== from) {
        const next = [...d.order];
        next.splice(from, 1);
        next.splice(target, 0, d.id);
        d.order = next;
      }
      setDragView({ id: d.id, px: e.clientX, py: e.clientY, ox: d.ox, oy: d.oy, order: d.order });
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      if (!d || !d.on) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const changed: Retainer[] = [];
      d.order.forEach((id, i) => {
        const r = retainers.find((x) => x.id === id);
        if (r && r.order !== i) changed.push({ ...r, order: i });
      });
      if (changed.length) onSaveMany(changed);
      setDragView(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retainers, per, width]);

  // ---- tooltip on a card whose Level/Class line is covered ---------------
  const labelCovered = (el: HTMLElement) => {
    const lab = el.querySelector(".rt-lvcls");
    if (!lab) return false;
    const rg = document.createRange();
    rg.selectNodeContents(lab);
    const L = rg.getBoundingClientRect();
    const y = L.top + L.height / 2;
    return [L.left + 2, (L.left + L.right) / 2, L.right - 3].some((x) => {
      const hit = document.elementFromPoint(x, y)?.closest(".rt-card");
      return hit !== el;
    });
  };
  const clearTip = () => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    tipFor.current = null;
    setTip(null);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest(".rt-card") as HTMLElement | null;
    if (!el || dragRef.current?.on || !labelCovered(el)) { clearTip(); return; }
    const id = el.dataset.id!;
    if (tip && tipFor.current === id) { setTip({ ...tip, x: e.clientX + 12, y: e.clientY - 30 }); return; }
    if (tip) setTip(null);
    if (tipFor.current === id) return;
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipFor.current = id;
    const x = e.clientX, y = e.clientY;
    tipTimer.current = window.setTimeout(() => {
      const r = retainers.find((q) => q.id === id);
      if (r) setTip({ text: `${labelFor(r)} · ${r.name || "Unnamed"}`, x: x + 12, y: y - 30 });
    }, 700);
  };

  // Scrollbars on the item/spell columns only show while actually scrolling.
  const onScrollShow = (e: React.UIEvent) => {
    const el = e.target as HTMLElement;
    if (!el.classList?.contains("rt-col")) return;
    el.classList.add("scrolling");
    const w = el as HTMLElement & { _t?: number };
    if (w._t) window.clearTimeout(w._t);
    w._t = window.setTimeout(() => el.classList.remove("scrolling"), 700);
  };

  // ---- rolls -------------------------------------------------------------
  const who = (r: Retainer) => r.name || labelFor(r);
  const rollAttack = async (r: Retainer, w: Retainer["weapons"][number]) => {
    const label = `${who(r)} — ${w.name || "Weapon"}`;
    setRoll({ label, detail: "Rolling...", outcome: "neutral" });
    const hit = abilityMod(w.ranged ? r.abilities.dex : r.abilities.str);
    const dmg = w.ranged ? 0 : abilityMod(r.abilities.str);
    const magic = parseInt(w.bonus, 10) || 0;
    const { parts, usedFallback, fallbackReason } = await rollWeapon(w.name, w.damage || "1d6", r.attackBonus, hit, dmg, magic);
    setRoll({ label, parts, outcome: "neutral", fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined });
  };
  const rollSave = async (r: Retainer, s: (typeof SAVE_LABELS)[number]) => {
    const wis = abilityMod(r.abilities.wis);
    let vsMagic = s.alwaysMagic;
    if (s.askMagic) vsMagic = await askYesNo(`Add WIS modifier to Saves vs. Magic? (${fmtMod(wis)})`);
    const notation = `1d20${vsMagic ? termString([wis]) : ""}`;
    const target = r.saves[s.key];
    await rollAndShow(`${who(r)} — ${s.name} Save`, notation, (t) => ({ rolled: t, target, outcome: t >= target ? "success" : "fail" }));
  };
  const rollAbility = (r: Retainer, k: keyof Retainer["abilities"]) =>
    rollAndShow(`${who(r)} — ${k.toUpperCase()} Check`, "1d20", (t) => ({
      rolled: t, target: r.abilities[k], outcome: t <= r.abilities[k] ? "success" : "fail",
    }));
  // GM: clicking Hit Points rerolls max HP (current resets to the new max).
  const rerollHp = async (r: Retainer) => {
    const con = abilityMod(r.abilities.con);
    const n = r.classKey === "Normal Human" ? 1 : Math.max(1, r.level);
    const die = r.classKey === "Normal Human" ? 4 : hdOf(r.classKey);
    const total = await rollAndShow(`${who(r)} — Max HP`, `${n}d${die}${termString([con * n])}`, (t) => ({ rolled: t, outcome: "neutral" }));
    const hp = Math.max(1, total);
    onSave({ ...r, hpMax: hp, hpCurrent: hp });
  };

  // ---- edits ---------------------------------------------------------------
  const setOwner = (r: Retainer, id: string) => {
    const owner = characters.find((c) => c.id === id);
    onSave({ ...r, ownerCharacterId: id, color: owner ? owner.color : r.color });
  };
  const unassigned = retainers.filter((r) => !ownerOf(r));
  const deleteUnassigned = () => {
    if (!unassigned.length) return;
    if (window.confirm(`Delete ${unassigned.length} unassigned retainer${unassigned.length === 1 ? "" : "s"}?`)) unassigned.forEach((r) => onDelete(r.id));
  };
  const ownerChoices = characters.filter((c) => !c.inactive && (isGM || !c.hidden));

  const num = (v: string) => Number(v.replace(/[^\d-]/g, "")) || 0;

  const renderCard = (r: Retainer, idxInRow: number, left: number, rowOffset: number, rot: number) => {
    const canGM = isGM;
    const canPlay = isGM || mine(r);
    const selected = sel === r.id;
    const dragging = dragView?.id === r.id;
    const style: React.CSSProperties = { left, top: TOP_PAD, backgroundColor: r.color, zIndex: dragging ? 200 : selected ? 100 : idxInRow + 1 };
    if (dragView && dragging) {
      const box = wrapRef.current?.getBoundingClientRect();
      if (box) {
        (style as Record<string, string | number>)["--dx"] = `${dragView.px - dragView.ox - (box.left + left)}px`;
        (style as Record<string, string | number>)["--dy"] = `${dragView.py - dragView.oy - (box.top + rowOffset + TOP_PAD)}px`;
      }
    } else {
      style.transform = `rotate(${rot}deg)`;
    }
    const setW = (i: number, patch: Partial<Retainer["weapons"][number]>) =>
      onSave({ ...r, weapons: r.weapons.map((w, k) => (k === i ? { ...w, ...patch } : w)) });
    const swatches: [string, string][] = [...POSTIT_SWATCHES];
    const owner = ownerOf(r);
    if (owner && owner.color.toLowerCase() !== "#fcfbf8") swatches.push([owner.color, `${owner.name || "Owner"}'s sheet`]);

    return (
      <div
        key={r.id}
        data-id={r.id}
        className={`rt-card${selected ? " sel" : ""}${dragging ? " drag" : ""}${r.hidden ? " hid" : ""}${isGM ? " can-drag" : ""}`}
        style={style}
        onPointerDown={(e) => onPointerDown(e, r)}
        onClick={() => { if (suppressClick.current) return; setSel(r.id); }}
      >
        <div className="rt-top">
          <div className="rt-title">
            <div className="rt-lvcls">
              {r.classKey === "Normal Human" ? "Normal Human" : (
                <>
                  Level{" "}
                  <input className="rt-lv" value={r.level} disabled={!canGM} inputMode="numeric"
                    onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); if (n >= 1) onSave(applyLevel(r, Math.min(n, maxLevelOf(r.classKey as ClassKey)))); }} />{" "}
                  {r.classKey}
                </>
              )}
            </div>
            <input className="rt-in rt-name" value={r.name} placeholder="Name" disabled={!canGM} onChange={(e) => onSave({ ...r, name: e.target.value })} />
          </div>
          <select className="rt-owner" value={r.ownerCharacterId} disabled={!canGM} onChange={(e) => setOwner(r, e.target.value)}>
            <option value="">Unassigned</option>
            {ownerChoices.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed"}</option>)}
            {r.ownerCharacterId && !ownerChoices.some((c) => c.id === r.ownerCharacterId) && ownerOf(r) && (
              <option value={r.ownerCharacterId}>{ownerOf(r)!.name || "Unnamed"}</option>
            )}
          </select>
        </div>

        <div className="rt-stats">
          <span><span className="rt-lbl">AC</span> <span className="rt-val">{r.ac}</span> <span className="rt-lbl rt-dim">[{19 - r.ac}]</span></span>
          <span className="rt-hp">
            <button className="rt-roll rt-lbl" disabled={!canGM} onClick={() => rerollHp(r)} data-tip={canGM ? "Reroll max HP" : undefined}>HP</button>{" "}
            <span className="rt-val">
              <input value={r.hpCurrent} disabled={!canPlay} onChange={(e) => onSave({ ...r, hpCurrent: num(e.target.value) })} />
              /
              <input className="rt-max" value={r.hpMax} disabled={!canGM} onChange={(e) => onSave({ ...r, hpMax: num(e.target.value) })} />
            </span>
          </span>
          <span><span className="rt-lbl">AB</span> <span className="rt-val">{fmtMod(r.attackBonus)}</span></span>
          <span><span className="rt-lbl">MV</span> <span className="rt-val">{r.move}'</span></span>
          <span><span className="rt-lbl">AL</span> <span className="rt-val">{r.alignment.slice(0, 1)}</span></span>
        </div>

        <div className="rt-weapons">
          {r.weapons.map((w, i) =>
            canGM ? (
              <div className="rt-weapon" key={i}>
                <input className="rt-in rt-wname" value={w.name} placeholder="Weapon" onChange={(e) => setW(i, { name: e.target.value })} />
                <input className="rt-in rt-wdmg" value={w.damage} placeholder="1d6" onChange={(e) => setW(i, { damage: e.target.value })} />
                <input className="rt-in rt-wmag" value={w.bonus} placeholder="+0" onChange={(e) => setW(i, { bonus: e.target.value })} />
                <button className="rt-roll rt-lbl rt-box" onClick={() => setW(i, { ranged: !w.ranged })}>{w.ranged ? "MIS" : "MEL"}</button>
                <button className="rt-roll rt-lbl rt-box" onClick={() => rollAttack(r, w)}>ATK</button>
                <button className="rt-x" onClick={() => onSave({ ...r, weapons: r.weapons.filter((_, k) => k !== i) })}>&times;</button>
              </div>
            ) : (
              <div className="rt-weapon" key={i}>
                <span className="rt-wname rt-val">{w.name || "Weapon"}</span>
                <span className="rt-wdmg rt-val">{w.damage}</span>
                <span className="rt-wmag rt-val">{w.bonus}</span>
                <span className="rt-lbl rt-wtype">{w.ranged ? "MIS" : "MEL"}</span>
                <button className="rt-roll rt-lbl rt-box" onClick={() => rollAttack(r, w)}>ATK</button>
                <span />
              </div>
            )
          )}
          {canGM && <button className="rt-add" onClick={() => onSave({ ...r, weapons: [...r.weapons, { name: "", damage: "", bonus: "", ranged: false }] })}>+ Weapon</button>}
        </div>

        <div className="rt-grid">
          {SAVE_LABELS.map((s) => (
            <button className="rt-roll rt-val" key={s.key} onClick={() => rollSave(r, s)}><span className="rt-lbl">{s.chip}</span> {r.saves[s.key]}</button>
          ))}
          <span className="rt-val rt-magic-mod" data-tip="WIS modifier to saves vs. magic"><span className="rt-lbl">M</span> {fmtMod(abilityMod(r.abilities.wis))}</span>
          {(Object.keys(r.abilities) as (keyof Retainer["abilities"])[]).map((k) => (
            <button className="rt-roll rt-val" key={k} onClick={() => rollAbility(r, k)}><span className="rt-lbl">{k.toUpperCase()}</span> {r.abilities[k]}</button>
          ))}
        </div>

        <div className="rt-cols">
          <div className="rt-col">
            <div className="rt-lbl">Items</div>
            {r.items.map((t, i) => (
              <div className="rt-item" key={i}>
                <input className={`rt-in${t.startsWith("Magic item") ? " rt-magic" : ""}`} value={t} disabled={!canGM}
                  onChange={(e) => onSave({ ...r, items: r.items.map((x, k) => (k === i ? e.target.value : x)) })} />
                {canGM && <button className="rt-x" onClick={() => onSave({ ...r, items: r.items.filter((_, k) => k !== i) })}>&times;</button>}
              </div>
            ))}
            {canGM && <button className="rt-add" onClick={() => onSave({ ...r, items: [...r.items, ""] })}>+ Item</button>}
          </div>
          <div className="rt-col">
            <div className="rt-lbl">Spells</div>
            {r.spells.map((s, i) => (
              <div className="rt-item" key={i}>
                <input type="checkbox" className="rt-cast" checked={s.used} disabled={!canPlay} data-tip="Cast today"
                  onChange={(e) => onSave({ ...r, spells: r.spells.map((x, k) => (k === i ? { ...x, used: e.target.checked } : x)) })} />
                <input className="rt-in" value={s.name} disabled={!canGM}
                  onChange={(e) => onSave({ ...r, spells: r.spells.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <select className="rt-lvl" value={s.level} disabled={!canGM}
                  onChange={(e) => onSave({ ...r, spells: r.spells.map((x, k) => (k === i ? { ...x, level: Number(e.target.value) } : x)) })}>
                  {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>Lv{l}</option>)}
                </select>
                {canGM && <button className="rt-x" onClick={() => onSave({ ...r, spells: r.spells.filter((_, k) => k !== i) })}>&times;</button>}
              </div>
            ))}
            {canGM && <button className="rt-add" onClick={() => onSave({ ...r, spells: [...r.spells, { name: "", level: 1, used: false }] })}>+ Spell</button>}
          </div>
        </div>

        <div className="rt-foot">
          <div className="rt-colors">
            <button className="rt-cur" style={{ background: r.color }} disabled={!canGM} onClick={() => setColorOpen(colorOpen === r.id ? null : r.id)} />
            <div className={`rt-swatches${colorOpen === r.id ? " open" : ""}`}>
              {swatches.map(([hex, name]) => (
                <button key={hex + name} className="rt-sw" style={{ background: hex }} data-tip={name}
                  onClick={() => { onSave({ ...r, color: hex }); setColorOpen(null); }} />
              ))}
            </div>
          </div>
          {canGM && (
            <span className="rt-foot-right">
              <button className="rt-add" onClick={() => onSave({ ...r, hidden: !r.hidden })}>{r.hidden ? "Show" : "Hide"}</button>
              <button className="rt-add rt-danger" onClick={() => { if (window.confirm(`Remove ${r.name || "this retainer"}?`)) onDelete(r.id); }}>Delete</button>
            </span>
          )}
        </div>
      </div>
    );
  };

  const rows: Retainer[][] = [];
  for (let i = 0; i < visible.length; i += per) rows.push(visible.slice(i, i + per));

  return (
    <div className="rt-section">
      <div className="rt-head">
        <h2>Retainers</h2>
        <div className="rt-head-right">
          {!isGM && (
            <button className={`btn${onlyMine ? " rt-on" : ""}`} onClick={() => setOnlyMine((v) => !v)}>
              {onlyMine ? "Show all retainers" : "Show only my retainers"}
            </button>
          )}
          {isGM && unassigned.length > 0 && <button className="btn text danger" onClick={deleteUnassigned}>Delete Unassigned ({unassigned.length})</button>}
          {isGM && <button className="btn" onClick={onGenerate}>+ Generate Retainer</button>}
        </div>
      </div>
      <div className="rt-stack" ref={wrapRef} onMouseMove={onMouseMove} onMouseLeave={clearTip} onScrollCapture={onScrollShow}>
        {visible.length === 0 && (
          <div className="rt-empty">{!isGM && onlyMine ? "None of your characters have retainers." : "No retainers yet."}</div>
        )}
        {rows.map((row, ri) => {
          const step = stepFor(row.length);
          return (
            <div className="rt-row" key={ri} style={{ height: rowH }}>
              {row.map((r, i) => renderCard(r, i, i * step, ri * rowH, (((ri * per + i) * 37) % 5 - 2) * 0.45))}
            </div>
          );
        })}
      </div>
      {tip && <div className="rt-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      <RollBanner roll={roll} onDismiss={() => setRoll(null)} />
      {modal && <AppModal state={modal} />}
    </div>
  );
}
