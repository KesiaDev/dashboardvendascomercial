import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, KeyRound, UserPlus } from "lucide-react";
import {
  listAppUsersFn, createAppUserFn, resetAppUserPasswordFn, deleteAppUserFn,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_app/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listAppUsersFn(),
  });

  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "vendedor" as "vendedor" | "gestor" });

  const createM = useMutation({
    mutationFn: () => createAppUserFn({ data: form }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setForm({ full_name: "", email: "", password: "", role: "vendedor" });
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar usuário"),
  });

  const resetM = useMutation({
    mutationFn: (v: { userId: string; password: string }) => resetAppUserPasswordFn({ data: v }),
    onSuccess: () => toast.success("Senha atualizada"),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao redefinir senha"),
  });

  const delM = useMutation({
    mutationFn: (userId: string) => deleteAppUserFn({ data: { userId } }),
    onSuccess: () => { toast.success("Usuário removido"); qc.invalidateQueries({ queryKey: ["app-users"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover usuário"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre vendedores e gestores. Novos usuários já entram confirmados e podem acessar direto.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Adicionar usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-5"
            onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}
          >
            <div className="md:col-span-1 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="md:col-span-1 space-y-1.5">
              <Label>Senha</Label>
              <Input type="text" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="md:col-span-1 space-y-1.5">
              <Label>Perfil</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "vendedor" | "gestor" })}
              >
                <option value="vendedor">Vendedor</option>
                <option value="gestor">Gestor</option>
              </select>
            </div>
            <div className="md:col-span-5">
              <Button type="submit" disabled={createM.isPending}>
                {createM.isPending ? "Criando..." : "Criar usuário"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usuários cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Perfil</th>
                    <th className="py-2 pr-3">Último acesso</th>
                    <th className="py-2 pr-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow key={u.id} u={u}
                      onReset={(pw) => resetM.mutate({ userId: u.id, password: pw })}
                      onDelete={() => delM.mutate(u.id)}
                      disabled={u.role === "admin"}
                    />
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum usuário.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ u, onReset, onDelete, disabled }: {
  u: { id: string; email: string | null; full_name: string | null; role: string; last_sign_in_at: string | null };
  onReset: (pw: string) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [pw, setPw] = useState("");
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3">{u.full_name ?? "—"}</td>
      <td className="py-2 pr-3">{u.email}</td>
      <td className="py-2 pr-3">
        <Badge variant={u.role === "admin" ? "default" : u.role === "gestor" ? "secondary" : "outline"}>
          {u.role}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "nunca"}
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-32"
              placeholder="Nova senha"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={disabled}
            />
            <Button size="sm" variant="outline"
              onClick={() => { if (pw.length >= 6) { onReset(pw); setPw(""); } }}
              disabled={disabled || pw.length < 6}
              title="Redefinir senha"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="ghost"
            onClick={() => { if (confirm(`Remover ${u.email}?`)) onDelete(); }}
            disabled={disabled}
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
