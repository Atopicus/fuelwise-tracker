import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVehicleStore } from "@/stores/vehicleStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Fuel, TrendingDown, Gauge, DollarSign, Route } from "lucide-react";
import { fmtNum } from "@/lib/format";

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

export default function Dashboard() {
  const { user } = useAuth();
  const { activeVehicleId } = useVehicleStore();
  const [data, setData] = useState<Repostaje[]>([]);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [iva, setIva] = useState(21);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");

  useEffect(() => {
    if (!user) return;
    supabase.from("configuracion").select("iva_porcentaje").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setIva(Number(data.iva_porcentaje)); });
    supabase.from("descuentos").select("*").eq("user_id", user.id)
      .then(({ data }) => setDescuentos((data as any) || []));
  }, [user]);

  useEffect(() => {
    if (!user || !activeVehicleId) return;
    const fetchData = async () => {
      let query = supabase
        .from("repostajes")
        .select("*, repostaje_descuentos(descuento_id)")
        .eq("user_id", user.id)
        .eq("vehiculo_id", activeVehicleId)
        .order("fecha", { ascending: true });
      if (startDate) query = query.gte("fecha", startDate);
      if (endDate) query = query.lte("fecha", endDate);
      const { data: rows } = await query;
      setData(
        (rows || []).map((r: any) => ({
          ...r,
          descuento_ids: (r.repostaje_descuentos || []).map((rd: any) => rd.descuento_id),
        }))
      );
    };
    fetchData();
  }, [user, activeVehicleId, startDate, endDate]);

  // Available years from data
  const availableYears = useMemo(() => {
    const years = [...new Set(data.map((r) => r.fecha.slice(0, 4)))].sort();
    return years;
  }, [data]);

  // Filtered data by year
  const filteredData = useMemo(() => {
    if (selectedYear === "all") return data;
    return data.filter((r) => r.fecha.startsWith(selectedYear));
  }, [data, selectedYear]);

  const calcNetoSinIva = (r: Repostaje) => {
    const bruto = r.litros * r.coste_litro;
    const { netoPagado, netoParaIva } = calcDescuentos(bruto, r.descuento_ids, descuentos);
    const totalIva = netoParaIva - netoParaIva / (1 + iva / 100);
    return netoPagado - totalIva;
  };

  const stats = useMemo(() => {
    if (filteredData.length === 0) return null;
    let totalSpent = 0, totalLiters = 0, totalKm = 0, totalConsumption = 0, consumptionCount = 0;
    let totalNetoSinIva = 0;
    filteredData.forEach((r) => {
      const bruto = r.litros * r.coste_litro;
      totalSpent += bruto;
      totalLiters += r.litros;
      totalNetoSinIva += calcNetoSinIva(r);
      const km = r.km_fin - r.km_inicio;
      totalKm += km;
      if (km > 0) {
        totalConsumption += (r.litros / km) * 100;
        consumptionCount++;
      }
    });
    // Count unique months for average
    const uniqueMonths = new Set(filteredData.map((r) => r.fecha.slice(0, 7))).size;
    return {
      totalSpent: fmtNum(totalSpent),
      totalLiters: fmtNum(totalLiters, 1),
      totalKm,
      avgConsumption: consumptionCount > 0 ? fmtNum(totalConsumption / consumptionCount) : "—",
      avgCostPerKm: totalKm > 0 ? fmtNum(totalSpent / totalKm, 4) : "—",
      totalNetoSinIva: fmtNum(totalNetoSinIva),
      avgNetoSinIvaMes: uniqueMonths > 0 ? fmtNum(totalNetoSinIva / uniqueMonths) : "—",
    };
  }, [filteredData, descuentos, iva]);

  // Chart: Neto sin IVA per month
  const chartData = useMemo(() => {
    const months: Record<string, number> = {};
    filteredData.forEach((r) => {
      const m = r.fecha.slice(0, 7);
      if (!months[m]) months[m] = 0;
      months[m] += calcNetoSinIva(r);
    });
    return Object.entries(months).map(([month, netoSinIva]) => ({
      month,
      netoSinIva: Number(netoSinIva.toFixed(2)),
    }));
  }, [filteredData, descuentos, iva]);

  // Price per liter evolution
  const priceChartData = useMemo(() => {
    return filteredData.map((r) => ({
      fecha: r.fecha,
      precioLitro: r.coste_litro,
    }));
  }, [filteredData]);

  const monthlyTable = useMemo(() => {
    const months: Record<string, Repostaje[]> = {};
    filteredData.forEach((r) => {
      const m = r.fecha.slice(0, 7);
      if (!months[m]) months[m] = [];
      months[m].push(r);
    });
    const rows = Object.entries(months).map(([month, rows]) => {
      const totalLiters = rows.reduce((s, r) => s + r.litros, 0);
      const totalSpent = rows.reduce((s, r) => s + r.litros * r.coste_litro, 0);
      const totalKm = rows.reduce((s, r) => s + (r.km_fin - r.km_inicio), 0);
      const totalNetoSinIva = rows.reduce((s, r) => s + calcNetoSinIva(r), 0);
      return {
        month,
        totalLiters,
        totalSpent,
        totalNetoSinIva,
        avgCostLiter: totalLiters > 0 ? totalSpent / totalLiters : 0,
        totalKm,
        avgConsumption: totalKm > 0 ? (totalLiters / totalKm) * 100 : 0,
        avgCostKm: totalKm > 0 ? totalSpent / totalKm : 0,
      };
    });
    return rows;
  }, [filteredData, descuentos, iva]);

  // Totals row
  const totals = useMemo(() => {
    if (monthlyTable.length === 0) return null;
    const totalLiters = monthlyTable.reduce((s, r) => s + r.totalLiters, 0);
    const totalSpent = monthlyTable.reduce((s, r) => s + r.totalSpent, 0);
    const totalKm = monthlyTable.reduce((s, r) => s + r.totalKm, 0);
    const totalNetoSinIva = monthlyTable.reduce((s, r) => s + r.totalNetoSinIva, 0);
    return {
      totalLiters,
      totalSpent,
      totalKm,
      totalNetoSinIva,
      avgConsumption: totalKm > 0 ? (totalLiters / totalKm) * 100 : 0,
    };
  }, [monthlyTable]);

  if (!activeVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <Fuel className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">No hay vehículo seleccionado</p>
        <p className="text-sm">Añade un vehículo en la sección Vehículos para empezar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <h1 className="text-2xl font-semibold flex-1">Dashboard</h1>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <Label className="text-xs text-muted-foreground">Año</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-40" />
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { title: "Total Bruto", value: `${stats.totalSpent} €`, icon: DollarSign },
            { title: "Total Neto s/IVA", value: `${stats.totalNetoSinIva} €`, icon: DollarSign },
            { title: "Media Neto s/IVA/mes", value: `${stats.avgNetoSinIvaMes} €`, icon: TrendingDown },
            { title: "Total Litros", value: `${stats.totalLiters} L`, icon: Fuel },
            { title: "Total Km", value: `${stats.totalKm} km`, icon: Route },
            { title: "Consumo Medio", value: `${stats.avgConsumption} L/100km`, icon: Gauge },
            { title: "Coste/km", value: `${stats.avgCostPerKm} €/km`, icon: TrendingDown },
          ].map((s) => (
            <Card key={s.title} className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 p-3">
                <CardTitle className="text-[0.65rem] leading-tight font-medium text-muted-foreground">{s.title}</CardTitle>
                <s.icon className="h-3.5 w-3.5 text-primary shrink-0" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-base font-semibold leading-tight">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Neto sin IVA por mes (€)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`${fmtNum(value)} €`, "Neto s/IVA"]}
                  />
                  <Bar dataKey="netoSinIva" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Evolución precio/litro (€/L)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`${fmtNum(value, 3)} €/L`, "Precio"]}
                  />
                  <Line type="monotone" dataKey="precioLitro" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm overflow-auto">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Resumen mensual</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left p-2 font-medium">Mes</th>
                <th className="text-right p-2 font-medium">Litros</th>
                <th className="text-right p-2 font-medium">Gastado</th>
                <th className="text-right p-2 font-medium">Neto s/IVA</th>
                <th className="text-right p-2 font-medium">Km</th>
                <th className="text-right p-2 font-medium">L/100km</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTable.map((row) => (
                <tr key={row.month} className="border-b border-border last:border-0">
                  <td className="p-2">{row.month}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(row.totalLiters, 1)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(row.totalSpent)} €</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(row.totalNetoSinIva)} €</td>
                  <td className="p-2 text-right tabular-nums">{row.totalKm}</td>
                  <td className="p-2 text-right tabular-nums">{row.avgConsumption > 0 ? fmtNum(row.avgConsumption) : "—"}</td>
                </tr>
              ))}
              {totals && (
                <tr className="border-t-2 border-border bg-muted font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(totals.totalLiters, 1)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(totals.totalSpent)} €</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(totals.totalNetoSinIva)} €</td>
                  <td className="p-2 text-right tabular-nums">{totals.totalKm}</td>
                  <td className="p-2 text-right tabular-nums">{totals.avgConsumption > 0 ? fmtNum(totals.avgConsumption) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
