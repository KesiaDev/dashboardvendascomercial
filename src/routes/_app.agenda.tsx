import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, Bot, Save, Video, Phone, Mail, User as UserIcon, ChevronLeft, ChevronRight, Sparkles, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  listAgendaFn,
  upsertAgendaFn,
  deleteAgendaFn,
  listPromptsFn,
  savePromptFn,
  listAgendaLogsFn,
  blockAgendaFn,
  unblockAgendaFn,
  type AgendaItem,
  type AgentPrompt,
  type AgendaLog,
} from "@/lib/agenda.functions";


export const Route = createFileRoute("/_app/agenda")({
  component: AgendaPage,
});

const STATUS_COLORS: Record<string, string> = {
  agendado: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  realizado: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  cancelado: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  no_show: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  bloqueado: "bg-muted text-muted-foreground border-border",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AgendaPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);
  const admin = isAdminUser(user);
  const email = (user?.email ?? "").toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">Agenda do Vendedor</h2>
          <p className="text-sm text-muted-foreground">
            Reuniões e consultorias agendadas — automação com Clint + Agente IA
          </p>
        </div>
      </div>

      <Tabs defaultValue="agenda">
        <TabsList>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          {admin && <TabsTrigger value="agente">Agente IA</TabsTrigger>}
        </TabsList>
        <TabsContent value="agenda" className="mt-4">
          <AgendaTab admin={admin} userEmail={email} userName={user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null} />
        </TabsContent>
        {admin && (
          <TabsContent value="agente" className="mt-4">
            <AgentesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AgendaTab({ admin, userEmail, userName }: { admin: boolean; userEmail: string; userName: string | null }) {
  const list = useServerFn(listAgendaFn);
  const upsert = useServerFn(upsertAgendaFn);
  const del = useServerFn(deleteAgendaFn);

  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function reload() {
    setLoading(true);
    try {
      const r = await list({ data: { seller: sellerFilter === "all" ? null : sellerFilter } });
      setItems(r.items);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerFilter]);

  const sellers = useMemo(
    () => Array.from(new Set(items.map((i) => i.seller_email))).sort(),
    [items],
  );

  const filtered = useMemo(
    () => items.filter((i) => statusFilter === "all" || i.status === statusFilter),
    [items, statusFilter],
  );

  const meetings = filtered.filter((i) => i.status !== "bloqueado");
  const blocks = useMemo(
    () => groupBlocks(items.filter((i) => i.status === "bloqueado")),
    [items],
  );
  const upcoming = meetings.filter((i) => new Date(i.scheduled_at) >= new Date());
  const past = meetings.filter((i) => new Date(i.scheduled_at) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sellerFilter} onValueChange={setSellerFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="realizado">Realizado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <BlockForm
            admin={admin}
            defaultSellerEmail={userEmail}
            defaultSellerName={userName}
            onSaved={reload}
          />
          <AgendaForm
            admin={admin}
            defaultSellerEmail={userEmail}
            defaultSellerName={userName}
            onSaved={reload}
            trigger={<Button><Plus className="h-4 w-4 mr-1" /> Novo agendamento</Button>}
            upsert={upsert}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={meetings.length} tint="from-primary/20 to-primary/5" />
        <StatCard label="Próximos" value={upcoming.length} tint="from-blue-500/20 to-blue-500/5" />
        <StatCard label="Realizados" value={meetings.filter((i) => i.status === "realizado").length} tint="from-emerald-500/20 to-emerald-500/5" />
        <StatCard label="Bloqueios" value={blocks.length} tint="from-muted-foreground/20 to-muted-foreground/5" />
      </div>

      <CalendarView items={filtered} onSelectItem={() => { /* row edit handles it */ }} />


      <Card>
        <CardHeader><CardTitle className="text-base">Próximos ({upcoming.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
          )}
          {upcoming.map((it) => (
            <AgendaRow key={it.id} item={it} onChanged={reload} upsert={upsert} del={del} admin={admin} userEmail={userEmail} userName={userName} />
          ))}
        </CardContent>
      </Card>

      <BlocksCard blocks={blocks} onChanged={reload} />

      {past.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico ({past.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {past.slice(0, 50).map((it) => (
              <AgendaRow key={it.id} item={it} onChanged={reload} upsert={upsert} del={del} admin={admin} userEmail={userEmail} userName={userName} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------- Bloqueios ----------------
type BlockGroup = {
  key: string;
  seller_email: string;
  seller_name: string | null;
  reason: string;
  from: string;
  to: string;
  slots: number;
  color: string | null;
};

/** Agrupa slots bloqueados consecutivos (30 em 30 min) do mesmo vendedor/motivo. */
function groupBlocks(list: AgendaItem[]): BlockGroup[] {
  const sorted = [...list].sort(
    (a, b) => a.seller_email.localeCompare(b.seller_email) || a.scheduled_at.localeCompare(b.scheduled_at),
  );
  const out: BlockGroup[] = [];
  for (const it of sorted) {
    const start = new Date(it.scheduled_at);
    const end = new Date(start.getTime() + (it.duration_min || 30) * 60 * 1000);
    const reason = (it.notes ?? it.lead_name ?? "").trim() || "Bloqueado";
    const last = out[out.length - 1];
    if (
      last &&
      last.seller_email === it.seller_email &&
      last.reason === reason &&
      new Date(last.to).getTime() === start.getTime()
    ) {
      last.to = end.toISOString();
      last.slots += 1;
      continue;
    }
    out.push({
      key: `${it.seller_email}-${it.scheduled_at}`,
      seller_email: it.seller_email,
      seller_name: it.seller_name,
      reason,
      from: start.toISOString(),
      to: end.toISOString(),
      slots: 1,
      color: it.color ?? null,
    });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

function BlocksCard({ blocks, onChanged }: { blocks: BlockGroup[]; onChanged: () => void }) {
  const unblock = useServerFn(unblockAgendaFn);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(b: BlockGroup) {
    if (!confirm("Liberar este período bloqueado?")) return;
    setBusy(b.key);
    try {
      await unblock({
        data: {
          from: b.from,
          to: new Date(new Date(b.to).getTime() - 1000).toISOString(),
          seller_email: b.seller_email,
        },
      });
      toast.success("Período liberado");
      onChanged();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Ban className="h-4 w-4 text-muted-foreground" /> Períodos bloqueados ({blocks.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum bloqueio. Use “Bloquear período” para reservar horários — eles somem da disponibilidade do Agente IA.
          </p>
        )}
        {blocks.map((b) => (
          <div key={b.key} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
            <span
              className="h-8 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
              style={b.color ? { backgroundColor: b.color } : undefined}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{b.reason}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDate(b.from)} → {new Date(b.to).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {b.seller_name ?? b.seller_email}
              </div>
            </div>
            <Button variant="ghost" size="icon" disabled={busy === b.key} onClick={() => remove(b)} aria-label="Liberar período">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BlockForm({
  admin, defaultSellerEmail, defaultSellerName, onSaved,
}: {
  admin: boolean;
  defaultSellerEmail: string;
  defaultSellerName: string | null;
  onSaved: () => void;
}) {
  const block = useServerFn(blockAgendaFn);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState<RepeatState>(emptyRepeat());
  const [form, setForm] = useState({
    seller_email: defaultSellerEmail,
    date: new Date().toISOString().slice(0, 10),
    start: "09:00",
    end: "12:00",
    allDay: false,
    reason: "",
    color: "#64748b" as string | null,
  });

  useEffect(() => {
    setForm((f) => ({ ...f, seller_email: f.seller_email || defaultSellerEmail }));
  }, [defaultSellerEmail]);

  async function save() {
    const start = form.allDay ? "00:00" : form.start;
    const end = form.allDay ? "23:30" : form.end;
    const from = new Date(`${form.date}T${start}:00`);
    const to = new Date(`${form.date}T${end}:00`);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
      toast.error("Verifique o dia e o horário do bloqueio");
      return;
    }
    if (repeat.enabled && (!repeat.weekdays.length || !repeat.until)) {
      toast.error("Escolha os dias da semana e a data final da repetição");
      return;
    }
    setSaving(true);
    try {
      const r = await block({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          reason: form.reason || null,
          color: form.color,
          seller_email: form.seller_email || defaultSellerEmail,
          seller_name: defaultSellerName,
          repeat_weekdays: repeat.enabled ? repeat.weekdays : null,
          repeat_until: repeat.enabled ? repeat.until : null,
        },
      });
      toast.success(`Período bloqueado (${r.days ?? 1} dia(s), ${r.count} slots)`);
      setOpen(false);
      setForm((f) => ({ ...f, reason: "" }));
      setRepeat(emptyRepeat());
      onSaved();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Ban className="h-4 w-4 mr-1" /> Bloquear período</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bloquear período</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Os horários bloqueados deixam de aparecer como disponíveis para o Agente IA agendar.
          </p>
          {admin && (
            <div>
              <Label>Email do vendedor</Label>
              <Input value={form.seller_email} onChange={(e) => setForm((f) => ({ ...f, seller_email: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Dia *</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.allDay} onCheckedChange={(v) => setForm((f) => ({ ...f, allDay: v }))} />
            <Label className="text-sm font-normal">Dia inteiro</Label>
          </div>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Início *</Label>
                <Input type="time" step={1800} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
              </div>
              <div>
                <Label>Fim *</Label>
                <Input type="time" step={1800} value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
              </div>
            </div>
          )}
          <RepeatPicker value={repeat} onChange={setRepeat} baseDate={form.date} />
          <ColorPicker value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />

          <div>
            <Label>Motivo</Label>
            <Input placeholder="Almoço, folga, reunião interna…" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Bloqueando…" : "Bloquear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type RepeatState = { enabled: boolean; weekdays: number[]; until: string };

export const emptyRepeat = (): RepeatState => ({ enabled: false, weekdays: [], until: "" });

/** Seletor de repetição: dias da semana + data limite. */
function RepeatPicker({
  value, onChange, baseDate,
}: {
  value: RepeatState;
  onChange: (v: RepeatState) => void;
  baseDate: string; // yyyy-mm-dd
}) {
  function toggleDay(d: number) {
    const has = value.weekdays.includes(d);
    onChange({ ...value, weekdays: has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort() });
  }
  function enable(v: boolean) {
    if (!v) return onChange({ ...value, enabled: false });
    const base = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date();
    const until = new Date(base);
    until.setDate(until.getDate() + 6);
    onChange({
      enabled: true,
      weekdays: value.weekdays.length ? value.weekdays : [1, 2, 3, 4, 5],
      until: value.until || until.toISOString().slice(0, 10),
    });
  }
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Switch checked={value.enabled} onCheckedChange={enable} />
        <Label className="text-sm font-normal">Repetir em vários dias</Label>
      </div>
      {value.enabled && (
        <>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((w, i) => (
              <Button
                key={w}
                type="button"
                size="sm"
                variant={value.weekdays.includes(i) ? "default" : "outline"}
                className="h-8 w-11 px-0 text-xs"
                onClick={() => toggleDay(i)}
              >
                {w}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...value, weekdays: [1, 2, 3, 4, 5] })}>Seg–Sex</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...value, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>Todos os dias</Button>
          </div>
          <div>
            <Label>Repetir até *</Label>
            <Input type="date" value={value.until} onChange={(e) => onChange({ ...value, until: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Ex.: almoço de segunda a sexta às 12h — escolha Seg–Sex e a data final.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tint }: { label: string; value: number; tint?: string }) {

  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${tint ?? "from-secondary/40 to-secondary/10"}`}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-3xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------- Calendar View ----------------
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const TYPE_COLOR: Record<string, string> = {
  consultoria: "bg-primary text-primary-foreground",
  reuniao: "bg-blue-500 text-white",
  follow_up: "bg-amber-500 text-white",
  fechamento: "bg-emerald-500 text-white",
  bloqueio: "bg-muted text-muted-foreground border border-dashed border-muted-foreground/40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--muted-foreground)/0.15)_4px,hsl(var(--muted-foreground)/0.15)_8px)]",
};

const PALETTE: { hex: string; name: string }[] = [
  { hex: "#6366f1", name: "Índigo" },
  { hex: "#3b82f6", name: "Azul" },
  { hex: "#06b6d4", name: "Ciano" },
  { hex: "#10b981", name: "Verde" },
  { hex: "#84cc16", name: "Lima" },
  { hex: "#f59e0b", name: "Âmbar" },
  { hex: "#f97316", name: "Laranja" },
  { hex: "#ef4444", name: "Vermelho" },
  { hex: "#ec4899", name: "Rosa" },
  { hex: "#a855f7", name: "Roxo" },
  { hex: "#0ea5e9", name: "Céu" },
  { hex: "#64748b", name: "Cinza" },
];

/** Contraste automático do texto sobre a cor escolhida. */
function readableOn(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0b1220" : "#ffffff";
}

function ColorPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>Cor</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Cor automática"
          className={`h-7 w-7 rounded-full border bg-gradient-to-br from-secondary to-muted transition ${
            !value ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:scale-110"
          }`}
        />
        {PALETTE.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => onChange(c.hex)}
            style={{ backgroundColor: c.hex }}
            className={`h-7 w-7 rounded-full border border-black/10 transition ${
              value?.toLowerCase() === c.hex ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:scale-110"
            }`}
          />
        ))}
        <label
          className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-border"
          title="Escolher outra cor"
          style={{
            background:
              "conic-gradient(#ef4444,#f59e0b,#84cc16,#10b981,#06b6d4,#3b82f6,#a855f7,#ec4899,#ef4444)",
          }}
        >
          <input
            type="color"
            value={value ?? "#6366f1"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

function colorStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return { backgroundColor: color, color: readableOn(color), borderColor: color } as React.CSSProperties;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type DayEntry = { key: string; item: AgendaItem; start: Date; end: Date; count: number };

/** Junta slots de bloqueio consecutivos do mesmo vendedor/motivo num único bloco visual. */
function mergeBlocked(list: AgendaItem[]): DayEntry[] {
  const out: DayEntry[] = [];
  for (const it of list) {
    const start = new Date(it.scheduled_at);
    const end = new Date(start.getTime() + (it.duration_min || 30) * 60 * 1000);
    const last = out[out.length - 1];
    const isBlock = it.status === "bloqueado" || it.meeting_type === "bloqueio";
    if (
      isBlock &&
      last &&
      (last.item.status === "bloqueado" || last.item.meeting_type === "bloqueio") &&
      last.item.seller_email === it.seller_email &&
      (last.item.notes ?? last.item.lead_name) === (it.notes ?? it.lead_name) &&
      (last.item.color ?? null) === (it.color ?? null) &&
      last.end.getTime() >= start.getTime()
    ) {
      last.end = end > last.end ? end : last.end;
      last.count += 1;
      continue;
    }
    out.push({ key: it.id, item: it, start, end, count: 1 });
  }
  return out;
}

const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });


function CalendarView({ items, onSelectItem }: { items: AgendaItem[]; onSelectItem: (i: AgendaItem) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(new Date());

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  const days: Date[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      const d = new Date(it.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    const merged = new Map<string, DayEntry[]>();
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      merged.set(k, mergeBlocked(arr));
    }
    return merged;
  }, [items]);

  const today = new Date();
  const selectedItems = selected
    ? byDay.get(`${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}`) ?? []
    : [];


  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-primary/20 via-primary/5 to-transparent px-5 py-4 flex items-center gap-3 border-b border-border">
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="text-lg font-semibold capitalize">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <div className="text-xs text-muted-foreground">{items.length} agendamentos neste filtro</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Hoje</Button>
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-[11px] font-semibold text-muted-foreground text-center uppercase tracking-wide">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((d, idx) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayItems = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = selected && sameDay(d, selected);
          return (
            <button
              key={idx}
              onClick={() => setSelected(d)}
              className={`min-h-[92px] p-1.5 text-left transition bg-card hover:bg-secondary/40 ${
                inMonth ? "" : "opacity-40"
              } ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                }`}>{d.getDate()}</span>
                {dayItems.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{dayItems.length}</span>
                )}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map((e) => {
                  const it = e.item;
                  const label = e.count > 1
                    ? `${hhmm(e.start)}–${hhmm(e.end)} ${it.lead_name}`
                    : `${hhmm(e.start)} ${it.lead_name}`;
                  return (
                    <div
                      key={e.key}
                      style={colorStyle(it.color)}
                      className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        it.color ? "" : TYPE_COLOR[it.meeting_type] ?? "bg-secondary text-foreground"
                      }`}
                      title={label}
                    >
                      {label}
                    </div>
                  );
                })}
                {dayItems.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayItems.length - 3} mais</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="border-t border-border bg-muted/20 p-4">
          <div className="text-sm font-semibold mb-2 capitalize">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {selectedItems.length} {selectedItems.length === 1 ? "agendamento" : "agendamentos"}
            </span>
          </div>
          {selectedItems.length === 0 && (
            <p className="text-xs text-muted-foreground">Nada agendado neste dia.</p>
          )}
          <div className="space-y-1.5">
            {selectedItems.map((e) => {
              const it = e.item;
              const mins = Math.round((e.end.getTime() - e.start.getTime()) / 60000);
              return (
                <button
                  key={e.key}
                  onClick={() => onSelectItem(it)}
                  className="w-full flex items-center gap-3 rounded-md bg-card px-3 py-2 text-left text-sm hover:bg-secondary/60 transition"
                >
                  <span
                    style={it.color ? { backgroundColor: it.color } : undefined}
                    className={`h-8 w-1.5 rounded-full ${it.color ? "" : TYPE_COLOR[it.meeting_type] ?? "bg-secondary"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.lead_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {e.count > 1 ? `${hhmm(e.start)}–${hhmm(e.end)}` : hhmm(e.start)} · {mins}min · {it.seller_name ?? it.seller_email}
                    </div>
                  </div>
                  <Badge variant="outline" className={STATUS_COLORS[it.status] ?? ""}>{it.status}</Badge>
                </button>
              );
            })}
          </div>

        </div>
      )}
    </Card>
  );
}


function AgendaRow({
  item, onChanged, upsert, del, admin, userEmail, userName,
}: {
  item: AgendaItem;
  onChanged: () => void;
  upsert: ReturnType<typeof useServerFn<typeof upsertAgendaFn>>;
  del: ReturnType<typeof useServerFn<typeof deleteAgendaFn>>;
  admin: boolean;
  userEmail: string;
  userName: string | null;
}) {
  async function handleDelete() {
    if (!confirm("Excluir este agendamento?")) return;
    try {
      await del({ data: { id: item.id } });
      toast.success("Agendamento excluído");
      onChanged();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }
  async function setStatus(status: string) {
    try {
      await upsert({ data: { id: item.id, seller_email: item.seller_email, lead_name: item.lead_name, scheduled_at: item.scheduled_at, status } });
      onChanged();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 rounded-lg border border-border p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{item.lead_name}</span>
          <Badge variant="outline" className={STATUS_COLORS[item.status] ?? ""}>{item.status}</Badge>
          {(item.source === "agente_ia" || item.source === "ia_agent") && (
            <Badge variant="outline" className="bg-purple-500/15 text-purple-500 border-purple-500/30">
              <Bot className="h-3 w-3 mr-1" /> IA
            </Badge>
          )}
          <Badge variant="secondary">{item.meeting_type}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {fmtDate(item.scheduled_at)} · {item.duration_min}min</span>
          <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {item.seller_name ?? item.seller_email}</span>
          {item.lead_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {item.lead_phone}</span>}
          {item.lead_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {item.lead_email}</span>}
          {item.meeting_link && (
            <a href={item.meeting_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <Video className="h-3 w-3" /> Link
            </a>
          )}
        </div>
        {item.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.notes}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Select value={item.status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="realizado">Realizado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
        <AgendaForm
          admin={admin}
          defaultSellerEmail={userEmail}
          defaultSellerName={userName}
          initial={item}
          onSaved={onChanged}
          upsert={upsert}
          trigger={<Button variant="ghost" size="sm">Editar</Button>}
        />
        <Button variant="ghost" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AgendaForm({
  initial, trigger, onSaved, upsert, admin, defaultSellerEmail, defaultSellerName,
}: {
  initial?: AgendaItem;
  trigger: React.ReactNode;
  onSaved: () => void;
  upsert: ReturnType<typeof useServerFn<typeof upsertAgendaFn>>;
  admin: boolean;
  defaultSellerEmail: string;
  defaultSellerName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    seller_email: initial?.seller_email ?? defaultSellerEmail,
    seller_name: initial?.seller_name ?? defaultSellerName ?? "",
    lead_name: initial?.lead_name ?? "",
    lead_phone: initial?.lead_phone ?? "",
    lead_email: initial?.lead_email ?? "",
    scheduled_at: toLocalInput(initial?.scheduled_at),
    duration_min: initial?.duration_min ?? 60,
    meeting_type: initial?.meeting_type ?? "consultoria",
    meeting_link: initial?.meeting_link ?? "",
    status: initial?.status ?? "agendado",
    notes: initial?.notes ?? "",
    color: initial?.color ?? null as string | null,
  });
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState<RepeatState>(emptyRepeat());

  async function save() {
    if (repeat.enabled && (!repeat.weekdays.length || !repeat.until)) {
      toast.error("Escolha os dias da semana e a data final da repetição");
      return;
    }
    setSaving(true);
    try {
      const r = await upsert({
        data: {
          id: initial?.id,
          ...form,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_min: Number(form.duration_min),
          source: initial?.source ?? "manual",
          repeat_weekdays: !initial && repeat.enabled ? repeat.weekdays : null,
          repeat_until: !initial && repeat.enabled ? repeat.until : null,
        },
      });
      toast.success(
        initial
          ? "Agendamento atualizado"
          : `Agendamento criado${(r as any)?.count > 1 ? ` (${(r as any).count} datas)` : ""}`,
      );
      setOpen(false);
      setRepeat(emptyRepeat());
      onSaved();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {admin && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Email do vendedor</Label>
                <Input value={form.seller_email} onChange={(e) => setForm((f) => ({ ...f, seller_email: e.target.value }))} />
              </div>
              <div>
                <Label>Nome do vendedor</Label>
                <Input value={form.seller_name} onChange={(e) => setForm((f) => ({ ...f, seller_name: e.target.value }))} />
              </div>
            </div>
          )}
          <div>
            <Label>Nome do lead *</Label>
            <Input value={form.lead_name} onChange={(e) => setForm((f) => ({ ...f, lead_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Telefone</Label>
              <Input value={form.lead_phone} onChange={(e) => setForm((f) => ({ ...f, lead_phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.lead_email} onChange={(e) => setForm((f) => ({ ...f, lead_email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Data e hora *</Label>
              <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" value={form.duration_min} onChange={(e) => setForm((f) => ({ ...f, duration_min: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo</Label>
              <Select value={form.meeting_type} onValueChange={(v) => setForm((f) => ({ ...f, meeting_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultoria">Consultoria</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="fechamento">Fechamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="no_show">No-show</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Link da reunião</Label>
            <Input placeholder="https://meet.google.com/…" value={form.meeting_link} onChange={(e) => setForm((f) => ({ ...f, meeting_link: e.target.value }))} />
          </div>
          <ColorPicker value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />
          <div>
            <Label>Notas</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentesTab() {
  const list = useServerFn(listPromptsFn);
  const save = useServerFn(savePromptFn);
  const [items, setItems] = useState<AgentPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    seller_email: "kesia@llmidiaco.com",
    seller_name: "Kesia",
    agent_name: "COMERCIAL IA TESTE FDS",
    prompt: "",
    clint_pipeline_id: "",
    active: false,
  });
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const r = await list();
      setItems(r.items);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function submit() {
    if (!form.seller_email || !form.prompt) {
      toast.error("Preencha email do vendedor e o prompt");
      return;
    }
    setSaving(true);
    try {
      await save({ data: form });
      toast.success("Prompt salvo");
      setForm((f) => ({ ...f, prompt: "" }));
      reload();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function loadIntoForm(p: AgentPrompt) {
    setForm({
      seller_email: p.seller_email,
      seller_name: p.seller_name ?? "",
      agent_name: p.agent_name,
      prompt: p.prompt,
      clint_pipeline_id: p.clint_pipeline_id ?? "",
      active: p.active,
    });
  }

  async function toggleActive(p: AgentPrompt, active: boolean) {
    try {
      await save({ data: { ...p, active } });
      reload();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  return (
    <div className="space-y-4">
    <IntegracaoDiagnostico />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" /> Prompt do Agente
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure o prompt do agente IA que fará a primeira conversa via Clint e agendará a
            reunião para o vendedor. Comece pelo teste da Kesia; depois estenda para o time.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Email do vendedor</Label>
              <Input value={form.seller_email} onChange={(e) => setForm((f) => ({ ...f, seller_email: e.target.value }))} />
            </div>
            <div>
              <Label>Nome do vendedor</Label>
              <Input value={form.seller_name} onChange={(e) => setForm((f) => ({ ...f, seller_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Nome do agente</Label>
              <Input value={form.agent_name} onChange={(e) => setForm((f) => ({ ...f, agent_name: e.target.value }))} />
            </div>
            <div>
              <Label>Pipeline Clint (id)</Label>
              <Input placeholder="ex: PIPELINE_COMERCIAL-V3" value={form.clint_pipeline_id} onChange={(e) => setForm((f) => ({ ...f, clint_pipeline_id: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Prompt do agente</Label>
            <Textarea
              rows={14}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Diga ao seu agente o que fazer…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            <span className="text-sm">Ativo (recebe leads da Clint)</span>
            <Button className="ml-auto" onClick={submit} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando…" : "Salvar prompt"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Agentes cadastrados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum agente configurado ainda.</p>
          )}
          {items.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.agent_name}</span>
                <Badge variant="outline">{p.seller_email}</Badge>
                {p.clint_pipeline_id && <Badge variant="secondary">{p.clint_pipeline_id}</Badge>}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativo</span>
                  <Switch checked={p.active} onCheckedChange={(v) => toggleActive(p, v)} />
                  <Button variant="ghost" size="sm" onClick={() => loadIntoForm(p)}>Editar</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{p.prompt}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

function IntegracaoDiagnostico() {
  const list = useServerFn(listAgendaLogsFn);
  const [logs, setLogs] = useState<AgendaLog[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const r = await list();
      setLogs(r.items);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  const ok = logs.filter((l) => l.status === "processed").length;
  const err = logs.filter((l) => l.status === "error").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" /> Diagnóstico da automação (n8n → agenda)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Endpoint: <code>POST /api/public/agenda/book</code> · header <code>x-api-key</code> ·
          body <code>{"{ seller_email, lead_name, lead_phone, clint_deal_id, scheduled_at | agenda_tag | message }"}</code>
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">{ok} ok</Badge>
          <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30">{err} erro</Badge>
          <Button variant="outline" size="sm" className="ml-auto" onClick={reload} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
        {!loading && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma chamada recebida ainda — o n8n não está chegando no endpoint (URL, método POST ou x-api-key).
          </p>
        )}
        {logs.map((l) => (
          <div key={l.id} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={l.status === "error" ? STATUS_COLORS.cancelado : STATUS_COLORS.realizado}>
                {l.status}
              </Badge>
              <span className="text-muted-foreground">{fmtDate(l.created_at)}</span>
              {l.error_msg && <span className="text-rose-500">{l.error_msg}</span>}
            </div>
            {l.payload && (
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                {l.payload}
              </pre>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

