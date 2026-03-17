import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Repostajes from "./pages/Repostajes";
import Vehiculos from "./pages/Vehiculos";
import Configuracion from "./pages/Configuracion";
import Calculadora from "./pages/Calculadora";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/repostajes" element={<ProtectedRoute><AppLayout><Repostajes /></AppLayout></ProtectedRoute>} />
            <Route path="/vehiculos" element={<ProtectedRoute><AppLayout><Vehiculos /></AppLayout></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute><AppLayout><Configuracion /></AppLayout></ProtectedRoute>} />
            <Route path="/calculadora" element={<ProtectedRoute><AppLayout><Calculadora /></AppLayout></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
