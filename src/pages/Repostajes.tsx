import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtNum } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useVehicleStore } from "@/stores/vehicleStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Download, Fuel } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";

interface Repostaje {
  id: number;
  fecha: string;
  litros: number;
  coste_litro: number;
  km_inicio: number;
  km_fin: number;
  descuento_ids: number[];
  iva_porcentaje: number;
  incluir_iva: boolean;
}

interface Descuento {
  id: number;
  nombre: string;
  porcentaje: number;
  orden_aplicacion: number;
}

// ─── Lógica de descuentos en cascada ─────────────────────────────────────────
function calcDescuentos(
  bruto: number,
  selectedIds: number[],
  descuentos: Descuento[]
): { netoPagado: number; netoParaIva: number; totalDescuento: number } {
  const selected = descuentos.filter((d) => selectedIds.includes(d.id));
  if (selected.length === 0) return { netoPagado: bruto, netoParaIva: bruto, totalDescuento: 0 };
  const ordenes = [...new Set(selected.map((d) => d.orden_aplicacion))].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b);
  let base = bruto;
  let netoParaIva = bruto;
  for (const orden of ordenes) {
    if (orden === 0) netoParaIva = base;
    const grupoDescuentos = selected.filter((d) => d.orden_aplicacion === orden);
    const sumPct = grupoDescuentos.reduce((s, d) => s + d.porcentaje, 0);
    base = base - (base * sumPct) / 100;
  }
  if (!selected.some((d) => d.orden_aplicacion === 0)) netoParaIva = base;
  return { netoPagado: base, netoParaIva, totalDescuento: bruto - base };
}

// ─── Cálculo de coste real ───────────────────────────────────────────────────
function calcCosteReal(r: Repostaje, descuentos: Descuento[]) {
  const bruto = r.litros * r.coste_litro;
  const { netoPagado, netoParaIva, totalDescuento } = calcDescuentos(bruto, r.descuento_ids, descuentos);
  const ivaRow = r.iva_porcentaje;
  const totalIva = netoParaIva - netoParaIva / (1 + ivaRow / 100);
  const netoSinIva = netoPagado - totalIva;
  const costeReal = r.incluir_iva ? netoPagado : netoSinIva;
  const km = r.km_fin - r.km_inicio;
  return { bruto, netoPagado, netoParaIva, totalDescuento, totalIva, netoSinIva, costeReal, km };
}

// ─── Navegación entre celdas editables ──────────────────────────────────────
function navigateCell(currentKey: string, direction: "next" | "prev" | "down" | "up") {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-editable="true"]'));
  const currentIndex = all.findIndex((el) => el.dataset.cellKey === currentKey);
  if (currentIndex === -1) return;
  let targetIndex: number;
  if (direction === "down" || direction === "up") {
    const [, colStr] = currentKey.split("-");
    const col = Number(colStr);
    if (direction === "down") {
      const nextSameCol = all.findIndex((el, i) => i > currentIndex && Number(el.dataset.cellKey?.split("-")[1]) === col);
      targetIndex = nextSameCol !== -1 ? nextSameCol : currentIndex;
    } else {
      let found = -1;
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (Number(all[i].dataset.cellKey?.split("-")[1]) === col) { found = i; break; }
      }
      targetIndex = found !== -1 ? found : currentIndex;
    }
  } else {
    targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  }
  const target = all[targetIndex];
  if (target) { target.focus(); target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); }
}

