import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVehicleStore } from "@/stores/vehicleStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
}

interface Descuento {
  id: number;
  nombre: string;
  porcentaje: number;
  orden_aplicacion: number;
}

// ─── Lógica de descuentos en cascada ─────────────────────────────────────────
// Descuentos con el mismo orden se aplican simultáneamente sobre la misma base.
// Ordenes diferentes se aplican en cascada (secuencialmente).
// Orden 0 = se aplica sobre el total tras descuentos anteriores pero NO afecta al cálculo de IVA.
// Retorna { netoPagado, netoParaIva } donde netoParaIva es el total antes de descuentos orden 0.
function calcDescuentos(
  bruto: number,
  selectedIds: number[],
  descuentos: Descuento[]
): { netoPagado: number; netoParaIva: number; totalDescuento: number } {
  const selected = descuentos.filter((d) => selectedIds.includes(d.id));
  if (selected.length === 0) return { netoPagado: bruto, netoParaIva: bruto, totalDescuento: 0 };

  // Agrupar por orden
  const ordenes = [...new Set(selected.map((d) => d.orden_aplicacion))].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b);
  // Orden 0 siempre va al final

  let base = bruto;
  let netoParaIva = bruto; // se congela antes de aplicar orden 0

  for (const orden of ordenes) {
    if (orden === 0) {
      // Congelar netoParaIva antes de aplicar orden 0
      netoParaIva = base;
    }
    const grupoDescuentos = selected.filter((d) => d.orden_aplicacion === orden);
    const sumPct = grupoDescuentos.reduce((s, d) => s + d.porcentaje, 0);
    base = base - (base * sumPct) / 100;
  }

  // Si no hubo orden 0, netoParaIva = netoPagado
  if (!selected.some((d) => d.orden_aplicacion === 0)) {
    netoParaIva = base;
  }

  return {
    netoPagado: base,
    netoParaIva,
    totalDescuento: bruto - base,
  };
}

// ─── Navegación entre celdas editables ──────────────────────────────────────
function navigateCell(currentKey: string, direction: "next" | "prev" | "down") {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-editable="true"]')
  );
  const currentIndex = all.findIndex((el) => el.dataset.cellKey === currentKey);
  if (currentIndex === -1) return;

  let targetIndex: number;
  if (direction === "down") {
    const [, colStr] = currentKey.split("-");
    const col = Number(colStr);
    const nextSameCol = all.findIndex(
      (el, i) => i > currentIndex && Number(el.dataset.cellKey?.split("-")[1]) === col
    );
    targetIndex = nextSameCol !== -1 ? nextSameCol : currentIndex;
  } else {
    targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  }

  const target = all[targetIndex];
  if (target) {
    target.focus();
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }
}

// ─── Celda editable ──────────────────────────────────────────────────────────
function EditableCell({
  value: initialValue,
  type = "text",
  cellKey,
  onSave,
}: {
  value: string | number;
  type?: string;
  cellKey: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(String(initialValue)); }, [initialValue]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commitAndNavigate = (dir: "next" | "prev" | "down") => {
    setEditing(false);
    onSave(value);
    setTimeout(() => navigateCell(cellKey, dir), 30);
  };

  if (!editing) {
    return (
      <div
        ref={wrapperRef}
        data-editable="true"
        data-cell-key={cellKey}
        tabIndex={0}
        className="cursor-pointer px-2 py-1.5 min-h-[30px] hover:bg-primary/10 rounded
                   focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-primary/5
                   transition-colors duration-100 text-sm tabular-nums"
        onDoubleClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { setEditing(false); onSave(value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitAndNavigate("down"); }
        if (e.key === "Escape") { setEditing(false); setValue(String(initialValue)); }
        if (e.key === "Tab") {
          e.preventDefault();
          commitAndNavigate(e.shiftKey ? "prev" : "next");
        }
      }}
      className="h-7 text-sm px-2 border-primary ring-1 ring-primary tabular-nums"
      step={type === "number" ? "any" : undefined}
    />
  );
}

