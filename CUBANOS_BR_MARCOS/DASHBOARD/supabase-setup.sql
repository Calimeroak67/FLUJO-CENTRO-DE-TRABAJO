-- Ejecutar en Supabase → SQL Editor
-- Habilita lectura para el dashboard (anon key) y realtime en las 3 tablas

ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_read_entradas" ON public.entradas;
DROP POLICY IF EXISTS "dashboard_read_salidas" ON public.salidas;
DROP POLICY IF EXISTS "dashboard_read_clientes" ON public.clientes;

CREATE POLICY "dashboard_read_entradas" ON public.entradas
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dashboard_read_salidas" ON public.salidas
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dashboard_read_clientes" ON public.clientes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "dashboard_update_clientes" ON public.clientes;
CREATE POLICY "dashboard_update_clientes" ON public.clientes
  FOR UPDATE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.entradas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.salidas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
