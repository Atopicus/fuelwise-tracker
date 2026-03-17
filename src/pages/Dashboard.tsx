import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useVehicleStore } from "@/stores/vehicleStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Fuel, TrendingDown, Gauge, DollarSign, Route } from "lucide-react";

interface Repostaje {
  id: number;
  fecha: string;
  litros: number;
  coste_litro: number;
  km_inicio: number;
  km_fin: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { activeVehicleId } = useVehicleStore();
  const [data, setData] = useState<Repostaje[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!user || !activeVehicleId) return;
    const fetchData = async () => {
      let query = supabase
        .from("repostajes")
        .select("*")
        .eq("user_id", user.id)
        .eq("vehiculo_id", activeVehicleId)
        .order("fecha", { ascending: true });
      if (startDate) query = query.gte("fecha", startDate);
      if (endDate) query = query.lte("fecha", endDate);
      const { data: rows } = await query;
      setData(rows || []);
    };
    fetchData();
  }, [user, activeVehicleId, startDate, endDate]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    let totalSpent = 0, totalLiters = 0, totalKm = 0, totalConsumption = 0, consumptionCount = 0;
    data.forEach((r) => {
      const bruto = r.litros * r.coste_litro;
      totalSpent += bruto;
      totalLiters += r.litros;
      const km = r.km_fin - r.km_inicio;
      totalKm += km;
      if (km > 0) {
        totalConsumption += (r.litros / km) * 100;
        consumptionCount++;
      }
    });
    return {
      totalSpent: totalSpent.toFixed(2),
      totalLiters: totalLiters.toFixed(1),
      totalKm,
      avgConsumption: consumptionCount > 0 ? (totalConsumption / consumptionCount).toFixed(2) : "—",
      avgCostPerKm: totalKm > 0 ? (totalSpent / totalKm).toFixed(4) : "—",
    };
  }, [data]);

  const chartData = useMemo(() => {
    const months: Record<string, { liters: number; km: number }> = {};
    data.forEach((r) => {
      const m = r.fecha.slice(0, 7);
      if (!months[m]) months[m] = { liters: 0, km: 0 };
      months[m].liters += r.litros;
      months[m].km += r.km_fin - r.km_inicio;
    });
    return Object.entries(months).map(([month, v]) => ({
      month,
      consumption: v.km > 0 ? Number(((v.liters / v.km) * 100).toFixed(2)) : 0,
    }));
  }, [data]);

  const monthlyTable = useMemo(() => {
    const months: Record<string, Repostaje[]> = {};
    data.forEach((r) => {
      const m = r.fecha.slice(0, 7);
      if (!months[m]) months[m] = [];
      months[m].push(r);
    });
    return Object.entries(months).map(([month, rows]) => {
      const totalLiters = rows.reduce((s, r) => s + r.litros, 0);
      const totalSpent = rows.reduce((s, r) => s + r.litros * r.coste_litro, 0);
      const totalKm = rows.reduce((s, r) => s + (r.km_fin - r.km_inicio), 0);
      return {
        month,
        totalLiters: totalLiters.toFixed(1),
        totalSpent: totalSpent.toFixed(2),
        avgCostLiter: totalLiters > 0 ? (totalSpent / totalLiters).toFixed(4) : "—",
        totalKm,
        avgConsumption: totalKm > 0 ? ((totalLiters / totalKm) * 100).toFixed(2) : "—",
        avgCostKm: totalKm > 0 ? (totalSpent / totalKm).toFixed(4) : "—",
      };
    });
  }, [data]);

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
        <div className="flex gap-3 items-end">
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: "Total Gastado", value: `${stats.totalSpent} €`, icon: DollarSign },
            { title: "Total Litros", value: `${stats.totalLiters} L`, icon: Fuel },
            { title: "Total Km", value: `${stats.totalKm} km`, icon: Route },
            { title: "Consumo Medio", value: `${stats.avgConsumption} L/100km`, icon: Gauge },
            { title: "Coste/km", value: `${stats.avgCostPerKm} €/km`, icon: TrendingDown },
          ].map((s) => (
            <Card key={s.title} className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{s.title}</CardTitle>
                <s.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Consumo por mes (L/100km)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ borderRadius: 6, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="consumption" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

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
                  <th className="text-right p-2 font-medium">L/100km</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTable.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0">
                    <td className="p-2">{row.month}</td>
                    <td className="p-2 text-right">{row.totalLiters}</td>
                    <td className="p-2 text-right">{row.totalSpent} €</td>
                    <td className="p-2 text-right">{row.avgConsumption}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