// ─── Celda editable ──────────────────────────────────────────────────────────
function EditableCell({ value: initialValue, type = "text", cellKey, onSave }: {
  value: string | number; type?: string; cellKey: string; onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(String(initialValue)); }, [initialValue]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commitAndNavigate = (dir: "next" | "prev" | "down" | "up") => {
    setEditing(false); onSave(value);
    setTimeout(() => navigateCell(cellKey, dir), 30);
  };

  if (!editing) {
    return (
      <div ref={wrapperRef} data-editable="true" data-cell-key={cellKey} tabIndex={0}
        className="cursor-pointer px-2 py-1.5 min-h-[30px] hover:bg-primary/10 rounded
                   focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-primary/5
                   transition-colors duration-100 text-sm tabular-nums"
        onDoubleClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setEditing(true); }
          if (e.key === "ArrowRight") { e.preventDefault(); navigateCell(cellKey, "next"); }
          if (e.key === "ArrowLeft") { e.preventDefault(); navigateCell(cellKey, "prev"); }
          if (e.key === "ArrowDown") { e.preventDefault(); navigateCell(cellKey, "down"); }
          if (e.key === "ArrowUp") { e.preventDefault(); navigateCell(cellKey, "up"); }
        }}
      >{value}</div>
    );
  }

  return (
    <Input ref={inputRef} type={type} value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { setEditing(false); onSave(value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitAndNavigate("down"); }
        if (e.key === "Escape") { setEditing(false); setValue(String(initialValue)); }
        if (e.key === "Tab") { e.preventDefault(); commitAndNavigate(e.shiftKey ? "prev" : "next"); }
        if (e.key === "ArrowDown") { e.preventDefault(); commitAndNavigate("down"); }
        if (e.key === "ArrowUp") { e.preventDefault(); commitAndNavigate("up"); }
      }}
      className="h-7 text-sm px-2 border-primary ring-1 ring-primary tabular-nums"
      step={type === "number" ? "any" : undefined}
    />
  );
}

