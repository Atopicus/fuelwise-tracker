import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVehicleStore } from "@/stores/vehicleStore";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Car, Menu } from "lucide-react";

interface Vehicle {
  id: number;
  matricula: string;
  modelo: string;
}

interface TopBarProps {
  onToggleSidebar?: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const { activeVehicleId, setActiveVehicleId } = useVehicleStore();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const fetchVehicles = async () => {
      const { data } = await supabase
        .from("vehiculos")
        .select("id, matricula, modelo")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        setVehicles(data);
        if (!activeVehicleId || !data.find((v) => v.id === activeVehicleId)) {
          setActiveVehicleId(data[0].id);
        }
      } else {
        setVehicles([]);
      }
    };
    fetchVehicles();
  }, [user, activeVehicleId, setActiveVehicleId]);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
      <button onClick={onToggleSidebar} className="md:hidden p-2 rounded-md hover:bg-accent">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-muted-foreground" />
        {vehicles.length > 0 ? (
          <Select
            value={activeVehicleId?.toString() ?? ""}
            onValueChange={(v) => setActiveVehicleId(Number(v))}
          >
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Seleccionar vehículo" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id.toString()}>
                  {v.matricula} — {v.modelo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">Sin vehículos</span>
        )}
      </div>
    </header>
  );
}
