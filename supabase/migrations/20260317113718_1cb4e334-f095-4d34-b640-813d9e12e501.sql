
CREATE TABLE public.configuracion (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 21,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.vehiculos (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matricula TEXT NOT NULL,
  modelo TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.descuentos (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  porcentaje NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.repostajes (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehiculo_id INTEGER NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  litros NUMERIC(10,3) NOT NULL,
  coste_litro NUMERIC(10,4) NOT NULL,
  km_inicio INTEGER NOT NULL,
  km_fin INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.repostaje_descuentos (
  repostaje_id INTEGER REFERENCES public.repostajes(id) ON DELETE CASCADE,
  descuento_id INTEGER REFERENCES public.descuentos(id) ON DELETE CASCADE,
  PRIMARY KEY (repostaje_id, descuento_id)
);

CREATE INDEX idx_repostajes_fecha ON public.repostajes(fecha);
CREATE INDEX idx_repostajes_vehiculo ON public.repostajes(vehiculo_id);
CREATE INDEX idx_repostajes_user ON public.repostajes(user_id);

ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descuentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repostajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repostaje_descuentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_configuracion" ON public.configuracion FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_vehiculos" ON public.vehiculos FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_descuentos" ON public.descuentos FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_repostajes" ON public.repostajes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_repostaje_descuentos" ON public.repostaje_descuentos FOR ALL
  USING (repostaje_id IN (SELECT id FROM public.repostajes WHERE user_id = auth.uid()))
  WITH CHECK (repostaje_id IN (SELECT id FROM public.repostajes WHERE user_id = auth.uid()));