// ─── Celda de descuentos ─────────────────────────────────────────────────────
function DiscountCell({ selectedIds, descuentos, onSave }: {
  selectedIds: number[]; descuentos: Descuento[]; onSave: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(selectedIds);
  useEffect(() => { setSelected(selectedIds); }, [selectedIds]);
  const display = descuentos.filter((d) => selected.includes(d.id))
    .sort((a, b) => a.orden_aplicacion - b.orden_aplicacion)
    .map((d) => `${d.nombre} ${d.porcentaje}%`).join(", ") || "—";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) onSave(selected); }}>
      <PopoverTrigger asChild>
        <div className="cursor-pointer px-2 py-1.5 min-h-[30px] hover:bg-primary/10 rounded transition-colors duration-100 text-sm truncate max-w-[200px]"
          onDoubleClick={() => setOpen(true)}>{display}</div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 pointer-events-auto" align="start">
        <div className="space-y-1">
          {descuentos.sort((a, b) => a.orden_aplicacion - b.orden_aplicacion).map((d) => (
            <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={selected.includes(d.id)}
                onCheckedChange={(checked) => setSelected((prev) => checked ? [...prev, d.id] : prev.filter((id) => id !== d.id))} />
              <span className="flex-1">{d.nombre} ({d.porcentaje}%)</span>
              <span className="text-xs text-muted-foreground">Ord. {d.orden_aplicacion}</span>
            </label>
          ))}
          {descuentos.length === 0 && <p className="text-xs text-muted-foreground p-2">Sin descuentos configurados</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Column visibility ───────────────────────────────────────────────────────
function getColumnVisibility(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem("repostajes_col_visibility");
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Repostajes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeVehicleId } = useVehicleStore();
  const [data, setData] = useState<Repostaje[]>([]);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [defaultIva, setDefaultIva] = useState(21);
  const [sorting, setSorting] = useState<SortingState>([{ id: "fecha", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [flashRow, setFlashRow] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(getColumnVisibility);

  // Listen for visibility changes from Configuracion
  useEffect(() => {
    const handler = () => setColumnVisibility(getColumnVisibility());
    window.addEventListener("storage", handler);
    window.addEventListener("colvisibility_changed", handler);
    return () => { window.removeEventListener("storage", handler); window.removeEventListener("colvisibility_changed", handler); };
  }, []);

  const fetchData = useCallback(async () => {
    if (!user || !activeVehicleId) return;
    const { data: rows } = await supabase
      .from("repostajes")
      .select("*, repostaje_descuentos(descuento_id)")
      .eq("user_id", user.id)
      .eq("vehiculo_id", activeVehicleId)
      .order("fecha", { ascending: false });
    setData(
      (rows || []).map((r: any) => ({
        ...r,
        descuento_ids: (r.repostaje_descuentos || []).map((rd: any) => rd.descuento_id),
      }))
    );
  }, [user, activeVehicleId]);

  useEffect(() => {
    if (!user) return;
    supabase.from("descuentos").select("*").eq("user_id", user.id)
      .then(({ data }) => setDescuentos((data as any) || []));
    supabase.from("configuracion").select("iva_porcentaje").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setDefaultIva(Number(data.iva_porcentaje)); });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveRow = async (row: Repostaje) => {
    const { descuento_ids, ...rest } = row;
    await supabase.from("repostajes").update({
      fecha: rest.fecha, litros: rest.litros, coste_litro: rest.coste_litro,
      km_inicio: rest.km_inicio, km_fin: rest.km_fin,
      iva_porcentaje: rest.iva_porcentaje, incluir_iva: rest.incluir_iva,
    }).eq("id", rest.id);

    await supabase.from("repostaje_descuentos").delete().eq("repostaje_id", rest.id);
    if (descuento_ids.length > 0) {
      await supabase.from("repostaje_descuentos").insert(
        descuento_ids.map((did) => ({ repostaje_id: rest.id, descuento_id: did }))
      );
    }
    setFlashRow(rest.id);
    setTimeout(() => setFlashRow(null), 600);
  };

  const updateField = (rowId: number, field: keyof Repostaje, value: any) => {
    setData((prev) => {
      const updated = prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r));
      const row = updated.find((r) => r.id === rowId);
      if (row) saveRow(row);
      return updated;
    });
  };

  const addRow = async () => {
    if (!user || !activeVehicleId) return;
    const { data: newRow } = await supabase.from("repostajes").insert({
      user_id: user.id, vehiculo_id: activeVehicleId,
      fecha: new Date().toISOString().slice(0, 10),
      litros: 0, coste_litro: 0, km_inicio: 0, km_fin: 0,
      iva_porcentaje: defaultIva, incluir_iva: true,
    }).select().single();
    if (newRow) fetchData();
  };

  const deleteSelected = async () => {
    const ids = Object.keys(rowSelection).map((idx) => data[Number(idx)]?.id).filter(Boolean);
    if (ids.length === 0) return;
    await supabase.from("repostajes").delete().in("id", ids);
    setRowSelection({});
    setDeleteOpen(false);
    toast({ title: `${ids.length} repostaje(s) eliminado(s)` });
    fetchData();
  };

  const exportCsv = () => {
    const rows = table.getFilteredRowModel().rows;
    const headers = [
      "Fecha", "Litros", "Coste/Litro", "IVA%", "Incl.IVA", "Km Inicio", "Km Fin",
      "Bruto", "Dto.Total", "Neto", "Total IVA", "Neto s/IVA",
      "Coste Real", "Real/L", "Km Trip", "L/100km", "Coste Real/km",
    ];
    const csvRows = rows.map((r) => {
      const d = r.original;
      const c = calcCosteReal(d, descuentos);
      return [
        d.fecha, d.litros, d.coste_litro, d.iva_porcentaje, d.incluir_iva ? "Sí" : "No",
        d.km_inicio, d.km_fin,
        c.bruto.toFixed(2), c.totalDescuento.toFixed(2), c.netoPagado.toFixed(2),
        c.totalIva.toFixed(2), c.netoSinIva.toFixed(2), c.costeReal.toFixed(2),
        d.litros > 0 ? (c.costeReal / d.litros).toFixed(4) : "",
        c.km, c.km > 0 ? ((d.litros / c.km) * 100).toFixed(2) : "",
        c.km > 0 ? (c.costeReal / c.km).toFixed(4) : "",
      ].join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "repostajes.csv";
    a.click();
  };

  // ─── Columnas ───────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Repostaje>[]>(() => {
    const editableCol = (
      accessorKey: keyof Repostaje, header: string, type: string, colIndex: number
    ): ColumnDef<Repostaje> => ({
      accessorKey, header,
      cell: ({ row }) => (
        <EditableCell value={row.original[accessorKey] as string | number} type={type}
          cellKey={`${row.original.id}-${colIndex}`}
          onSave={(v) => updateField(row.original.id, accessorKey, type === "number" ? Number(v) : v)} />
      ),
    });

    const calcCol = (id: string, header: string, fn: (r: Repostaje) => string): ColumnDef<Repostaje> => ({
      id, header, accessorFn: fn, enableColumnFilter: false,
    });

    return [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)} />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} />
        ),
        size: 40, enableSorting: false, enableColumnFilter: false,
      },
      editableCol("fecha", "Fecha", "date", 1),
      editableCol("litros", "Litros", "number", 2),
      editableCol("coste_litro", "Coste/Litro", "number", 3),
      editableCol("km_inicio", "Km Inicio", "number", 4),
      editableCol("km_fin", "Km Fin", "number", 5),
      // Descuentos
      {
        id: "descuentos", header: "Descuentos",
        cell: ({ row }) => (
          <DiscountCell selectedIds={row.original.descuento_ids} descuentos={descuentos}
            onSave={(ids) => updateField(row.original.id, "descuento_ids" as any, ids)} />
        ),
        enableSorting: false,
      },
      // IVA editable por línea
      editableCol("iva_porcentaje", "IVA%", "number", 7),
      // Incluir IVA switch
      {
        id: "incluir_iva", header: "Incl.IVA",
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Switch checked={row.original.incluir_iva}
              onCheckedChange={(v) => updateField(row.original.id, "incluir_iva", v)} />
          </div>
        ),
        enableSorting: false, enableColumnFilter: false,
      },
      // Calculated
      calcCol("bruto", "Bruto", (r) => fmtNum(r.litros * r.coste_litro)),
      calcCol("totalDescuentos", "Dto. Total", (r) => {
        const c = calcCosteReal(r, descuentos);
        return fmtNum(c.totalDescuento);
      }),
      calcCol("neto", "Neto", (r) => fmtNum(calcCosteReal(r, descuentos).netoPagado)),
      calcCol("netoLitro", "Neto/L", (r) => r.litros > 0 ? fmtNum(calcCosteReal(r, descuentos).netoPagado / r.litros, 4) : "—"),
      calcCol("totalIva", "Total IVA", (r) => fmtNum(calcCosteReal(r, descuentos).totalIva)),
      calcCol("netoSinIva", "Neto s/IVA", (r) => fmtNum(calcCosteReal(r, descuentos).netoSinIva)),
      calcCol("costeReal", "Coste Real", (r) => fmtNum(calcCosteReal(r, descuentos).costeReal)),
      calcCol("realLitro", "Real/L", (r) => {
        const c = calcCosteReal(r, descuentos);
        return r.litros > 0 ? fmtNum(c.costeReal / r.litros, 4) : "—";
      }),
      calcCol("kmTrip", "Km Trip", (r) => String(r.km_fin - r.km_inicio)),
      calcCol("l100km", "L/100km", (r) => {
        const km = r.km_fin - r.km_inicio;
        return km > 0 ? fmtNum((r.litros / km) * 100) : "—";
      }),
      calcCol("costeRealKm", "Coste Real/km", (r) => {
        const c = calcCosteReal(r, descuentos);
        return c.km > 0 ? fmtNum(c.costeReal / c.km, 4) : "—";
      }),
    ];
  }, [descuentos, defaultIva]);

  const table = useReactTable({
    data, columns,
    state: { sorting, columnFilters, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).length;
  const calculatedColIds = ["bruto","totalDescuentos","neto","netoLitro","totalIva","netoSinIva","costeReal","realLitro","kmTrip","l100km","costeRealKm"];

  if (!activeVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <Fuel className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">No hay vehículo seleccionado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Repostajes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Doble clic para editar · Tab / Shift+Tab para moverse · Enter para bajar
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Añadir fila</Button>
          {selectedCount > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar ({selectedCount})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg shadow-sm overflow-auto bg-card">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-muted border-b-2 border-border">
                {hg.headers.map((header) => (
                  <th key={header.id}
                    className="text-left px-3 py-2 font-semibold text-xs text-muted-foreground
                               uppercase tracking-wide cursor-pointer select-none whitespace-nowrap
                               hover:text-foreground transition-colors"
                    onClick={header.column.getToggleSortingHandler()}>
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-primary">
                        {{ asc: "▲", desc: "▼" }[header.column.getIsSorted() as string] ?? ""}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/60 border-b border-border">
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th key={`filter-${header.id}`} className="px-1 py-1">
                  {header.column.getCanFilter() ? (
                    <Input className="h-6 text-xs px-1.5 bg-background" placeholder="Filtrar..."
                      value={(header.column.getFilterValue() as string) ?? ""}
                      onChange={(e) => header.column.setFilterValue(e.target.value)} />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id}
                className={[
                  "border-b border-border/60 transition-colors duration-150 group",
                  i % 2 === 0 ? "bg-card" : "bg-muted/40",
                  "hover:bg-primary/5",
                  row.getIsSelected() ? "!bg-primary/10 border-l-2 border-l-primary" : "",
                  flashRow === row.original.id ? "animate-save-flash" : "",
                ].join(" ")}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}
                    className={[
                      "px-1 py-0 whitespace-nowrap text-sm tabular-nums",
                      calculatedColIds.includes(cell.column.id) ? "text-muted-foreground px-3" : "",
                    ].join(" ")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-10 text-center text-muted-foreground text-sm">
                  Sin repostajes. Pulsa "Añadir fila" para empezar.
                </td>
              </tr>
            )}
          </tbody>
            {(() => {
              const filteredRows = table.getFilteredRowModel().rows;
              if (filteredRows.length === 0) return null;

              let totalLitros = 0, totalBruto = 0, totalDescuento = 0, totalNeto = 0;
              let totalIvaSum = 0, totalNetoSinIva = 0, totalCosteReal = 0, totalKm = 0;

              filteredRows.forEach((row) => {
                const r = row.original;
                const c = calcCosteReal(r, descuentos);
                totalLitros += r.litros;
                totalBruto += c.bruto;
                totalDescuento += c.totalDescuento;
                totalNeto += c.netoPagado;
                totalIvaSum += c.totalIva;
                totalNetoSinIva += c.netoSinIva;
                totalCosteReal += c.costeReal;
                totalKm += c.km;
              });

              const colTotals: Record<string, string> = {
                fecha: `${filteredRows.length} reg.`,
                litros: fmtNum(totalLitros),
                coste_litro: totalLitros > 0 ? fmtNum(totalBruto / totalLitros, 4) : "—",
                bruto: fmtNum(totalBruto),
                totalDescuentos: fmtNum(totalDescuento),
                neto: fmtNum(totalNeto),
                netoLitro: totalLitros > 0 ? fmtNum(totalNeto / totalLitros, 4) : "—",
                totalIva: fmtNum(totalIvaSum),
                netoSinIva: fmtNum(totalNetoSinIva),
                costeReal: fmtNum(totalCosteReal),
                realLitro: totalLitros > 0 ? fmtNum(totalCosteReal / totalLitros, 4) : "—",
                kmTrip: String(totalKm),
                l100km: totalKm > 0 ? fmtNum((totalLitros / totalKm) * 100) : "—",
                costeRealKm: totalKm > 0 ? fmtNum(totalCosteReal / totalKm, 4) : "—",
              };

              return (
                <tfoot>
                  <tr className="border-t-2 border-primary/40 bg-muted/80 sticky bottom-0">
                    {table.getHeaderGroups()[0].headers.map((header) => {
                      const id = header.column.id;
                      const val = colTotals[id];
                      return (
                        <td
                          key={id}
                          className={[
                            "px-3 py-2 text-sm tabular-nums whitespace-nowrap font-semibold",
                            calculatedColIds.includes(id) ? "text-muted-foreground" : "",
                            id === "fecha" ? "text-xs uppercase tracking-wide text-primary" : "",
                          ].join(" ")}
                        >
                          {val ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              );
            })()}
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {table.getFilteredRowModel().rows.length} repostaje(s)
        {selectedCount > 0 && ` · ${selectedCount} seleccionado(s)`}
      </p>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedCount} repostaje(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelected}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
