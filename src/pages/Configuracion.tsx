import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

interface Descuento {
  id: number;
  nombre: string;
  porcentaje: number;
  orden_aplicacion: number;
}

interface Vehicle {
  id: number;
  matricula: string;
  modelo: string;
}

interface ImportRow {
  fecha: string;
  litros: number;
  coste_litro: number;
  km_inicio: number;
  km_fin: number;
}

export default function Configuracion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [iva, setIva] = useState("21");
  const [ivaSaving, setIvaSaving] = useState(false);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [newNombre, setNewNombre] = useState("");
  const [newPorcentaje, setNewPorcentaje] = useState("");
  const [newOrden, setNewOrden] = useState("1");
  const [editTarget, setEditTarget] = useState<Descuento | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editPorcentaje, setEditPorcentaje] = useState("");
  const [editOrden, setEditOrden] = useState("1");
  const [deleteTarget, setDeleteTarget] = useState<Descuento | null>(null);

  // Import state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [importVehicleId, setImportVehicleId] = useState<string>("");
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("configuracion").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setIva(String(data.iva_porcentaje));
    });
    fetchDescuentos();
    supabase.from("vehiculos").select("*").eq("user_id", user.id).order("created_at").then(({ data }) => {
      setVehicles((data as Vehicle[]) || []);
    });
  }, [user]);

  const fetchDescuentos = async () => {
    if (!user) return;
    const { data } = await supabase.from("descuentos").select("*").eq("user_id", user.id).order("created_at");
    setDescuentos((data as any) || []);
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
    await supabase.from("descuentos").insert({
      user_id: user.id,
      nombre: newNombre,
      porcentaje: Number(newPorcentaje),
      orden_aplicacion: Number(newOrden),
    });
    setNewNombre(""); setNewPorcentaje(""); setNewOrden("1");
    toast({ title: "Descuento añadido" });
    fetchDescuentos();
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    await supabase.from("descuentos").update({
      nombre: editNombre,
      porcentaje: Number(editPorcentaje),
      orden_aplicacion: Number(editOrden),
    }).eq("id", editTarget.id);
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

  const openEdit = (d: Descuento) => {
    setEditTarget(d);
    setEditNombre(d.nombre);
    setEditPorcentaje(String(d.porcentaje));
    setEditOrden(String(d.orden_aplicacion));
  };

  // ─── Import logic ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isCSV = file.name.toLowerCase().endsWith(".csv");

    reader.onload = (ev) => {
      try {
        let rows: ImportRow[] = [];

        if (isCSV) {
          const text = ev.target?.result as string;
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          // Skip header
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/[;,]/);
            if (parts.length < 5) continue;
            rows.push({
              fecha: parts[0].trim(),
              litros: Number(parts[1].trim().replace(",", ".")),
              coste_litro: Number(parts[2].trim().replace(",", ".")),
              km_inicio: Number(parts[3].trim().replace(",", ".")),
              km_fin: Number(parts[4].trim().replace(",", ".")),
            });
          }
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(sheet);
          rows = json.map((r: any) => ({
            fecha: String(r["fecha"] || r["Fecha"] || ""),
            litros: Number(r["litros"] || r["Litros"] || 0),
            coste_litro: Number(r["coste_litro"] || r["Coste/Litro"] || r["coste litro"] || 0),
            km_inicio: Number(r["km_inicio"] || r["Km Inicio"] || r["km inicio"] || 0),
            km_fin: Number(r["km_fin"] || r["Km Fin"] || r["km fin"] || 0),
          }));
        }

        setImportData(rows.filter((r) => r.fecha && r.litros > 0));
        toast({ title: `${rows.length} fila(s) leída(s) del archivo` });
      } catch {
        toast({ title: "Error al leer el archivo", variant: "destructive" });
      }
    };

    if (isCSV) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);

    // Reset file input
    e.target.value = "";
  }, [toast]);

  const executeImport = async () => {
    if (!user || !importVehicleId || importData.length === 0) return;
    setImporting(true);
    const vehicleId = Number(importVehicleId);

    const insertRows = importData.map((r) => ({
      user_id: user.id,
      vehiculo_id: vehicleId,
      fecha: r.fecha,
      litros: r.litros,
      coste_litro: r.coste_litro,
      km_inicio: r.km_inicio,
      km_fin: r.km_fin,
    }));

    const { error } = await supabase.from("repostajes").insert(insertRows);
    if (error) {
      toast({ title: "Error al importar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${insertRows.length} repostaje(s) importado(s)` });
      setImportData([]);
    }
    setImporting(false);
  };

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
        <CardHeader>
          <CardTitle className="text-base">Descuentos</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Mismo orden = se aplican simultáneamente. Diferente orden = en cascada.
            Orden 0 = no afecta al IVA.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left p-2 font-medium">Nombre</th>
                <th className="text-right p-2 font-medium">Porcentaje (%)</th>
                <th className="text-right p-2 font-medium">Orden</th>
                <th className="text-right p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {descuentos
                .sort((a, b) => a.orden_aplicacion - b.orden_aplicacion)
                .map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="p-2">{d.nombre}</td>
                  <td className="p-2 text-right">{d.porcentaje}%</td>
                  <td className="p-2 text-right">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                      d.orden_aplicacion === 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {d.orden_aplicacion}
                    </span>
                  </td>
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
            <div className="w-20 space-y-1">
              <Label className="text-xs">%</Label>
              <Input type="number" value={newPorcentaje} onChange={(e) => setNewPorcentaje(e.target.value)} placeholder="3" className="h-9" />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={newOrden} onChange={(e) => setNewOrden(e.target.value)} placeholder="1" className="h-9" />
            </div>
            <Button size="sm" onClick={addDescuento} disabled={!newNombre || !newPorcentaje}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Importación de datos ──────────────────────────────────────────── */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Importar repostajes
          </CardTitle>
          <div className="text-xs text-muted-foreground space-y-1 mt-2">
            <p>Sube un archivo <strong>CSV</strong> o <strong>Excel (.xlsx / .xls)</strong> con las siguientes columnas:</p>
            <code className="block bg-muted px-2 py-1 rounded text-[11px]">
              fecha ; litros ; coste_litro ; km_inicio ; km_fin
            </code>
            <p>• El separador de columnas puede ser <strong>;</strong> o <strong>,</strong></p>
            <p>• Los decimales pueden usar punto o coma (se convierten automáticamente)</p>
            <p>• La fecha debe estar en formato <strong>AAAA-MM-DD</strong> (ej: 2025-06-15)</p>
            <p>• La primera fila debe contener los nombres de las columnas</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Vehículo destino</Label>
            <Select value={importVehicleId} onValueChange={setImportVehicleId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecciona un vehículo" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.matricula} — {v.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Archivo CSV o Excel</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="h-9 text-sm file:mr-3 file:text-xs"
              disabled={!importVehicleId}
            />
          </div>

          {importData.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{importData.length} fila(s) listas para importar</p>
              <div className="max-h-48 overflow-auto border border-border rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="text-left p-1.5 font-medium">Fecha</th>
                      <th className="text-right p-1.5 font-medium">Litros</th>
                      <th className="text-right p-1.5 font-medium">€/L</th>
                      <th className="text-right p-1.5 font-medium">Km ini</th>
                      <th className="text-right p-1.5 font-medium">Km fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="p-1.5">{r.fecha}</td>
                        <td className="p-1.5 text-right tabular-nums">{r.litros}</td>
                        <td className="p-1.5 text-right tabular-nums">{r.coste_litro}</td>
                        <td className="p-1.5 text-right tabular-nums">{r.km_inicio}</td>
                        <td className="p-1.5 text-right tabular-nums">{r.km_fin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importData.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    … y {importData.length - 20} filas más
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={executeImport} disabled={importing}>
                  <Upload className="h-4 w-4 mr-1" /> {importing ? "Importando..." : "Importar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportData([])}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar descuento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} /></div>
            <div className="space-y-2"><Label>Porcentaje (%)</Label><Input type="number" value={editPorcentaje} onChange={(e) => setEditPorcentaje(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Orden de aplicación</Label>
              <Input type="number" value={editOrden} onChange={(e) => setEditOrden(e.target.value)} />
              <p className="text-xs text-muted-foreground">0 = no afecta al IVA. Mismo número = simultáneos. Diferente = cascada.</p>
            </div>
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
