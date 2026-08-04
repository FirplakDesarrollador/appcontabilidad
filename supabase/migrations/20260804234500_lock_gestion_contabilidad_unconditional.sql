-- El trigger anterior (20260804233000) solo protegia actualizaciones
-- POSTERIORES a que la fila ya tuviera FechaProcesado (comparando OLD vs
-- NEW). Eso dejaba un hueco: si la escritura que recien pone
-- FechaProcesado por primera vez es la MISMA escritura que trae un
-- Gestion_Contabilidad equivocado (por una carrera entre el sync
-- SharePoint->Supabase y el guardado del usuario), OLD.FechaProcesado
-- todavia era NULL en ese momento y el trigger no protegia nada.
--
-- Confirmado en produccion con la factura 51848: la fila paso de
-- (FechaProcesado=NULL, GC=algo) a (FechaProcesado=<valor real>,
-- GC='Por Procesar') en una sola escritura.
--
-- Nueva regla, incondicional: si despues de la escritura la fila queda
-- con FechaProcesado no nulo, Gestion_Contabilidad SIEMPRE es 'Procesado',
-- sin importar que se haya intentado escribir. No depende de comparar
-- contra el valor anterior, asi que no puede perder ninguna carrera.

CREATE OR REPLACE FUNCTION public.trg_lock_gestion_contabilidad_procesado()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."FechaProcesado" IS NOT NULL THEN
        NEW."Gestion_Contabilidad" := 'Procesado';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lock_gestion_contabilidad_procesado ON public."Registro_Facturas";

CREATE TRIGGER lock_gestion_contabilidad_procesado
    BEFORE INSERT OR UPDATE ON public."Registro_Facturas"
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_lock_gestion_contabilidad_procesado();
