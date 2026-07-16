import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, Bot, Save, Video, Phone, Mail, User as UserIcon, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
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
  type AgendaItem,
  type AgentPrompt,
} from "@/lib/agenda.functions";

export const Route = createFileRoute("/_app/agenda")({
  component: AgendaPage,
});

const STATUS_COLORS: Record<string, string> = {
  agendado: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  realizado: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  cancelado: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  no_show: "bg-amber-500/15 text-amber-500 border-amber-500/30",
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

  const upcoming = filtered.filter((i) => new Date(i.scheduled_at) >= new Date());
  const past = filtered.filter((i) => new Date(i.scheduled_at) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {admin && (
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="realizado">Realizado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total" value={filtered.length} tint="from-primary/20 to-primary/5" />
        <StatCard label="Próximos" value={upcoming.length} tint="from-blue-500/20 to-blue-500/5" />
        <StatCard label="Realizados" value={filtered.filter((i) => i.status === "realizado").length} tint="from-emerald-500/20 to-emerald-500/5" />
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
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
          {item.source === "ia_agent" && (
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
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          id: initial?.id,
          ...form,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_min: Number(form.duration_min),
          source: initial?.source ?? "manual",
        },
      });
      toast.success(initial ? "Agendamento atualizado" : "Agendamento criado");
      setOpen(false);
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
  );
}