// ─── Celda de descuentos ─────────────────────────────────────────────────────
function DiscountCell({
  selectedIds,
  descuentos,
  onSave,
}: {
  selectedIds: number[];
  descuentos: Descuento[];
  onSave: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(selectedIds);

  useEffect(() => { setSelected(selectedIds); }, [selectedIds]);

  const display = descuentos
    .filter((d) => selected.includes(d.id))
    .sort((a, b) => a.orden_aplicacion - b.orden_aplicacion)
    .map((d) => `${d.nombre} ${d.porcentaje}%`)
    .join(", ") || "—";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) onSave(selected); }}>
      <PopoverTrigger asChild>
        <div
          className="cursor-pointer px-2 py-1.5 min-h-[30px] hover:bg-primary/10 rounded
                     transition-colors duration-100 text-sm truncate max-w-[200px]"
          onDoubleClick={() => setOpen(true)}
        >
          {display}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 pointer-events-auto" align="start">
        <div className="space-y-1">
          {descuentos
            .sort((a, b) => a.orden_aplicacion - b.orden_aplicacion)
            .map((d) => (
            <label
              key={d.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(d.id)}
                onCheckedChange={(checked) =>
                  setSelected((prev) =>
                    checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                  )
                }
              />
              <span className="flex-1">{d.nombre} ({d.porcentaje}%)</span>
              <span className="text-xs text-muted-foreground">Ord. {d.orden_aplicacion}</span>
            </label>
          ))}
          {descuentos.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Sin descuentos configurados</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Repostajes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeVehicleId } = useVehicleStore();
  const [data, setData] = useState<Repostaje[]>([]);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [iva, setIva] = useState(21);
  const [sorting, setSorting] = useState<SortingState>([{ id: "fecha", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [flashRow, setFlashRow] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    supabase
      .from("descuentos")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => setDescuentos((data as any) || []));
    supabase
      .from("configuracion")
      .select("iva_porcentaje")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setIva(Number(data.iva_porcentaje)); });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveRow = async (row: Repostaje) => {
    const { descuento_ids, ...rest } = row;
    await supabase
      .from("repostajes")
      .update({
        fecha: rest.fecha,
        litros: rest.litros,
        coste_litro: rest.coste_litro,
        km_inicio: rest.km_inicio,
        km_fin: rest.km_fin,
      })
      .eq("id", rest.id);

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
    const { data: newRow } = await supabase
      .from("repostajes")
      .insert({
        user_id: user.id,
        vehiculo_id: activeVehicleId,
        fecha: new Date().toISOString().slice(0, 10),
        litros: 0,
        coste_litro: 0,
        km_inicio: 0,
        km_fin: 0,
      })
      .select()
      .single();
    if (newRow) fetchData();
  };

  const deleteSelected = async () => {
    const ids = Object.keys(rowSelection)
      .map((idx) => data[Number(idx)]?.id)
      .filter(Boolean);
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
      "Fecha", "Litros", "Coste/Litro", "Km Inicio", "Km Fin",
      "Bruto", "Total Descuentos", "Neto", "Total IVA", "Neto s/IVA",
      "Neto/Litro", "Km Trip", "L/100km", "Coste/km s/IVA",
    ];
    const csvRows = rows.map((r) => {
      const d = r.original;
      const bruto = d.litros * d.coste_litro;
      const { netoPagado, netoParaIva, totalDescuento } = calcDescuentos(bruto, d.descuento_ids, descuentos);
      const netoSinIva = netoParaIva / (1 + iva / 100);
      const totalIva = netoParaIva - netoSinIva;
      const kmTrip = d.km_fin - d.km_inicio;
      return [
        d.fecha,
        d.litros,
        d.coste_litro,
        d.km_inicio,
        d.km_fin,
        bruto.toFixed(2),
        totalDescuento.toFixed(2),
        netoPagado.toFixed(2),
        totalIva.toFixed(2),
        netoSinIva.toFixed(2),
        d.litros > 0 ? (netoPagado / d.litros).toFixed(4) : "",
        kmTrip,
        kmTrip > 0 ? ((d.litros / kmTrip) * 100).toFixed(2) : "",
        kmTrip > 0 ? (netoSinIva / kmTrip).toFixed(4) : "",
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
      accessorKey: keyof Repostaje,
      header: string,
      type: string,
      colIndex: number
    ): ColumnDef<Repostaje> => ({
      accessorKey,
      header,
      cell: ({ row }) => (
        <EditableCell
          value={row.original[accessorKey] as string | number}
          type={type}
          cellKey={`${row.original.id}-${colIndex}`}
          onSave={(v) =>
            updateField(row.original.id, accessorKey, type === "number" ? Number(v) : v)
          }
        />
      ),
    });

    const calcCol = (id: string, header: string, fn: (r: Repostaje) => string): ColumnDef<Repostaje> => ({
      id,
      header,
      accessorFn: fn,
      enableColumnFilter: false,
    });

    return [
      // Checkbox
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
          />
        ),
        size: 40,
        enableSorting: false,
        enableColumnFilter: false,
      },
      editableCol("fecha", "Fecha", "date", 1),
      editableCol("litros", "Litros", "number", 2),
      editableCol("coste_litro", "Coste/Litro", "number", 3),
      editableCol("km_inicio", "Km Inicio", "number", 4),
      editableCol("km_fin", "Km Fin", "number", 5),
      // Descuentos
      {
        id: "descuentos",
        header: "Descuentos",
        cell: ({ row }) => (
          <DiscountCell
            selectedIds={row.original.descuento_ids}
            descuentos={descuentos}
            onSave={(ids) => updateField(row.original.id, "descuento_ids" as any, ids)}
          />
        ),
        enableSorting: false,
      },
      // Columnas calculadas
      calcCol("bruto", "Bruto", (r) => (r.litros * r.coste_litro).toFixed(2)),
      calcCol("totalDescuentos", "Dto. Total", (r) => {
        const bruto = r.litros * r.coste_litro;
        return calcDescuentos(bruto, r.descuento_ids, descuentos).totalDescuento.toFixed(2);
      }),
      calcCol("neto", "Neto", (r) => {
        const bruto = r.litros * r.coste_litro;
        return calcDescuentos(bruto, r.descuento_ids, descuentos).netoPagado.toFixed(2);
      }),
      calcCol("netoLitro", "Neto/L", (r) => {
        const bruto = r.litros * r.coste_litro;
        const { netoPagado } = calcDescuentos(bruto, r.descuento_ids, descuentos);
        return r.litros > 0 ? (netoPagado / r.litros).toFixed(4) : "—";
      }),
      calcCol("totalIva", "Total IVA", (r) => {
        const bruto = r.litros * r.coste_litro;
        const { netoParaIva } = calcDescuentos(bruto, r.descuento_ids, descuentos);
        const totalIva = netoParaIva - netoParaIva / (1 + iva / 100);
        return totalIva.toFixed(2);
      }),
      calcCol("netoSinIva", "Neto s/IVA", (r) => {
        const bruto = r.litros * r.coste_litro;
        const { netoPagado, netoParaIva } = calcDescuentos(bruto, r.descuento_ids, descuentos);
        const totalIva = netoParaIva - netoParaIva / (1 + iva / 100);
        return (netoPagado - totalIva).toFixed(2);
      }),
      calcCol("kmTrip", "Km Trip", (r) => String(r.km_fin - r.km_inicio)),
      calcCol("l100km", "L/100km", (r) => {
        const km = r.km_fin - r.km_inicio;
        return km > 0 ? ((r.litros / km) * 100).toFixed(2) : "—";
      }),
      calcCol("finalLitro", "Final/L", (r) => {
        const bruto = r.litros * r.coste_litro;
        const { netoPagado, netoParaIva } = calcDescuentos(bruto, r.descuento_ids, descuentos);
        const totalIva = netoParaIva - netoParaIva / (1 + iva / 100);
        const netoSinIva = netoPagado - totalIva;
        return r.litros > 0 ? (netoSinIva / r.litros).toFixed(4) : "—";
      }),
      calcCol("costeKm", "Coste/km s/IVA", (r) => {
        const km = r.km_fin - r.km_inicio;
        const bruto = r.litros * r.coste_litro;
        const { netoPagado, netoParaIva } = calcDescuentos(bruto, r.descuento_ids, descuentos);
        const totalIva = netoParaIva - netoParaIva / (1 + iva / 100);
        const netoSinIva = netoPagado - totalIva;
        return km > 0 ? (netoSinIva / km).toFixed(4) : "—";
      }),
    ];
  }, [descuentos, iva]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).length;
  const calculatedColIds = ["bruto","totalDescuentos","neto","netoLitro","totalIva","netoSinIva","kmTrip","l100km","finalLitro","costeKm"];

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
          <Button size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> Añadir fila
          </Button>
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

      {/* Grid */}
      <div className="border border-border rounded-lg shadow-sm overflow-auto bg-card">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-muted border-b-2 border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-3 py-2 font-semibold text-xs text-muted-foreground
                               uppercase tracking-wide cursor-pointer select-none whitespace-nowrap
                               hover:text-foreground transition-colors"
                    onClick={header.column.getToggleSortingHandler()}
                  >
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
                    <Input
                      className="h-6 text-xs px-1.5 bg-background"
                      placeholder="Filtrar..."
                      value={(header.column.getFilterValue() as string) ?? ""}
                      onChange={(e) => header.column.setFilterValue(e.target.value)}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={[
                  "border-b border-border/60 transition-colors duration-150 group",
                  i % 2 === 0 ? "bg-card" : "bg-muted/40",
                  "hover:bg-primary/5",
                  row.getIsSelected() ? "!bg-primary/10 border-l-2 border-l-primary" : "",
                  flashRow === row.original.id ? "animate-save-flash" : "",
                ].join(" ")}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={[
                      "px-1 py-0 whitespace-nowrap text-sm tabular-nums",
                      calculatedColIds.includes(cell.column.id)
                        ? "text-muted-foreground px-3"
                        : "",
                    ].join(" ")}
                  >
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
