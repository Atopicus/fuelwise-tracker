import { useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Fuel, Car, Settings, Calculator, LogOut, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Repostajes", href: "/repostajes", icon: Fuel },
  { title: "Vehículos", href: "/vehiculos", icon: Car },
  { title: "Configuración", href: "/configuracion", icon: Settings },
  { title: "Calculadora", href: "/calculadora", icon: Calculator },
];

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-foreground/50" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
              <Fuel className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">FuelTrack</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-sidebar-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-sidebar-border">
          <button
            onClick={() => { signOut(); onClose(); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </div>
  );
}
