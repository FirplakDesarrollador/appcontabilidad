import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const INBOX_BASE_URL = "https://fone-reception-inbox-pro.azurewebsites.net"
const FACTURE_AUTH_URL = "https://api.facture.co/PLColab.Identity/Auth/Login"
const CONSTANT_ID = "0b409936-666f-4a61-8efd-a9c400d9fa7f"

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log(`[sincronizar-con-facture] 🚀 Solicitud recibida en la Edge Function...`)

    let reqBody: any = {}
    if (req.method === 'POST') {
      try {
        reqBody = await req.json()
      } catch (_e) {
        // reqBody vacío si no hay JSON
      }
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? 'https://zohdtksgxhbheaftgmsi.supabase.co'
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Extraer lista de ítems según la estructura enviada por Power Automate o API
    let itemsList: any[] = []

    if (Array.isArray(reqBody.items)) {
      itemsList = reqBody.items
    } else if (reqBody.body && Array.isArray(reqBody.body.items)) {
      itemsList = reqBody.body.items
    } else if (reqBody.item) {
      itemsList = Array.isArray(reqBody.item) ? reqBody.item : [reqBody.item]
    } else if (reqBody.ldf || reqBody.number || reqBody.documentCode || reqBody.supplierIdentification) {
      itemsList = [reqBody]
    }

    // SI VIENEN ÍTEMS DESDE POWER AUTOMATE
    if (itemsList.length > 0) {
      console.log(`[sincronizar-con-facture] 📦 Procesando ${itemsList.length} ítems recibidos desde Power Automate...`)

      const summary = {
        totalReceived: itemsList.length,
        processed: 0,
        skipped: 0,
        errors: 0,
        details: [] as any[]
      }

      for (const item of itemsList) {
        const ldf = item.ldf || item.documentCode || ''
        const notificationId = item.id
        const rawNumber = item.number || item.documentCode || ldf
        const docType = (item.documentTypeCode || ldf.split('-')[0] || '').toUpperCase()

        if (docType === 'NC' || ldf.startsWith('NC-')) {
          console.log(`[sincronizar-con-facture] Omitiendo Nota Crédito: ${ldf}`)
          summary.skipped++
          summary.details.push({ ldf, status: 'skipped', reason: 'Nota Crédito' })
          continue
        }

        try {
          const cleanNroFactura = rawNumber.replace(/^(FAC|FE)[-_]?/i, '').trim()

          // Verificar si ya existe en Registro_Facturas
          const { data: existing } = await supabase
            .from('Registro_Facturas')
            .select('ID, Nro_Factura')
            .or(`Nro_Factura.eq.${ldf},Nro_Factura.eq.${rawNumber},Nro_Factura.eq.${cleanNroFactura}`)
            .maybeSingle()

          if (existing) {
            console.log(`[sincronizar-con-facture] Factura ${rawNumber} ya existe en Registro_Facturas (ID ${existing.ID}). Omitiendo.`)
            summary.skipped++
            summary.details.push({ ldf, status: 'already_exists', id: existing.ID })
            continue
          }

          const nit = item.supplierIdentification || item.issuerNit || item.nit || ''
          const cleanNit = nit.split('-')[0].trim()
          const provider = item.supplierName || item.issuerName || item.provider || 'Proveedor Desconocido'
          const amountValue = item.payableAmount ?? item.totalAmount ?? item.amount ?? 0
          const cufe = item.cufe || item.uuid || ''
          const createdDate = item.receptionDate || item.issueDate || new Date().toISOString()

          // Buscar responsable en Proveedores_con_Responsable
          let responsable: string | null = null
          if (cleanNit) {
            const { data: provData } = await supabase
              .from('Proveedores_con_Responsable')
              .select('Responsable, Autorizador')
              .or(`Nit.eq.${cleanNit},Nit.like.${cleanNit}%`)
              .limit(1)

            if (provData && provData.length > 0) {
              responsable = provData[0].Responsable || provData[0].Autorizador || null
            }
          }

          const observaciones = responsable
            ? 'Sincronizada vía Power Automate (Responsable asignado)'
            : 'Sincronizada vía Power Automate'

          const generatedId = Number(BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)))

          const recordToInsert = {
            ID: generatedId,
            Nit: cleanNit || nit,
            Proveedor: provider,
            Nro_Factura: rawNumber || ldf,
            Valor_total: String(amountValue),
            Responsable_de_Autorizar: responsable,
            Observaciones: observaciones,
            Creado: createdDate,
            CUFE: cufe,
            Gestion_Contabilidad: 'Por Aprobar',
            Aprobacion_Doliente: 'Por Aprobar',
            Procesado: 'false',
            updated_at: new Date().toISOString()
          }

          const { error: insertErr } = await supabase
            .from('Registro_Facturas')
            .insert(recordToInsert)

          if (insertErr) {
            console.error(`[sincronizar-con-facture] Error insertando factura ${ldf}:`, insertErr.message)
            summary.errors++
            summary.details.push({ ldf, error: insertErr.message })
            continue
          }

          console.log(`[sincronizar-con-facture] ✅ Factura ${rawNumber} (${provider}) guardada con ID ${generatedId}`)
          summary.processed++
          summary.details.push({ ldf, status: 'inserted', id: generatedId, provider, amount: amountValue })

        } catch (itemErr: any) {
          console.error(`[sincronizar-con-facture] Error procesando ${ldf}:`, itemErr)
          summary.errors++
          summary.details.push({ ldf, error: itemErr.message || 'Error desconocido' })
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          summary
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // MODO AUTÓNOMO BATCH (Si no se envían ítems en el Body, la Edge Function consulta Facture directamente)
    const daysBack = reqBody.days ?? 60
    const filterIsRead = reqBody.isRead !== undefined ? String(reqBody.isRead) : null
    const markAsRead = reqBody.markAsRead !== false // Ahora por defecto SIEMPRE marca como leída a menos que explícitamente se mande false
    const maxPages = reqBody.maxPages ?? 5
    const pageSize = reqBody.pageSize ?? 100

    const user = Deno.env.get('FACTURE_API_USER') ?? '890927404'
    const pass = Deno.env.get('FACTURE_API_PASSWORD') ?? '|uLuG&W@SDUdQ26'

    console.log(`[sincronizar-con-facture] Modo Autónomo: Autenticando en Facture (${user})...`)
    const loginRes = await fetch(FACTURE_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ u: user, p: pass, ft: 'issuer|Receiver' })
    })

    if (!loginRes.ok) {
      const errText = await loginRes.text()
      throw new Error(`Error de autenticación en Facture (${loginRes.status}): ${errText}`)
    }

    const loginData = await loginRes.json()
    const token = loginData.accessToken || loginData.token || (typeof loginData === 'string' ? loginData : loginData.jwt)

    if (!token) {
      throw new Error('No se obtuvo accessToken en la respuesta de Facture.')
    }

    const now = new Date()
    const startDate = new Date()
    startDate.setDate(now.getDate() - daysBack)
    const formatDate = (d: Date) => d.toISOString().split('T')[0] + 'T00:00:00.00'

    const fetchedItems: any[] = []

    for (let page = 1; page <= maxPages; page++) {
      const inboxUrl = new URL(`${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`)
      inboxUrl.searchParams.append('receiverStartingDate', formatDate(startDate))
      inboxUrl.searchParams.append('receiverEndingDate', formatDate(now))
      if (filterIsRead !== null) {
        inboxUrl.searchParams.append('isRead', filterIsRead)
      }
      inboxUrl.searchParams.append('pageIndex', String(page))
      inboxUrl.searchParams.append('pageSize', String(pageSize))

      const inboxRes = await fetch(inboxUrl.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!inboxRes.ok) break

      const inboxData = await inboxRes.json()
      const items: any[] = inboxData?.items || (Array.isArray(inboxData) ? inboxData : [])
      
      if (!items.length) break
      fetchedItems.push(...items)
    }

    const summary = {
      totalFound: fetchedItems.length,
      processed: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[]
    }

    for (const item of fetchedItems) {
      const ldf = item.ldf || item.documentCode || ''
      const notificationId = item.id
      const rawNumber = item.number || item.documentCode || item.documentNumber || ldf
      const docType = (item.documentTypeCode || ldf.split('-')[0] || '').toUpperCase()

      if (docType === 'NC' || ldf.startsWith('NC-')) {
        summary.skipped++
        continue
      }

      try {
        const cleanNroFactura = rawNumber.replace(/^(FAC|FE)[-_]?/i, '').trim()

        const { data: existing } = await supabase
          .from('Registro_Facturas')
          .select('ID, Nro_Factura')
          .or(`Nro_Factura.eq.${ldf},Nro_Factura.eq.${rawNumber},Nro_Factura.eq.${cleanNroFactura}`)
          .maybeSingle()

        if (existing) {
          summary.skipped++
          continue
        }

        const nit = item.supplierIdentification || item.issuerNit || item.nit || ''
        const cleanNit = nit.split('-')[0].trim()
        const provider = item.supplierName || item.issuerName || item.provider || 'Proveedor Desconocido'
        const amountValue = item.payableAmount ?? item.totalAmount ?? item.amount ?? 0
        const cufe = item.cufe || item.uuid || ''
        const createdDate = item.receptionDate || item.issueDate || new Date().toISOString()

        let responsable: string | null = null
        if (cleanNit) {
          const { data: provData } = await supabase
            .from('Proveedores_con_Responsable')
            .select('Responsable, Autorizador')
            .or(`Nit.eq.${cleanNit},Nit.like.${cleanNit}%`)
            .limit(1)

          if (provData && provData.length > 0) {
            responsable = provData[0].Responsable || provData[0].Autorizador || null
          }
        }

        const observaciones = responsable
          ? 'Sincronizada automáticamente desde Facture (Responsable asignado)'
          : 'Sincronizada automáticamente desde Facture'

        const generatedId = Number(BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)))

        const recordToInsert = {
          ID: generatedId,
          Nit: cleanNit || nit,
          Proveedor: provider,
          Nro_Factura: rawNumber || ldf,
          Valor_total: String(amountValue),
          Responsable_de_Autorizar: responsable,
          Observaciones: observaciones,
          Creado: createdDate,
          CUFE: cufe,
          Gestion_Contabilidad: 'Por Aprobar',
          Aprobacion_Doliente: 'Por Aprobar',
          Procesado: 'false',
          updated_at: new Date().toISOString()
        }

        const { error: insertErr } = await supabase
          .from('Registro_Facturas')
          .insert(recordToInsert)

        if (insertErr) {
          summary.errors++
          summary.details.push({ ldf, error: insertErr.message })
          continue
        }

        summary.processed++
        summary.details.push({ ldf, status: 'inserted', id: generatedId, provider, amount: amountValue })

        if (markAsRead && notificationId) {
          try {
            const markReadUrl = `${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/MarkAsRead/${notificationId}/${CONSTANT_ID}/true`
            await fetch(markReadUrl, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` }
            })
          } catch (_readErr) {}
        }

      } catch (itemErr: any) {
        summary.errors++
        summary.details.push({ ldf, error: itemErr.message || 'Error desconocido' })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[sincronizar-con-facture] Error fatal en la Edge Function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
