import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save } from "lucide-react";

interface Descuento {
  id: number;
  nombre: string;
  porcentaje: number;
}

export default function Configuracion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [iva, setIva] = useState("21");
  const [ivaSaving, setIvaSaving] = useState(false);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [newNombre, setNewNombre] = useState("");
  const [newPorcentaje, setNewPorcentaje] = useState("");
  const [editTarget, setEditTarget] = useState<Descuento | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editPorcentaje, setEditPorcentaje] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Descuento | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("configuracion").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setIva(String(data.iva_porcentaje));
    });
    fetchDescuentos();
  }, [user]);

  const fetchDescuentos = async () => {
    if (!user) return;
    const { data } = await supabase.from("descuentos").select("*").eq("user_id", user.id).order("created_at");
    setDescuentos(data || []);
  };

  const saveIva = async () => {
    if (!user) return;
    setIvaSaving(true);
    await supabase.from("configuracion").upsert({ user_id: user.id, iva_porcentaje: Number(iva) });
    toast({ title: "IVA guardado" });
    setIvaSaving(false);
  };

  const addDescuento = async () => {
    if (!user || !newNombre || !newPorcentaje) return;
    await supabase.from("descuentos").insert({ user_id: user.id, nombre: newNombre, porcentaje: Number(newPorcentaje) });
    setNewNombre(""); setNewPorcentaje("");
    toast({ title: "Descuento añadido" });
    fetchDescuentos();
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    await supabase.from("descuentos").update({ nombre: editNombre, porcentaje: Number(editPorcentaje) }).eq("id", editTarget.id);
    toast({ title: "Descuento actualizado" });
    setEditTarget(null);
    fetchDescuentos();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("descuentos").delete().eq("id", deleteTarget.id);
    toast({ title: "Descuento eliminado" });
    setDeleteTarget(null);
    fetchDescuentos();
  };

  const openEdit = (d: Descuento) => { setEditTarget(d); setEditNombre(d.nombre); setEditPorcentaje(String(d.porcentaje)); };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Configuración</h1>

      <Card className="border-border shadow-sm">
        <CardHeader><CardTitle className="text-base">IVA</CardTitle></CardHeader>
        <CardContent className="flex gap-3 items-end">
          <div className="space-y-2 flex-1">
            <Label>Porcentaje de IVA (%)</Label>
            <Input type="number" value={iva} onChange={(e) => setIva(e.target.value)} className="max-w-[120px]" />
          </div>
          <Button onClick={saveIva} disabled={ivaSaving} size="sm"><Save className="h-4 w-4 mr-1" /> Guardar</Button>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader><CardTitle className="text-base">Descuentos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left p-2 font-medium">Nombre</th>
                <th className="text-right p-2 font-medium">Porcentaje (%)</th>
                <th className="text-right p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {descuentos.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="p-2">{d.nombre}</td>
                  <td className="p-2 text-right">{d.porcentaje}%</td>
                  <td className="p-2 text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex gap-2 items-end pt-2 border-t border-border">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={newNombre} onChange={(e) => setNewNombre(e.target.value)} placeholder="ING" className="h-9" />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">%</Label>
              <Input type="number" value={newPorcentaje} onChange={(e) => setNewPorcentaje(e.target.value)} placeholder="3" className="h-9" />
            </div>
            <Button size="sm" onClick={addDescuento} disabled={!newNombre || !newPorcentaje}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar descuento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} /></div>
            <div className="space-y-2"><Label>Porcentaje (%)</Label><Input type="number" value={editPorcentaje} onChange={(e) => setEditPorcentaje(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar descuento?</AlertDialogTitle>
            <AlertDialogDescription>El descuento "{deleteTarget?.nombre}" será eliminado permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
