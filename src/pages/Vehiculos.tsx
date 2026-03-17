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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useVehicleStore } from "@/stores/vehicleStore";

interface Vehicle {
  id: number;
  matricula: string;
  modelo: string;
}

export default function Vehiculos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setActiveVehicleId } = useVehicleStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [matricula, setMatricula] = useState("");
  const [modelo, setModelo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchVehicles = async () => {
    if (!user) return;
    const { data } = await supabase.from("vehiculos").select("*").eq("user_id", user.id).order("created_at");
    setVehicles(data || []);
  };

  useEffect(() => { fetchVehicles(); }, [user]);

  const openAdd = () => { setEditing(null); setMatricula(""); setModelo(""); setDialogOpen(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setMatricula(v.matricula); setModelo(v.modelo); setDialogOpen(true); };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    if (editing) {
      await supabase.from("vehiculos").update({ matricula, modelo }).eq("id", editing.id);
      toast({ title: "Vehículo actualizado" });
    } else {
      const { data } = await supabase.from("vehiculos").insert({ user_id: user.id, matricula, modelo }).select().single();
      if (data) setActiveVehicleId(data.id);
      toast({ title: "Vehículo añadido" });
    }
    setDialogOpen(false);
    setLoading(false);
    fetchVehicles();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("vehiculos").delete().eq("id", deleteTarget.id);
    toast({ title: "Vehículo eliminado" });
    setDeleteTarget(null);
    fetchVehicles();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vehículos</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Añadir vehículo</Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left p-3 font-medium">Matrícula</th>
                <th className="text-left p-3 font-medium">Modelo</th>
                <th className="text-right p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors duration-150">
                  <td className="p-3 font-medium">{v.matricula}</td>
                  <td className="p-3 text-muted-foreground">{v.modelo}</td>
                  <td className="p-3 text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No hay vehículos. Añade uno para empezar.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vehículo" : "Añadir vehículo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Matrícula</Label>
              <Input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="1234 ABC" />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Seat León" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={loading || !matricula || !modelo}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vehículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los repostajes asociados a {deleteTarget?.matricula}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
