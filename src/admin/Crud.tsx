import { useState } from "react";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, ICON_NAMES, Icon, Loading, Modal } from "../ui/kit";

export type FieldDef = {
  key: string; label: string; type?: "text" | "textarea" | "number" | "bool" | "select" | "date" | "datetime" | "json" | "color" | "icon" | "list";
  options?: [string | number, string][]; full?: boolean; render?: (v: any, row: any) => React.ReactNode; custom?: (v: any, set: (v: any) => void, row: any) => React.ReactNode;
};

export function FieldInput({ f, value, onChange, row }: { f: FieldDef; value: any; onChange: (v: any) => void; row: any }) {
  if (f.custom) return <div style={{ gridColumn: "1 / -1" }}><div className="small" style={{ fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>{f.label}</div>{f.custom(value, onChange, row)}</div>;
  const t = f.type || "text";
  if (t === "bool") return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  if (t === "select") return <label className="field">{f.label}<select className="select" value={value ?? ""} onChange={(e) => { const o = f.options!.find(([k]) => String(k) === e.target.value); onChange(o ? o[0] : e.target.value); }}><option value="">—</option>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>;
  if (t === "textarea") return <label className="field" style={{ gridColumn: "1 / -1" }}>{f.label}<textarea className="textarea" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></label>;
  if (t === "json") return <JsonInput f={f} value={value} onChange={onChange} />;
  if (t === "list") return <label className="field" style={{ gridColumn: "1 / -1" }}>{f.label} (через запятую)<input className="input" value={(value || []).join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></label>;
  if (t === "color") return <label className="field">{f.label}<div className="row"><input type="color" value={value || "#1B4FA3"} onChange={(e) => onChange(e.target.value)} style={{ width: 48, height: 40, border: "none", background: "none" }} /><input className="input grow" value={value || ""} onChange={(e) => onChange(e.target.value)} /></div></label>;
  if (t === "icon") return (
    <div style={{ gridColumn: "1 / -1" }}><div className="small" style={{ fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>{f.label}</div>
      <div className="chips">{ICON_NAMES.map((n) => <button key={n} type="button" className={`chip ${value === n ? "on" : ""}`} style={{ width: 40, padding: 0, justifyContent: "center" }} onClick={() => onChange(n)} title={n}><Icon name={n} size={17} /></button>)}</div></div>
  );
  return (
    <label className="field">{f.label}
      <input className="input" type={t === "number" ? "number" : t === "date" ? "date" : t === "datetime" ? "datetime-local" : "text"}
             value={t === "datetime" ? (value || "").slice(0, 16) : t === "date" ? (value || "").slice(0, 10) : value ?? ""}
             onChange={(e) => onChange(t === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />
    </label>
  );
}

function JsonInput({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState(false);
  return (
    <label className="field" style={{ gridColumn: "1 / -1" }}>{f.label} (JSON)
      <textarea className="textarea" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, minHeight: 110, borderColor: err ? "var(--red)" : undefined }} value={text}
                onChange={(e) => { setText(e.target.value); try { onChange(JSON.parse(e.target.value)); setErr(false); } catch { setErr(true); } }} />
    </label>
  );
}

export function EditForm({ fields, initial, onSave, saveLabel = "Сохранить" }: { fields: FieldDef[]; initial: any; onSave: (d: any) => Promise<void>; saveLabel?: string }) {
  const [d, setD] = useState<any>(initial);
  return (
    <div className="stack">
      <div className="form-grid">{fields.map((f) => <FieldInput key={f.key} f={f} row={d} value={d[f.key]} onChange={(v) => setD((x: any) => ({ ...x, [f.key]: v }))} />)}</div>
      <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => onSave(d)}>{saveLabel}</button>
    </div>
  );
}

/** Универсальная таблица ресурса панели управления: список, поиск, создание, редактирование, удаление. */
export default function Crud({ res, title, columns, fields, defaults = {}, canWrite = true, extraActions, moderation, filter }: {
  res: string; title: string; columns: FieldDef[]; fields: FieldDef[]; defaults?: any; canWrite?: boolean;
  extraActions?: (row: any, reload: () => void) => React.ReactNode; moderation?: boolean; filter?: (r: any) => boolean;
}) {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const { data, loading, reload } = useAsync(() => api<any[]>(`/api/admin/r/${res}?q=${encodeURIComponent(q)}${mod ? `&moderation=${mod}` : ""}`), [res, q, mod]);
  const [edit, setEdit] = useState<any>(null);
  const save = async (d: any) => {
    try {
      if (d.id) await api(`/api/admin/r/${res}/${d.id}`, { method: "PATCH", body: d });
      else await api(`/api/admin/r/${res}`, { body: d });
      toast("Сохранено — изменения уже на сайте и в приложении"); setEdit(null); reload();
    } catch (e: any) { toast(e.message, "err"); }
  };
  const del = async (row: any) => {
    if (!confirm(`Удалить «${row.name || row.title || row.code || row.id}»?`)) return;
    try { await api(`/api/admin/r/${res}/${row.id}`, { method: "DELETE" }); toast("Удалено"); reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  const rows = (data || []).filter(filter || (() => true));
  return (
    <div className="stack">
      <div className="row between">
        <h2>{title}</h2>
        <div className="row">
          <div className="row" style={{ position: "relative" }}><Search size={16} style={{ position: "absolute", left: 12, color: "var(--ink-3)" }} /><input className="input" style={{ paddingLeft: 36, width: 220, height: 38 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {moderation && <select className="select" style={{ width: "auto", height: 38 }} value={mod} onChange={(e) => setMod(e.target.value)}><option value="">Все</option><option value="pending">На модерации</option><option value="published">Опубликованные</option><option value="rejected">Отклонённые</option></select>}
          {canWrite && <button className="btn primary sm" style={{ height: 38 }} onClick={() => setEdit({ ...defaults })}><Plus size={16} />Добавить</button>}
        </div>
      </div>
      {loading && !data ? <Loading /> : !rows.length ? <Empty icon="info" title="Записей нет" /> : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(r[c.key], r) : typeof r[c.key] === "boolean" ? (r[c.key] ? "да" : "нет") : String(r[c.key] ?? "")}</td>)}
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  {extraActions?.(r, reload)}
                  {canWrite && <><button className="btn ghost sm" onClick={() => setEdit(r)} aria-label="Редактировать"><Pencil size={15} /></button>
                    <button className="btn ghost sm" onClick={() => del(r)} aria-label="Удалить"><Trash2 size={15} /></button></>}
                </td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {edit && <Modal wide title={edit.id ? "Редактирование" : "Новая запись"} onClose={() => setEdit(null)}><EditForm fields={fields} initial={edit} onSave={save} /></Modal>}
    </div>
  );
}

export const modBadge = (v: string) => <span className={`badge ${v === "published" ? "ok" : v === "pending" ? "warn" : "err"}`}>{{ published: "опубликовано", pending: "на модерации", rejected: "отклонено" }[v] || v}</span>;

export function ModActions({ res, row, reload }: { res: string; row: any; reload: () => void }) {
  const { toast } = useStore();
  if (row.moderation !== "pending") return null;
  const act = async (action: string) => { await api(`/api/admin/moderate/${res}/${row.id}`, { body: { action } }); toast(action === "publish" ? "Опубликовано" : "Отклонено"); reload(); };
  return <><button className="btn secondary sm" onClick={() => act("publish")}>Опубликовать</button><button className="btn ghost sm" onClick={() => act("reject")}>Отклонить</button></>;
}
