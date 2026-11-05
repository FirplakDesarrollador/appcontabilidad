-- Registro del resultado de los eventos Facture (RECEIVEGOODS + ACCEPT / REJECT) por factura,
-- para detectar fallos y reintentarlos desde /api/cron/retry-facture-events.
ALTER TABLE "Registro_Facturas"
  ADD COLUMN IF NOT EXISTS evento_facture_estado text,      -- 'ok' | 'error'
  ADD COLUMN IF NOT EXISTS evento_facture_accion text,      -- 'Aprobado' | 'Rechazado'
  ADD COLUMN IF NOT EXISTS evento_facture_error text,
  ADD COLUMN IF NOT EXISTS evento_facture_intentos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evento_facture_fecha timestamptz;

CREATE INDEX IF NOT EXISTS idx_registro_facturas_evento_facture_error
  ON "Registro_Facturas" (evento_facture_estado)
  WHERE evento_facture_estado = 'error';

