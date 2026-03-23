
ALTER TABLE public.repostajes 
  ADD COLUMN iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 21,
  ADD COLUMN incluir_iva BOOLEAN NOT NULL DEFAULT true;
