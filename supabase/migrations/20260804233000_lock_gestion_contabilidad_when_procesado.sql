-- Bloquea a nivel de base de datos cualquier intento de cambiar
-- Gestion_Contabilidad una vez que la factura ya tiene FechaProcesado.
--
-- Los guards a nivel de aplicacion (Next.js API route y la Edge Function
-- de Supabase) demostraron ser poco confiables contra una carrera de
-- apenas ~20-30 segundos entre el momento en que un usuario marca una
-- factura como "Procesado" y el siguiente ciclo de sync SharePoint->Supabase:
-- el proceso de sync a veces reescribe Gestion_Contabilidad con un valor
-- viejo antes de que la proteccion en JS alcance a reaccionar.
--
-- Este trigger es la ultima linea de defensa: corre DENTRO de la misma
-- transaccion de cualquier UPDATE (sin importar que ruta de codigo lo
-- dispare), asi que no puede perder una carrera contra si mismo.

CREATE OR REPLACE FUNCTION public.trg_lock_gestion_contabilidad_procesado()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo aplica si la fila YA tenia FechaProcesado antes de este UPDATE
    -- (es decir, ya estaba procesada) y alguien intenta cambiar
    -- Gestion_Contabilidad a un valor distinto de 'Procesado'.
    IF OLD."FechaProcesado" IS NOT NULL
       AND NEW."Gestion_Contabilidad" IS DISTINCT FROM OLD."Gestion_Contabilidad"
       AND (NEW."Gestion_Contabilidad" IS NULL OR lower(trim(NEW."Gestion_Contabilidad")) != 'procesado')
    THEN
        NEW."Gestion_Contabilidad" := OLD."Gestion_Contabilidad";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lock_gestion_contabilidad_procesado ON public."Registro_Facturas";

CREATE TRIGGER lock_gestion_contabilidad_procesado
    BEFORE UPDATE ON public."Registro_Facturas"
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_lock_gestion_contabilidad_procesado();
