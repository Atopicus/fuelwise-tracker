import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVehicleStore } from "@/stores/vehicleStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, Info } from "lucide-react";

export default function Calculadora() {
  const { user } = useAuth();
  const { activeVehicleId } = useVehicleStore();
  const [km, setKm] = useState(0);
  const [precioLitro, setPrecioLitro] = useState(0);
  const [consumo, setConsumo] = useState(0);
  const [descuento, setDescuento] = useState(0);
  const [realAvg, setRealAvg] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !activeVehicleId) return;
    const fetchAvg = async () => {
      const { data } = await supabase
        .from("repostajes")
        .select("litros, km_inicio, km_fin")
        .eq("user_id", user.id)
        .eq("vehiculo_id", activeVehicleId);
      if (data && data.length > 0) {
        let totalL = 0, totalKm = 0;
        data.forEach((r) => { totalL += r.litros; totalKm += r.km_fin - r.km_inicio; });
        if (totalKm > 0) setRealAvg(Number(((totalL / totalKm) * 100).toFixed(2)));
      }
    };
    fetchAvg();
  }, [user, activeVehicleId]);

  const litrosNecesarios = (km * consumo) / 100;
  const costeBruto = litrosNecesarios * precioLitro;
  const costeNeto = costeBruto * (1 - descuento / 100);
  const costeDia = costeNeto;
  const costeMes = costeDia * 30;
  const costeAnio = costeDia * 365;

  const results = [
    { title: "Litros necesarios", value: `${litrosNecesarios.toFixed(2)} L` },
    { title: "Coste bruto viaje", value: `${costeBruto.toFixed(2)} €` },
    { title: "Coste neto viaje", value: `${costeNeto.toFixed(2)} €` },
    { title: "Coste por día", value: `${costeDia.toFixed(2)} €` },
    { title: "Coste por mes", value: `${costeMes.toFixed(2)} €` },
    { title: "Coste por año", value: `${costeAnio.toFixed(2)} €` },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Calculadora de costes</h1>

      <Card className="border-border shadow-sm">
        <CardContent className="pt-6 grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Kilómetros a recorrer</Label>
            <Input type="number" value={km || ""} onChange={(e) => setKm(Number(e.target.value))} placeholder="100" />
          </div>
          <div className="space-y-2">
            <Label>Precio del litro estimado (€)</Label>
            <Input type="number" step="0.01" value={precioLitro || ""} onChange={(e) => setPrecioLitro(Number(e.target.value))} placeholder="1.45" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Consumo esperado (L/100km)
              {realAvg !== null && (
                <Badge variant="secondary" className="gap-1 text-xs font-normal">
                  <Info className="h-3 w-3" /> Media real: {realAvg} L/100km
                </Badge>
              )}
            </Label>
            <Input type="number" step="0.1" value={consumo || ""} onChange={(e) => setConsumo(Number(e.target.value))} placeholder="6.5" />
          </div>
          <div className="space-y-2">
            <Label>Descuento aplicable (%)</Label>
            <Input type="number" step="0.1" value={descuento || ""} onChange={(e) => setDescuento(Number(e.target.value))} placeholder="3" />
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        {results.map((r) => (
          <Card key={r.title} className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{r.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{r.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
