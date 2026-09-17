import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INBOX_BASE_URL = "https://fone-reception-inbox-pro.azurewebsites.net"
const CONSTANT_ID = "0b409936-666f-4a61-8efd-a9c400d9fa7f"

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invoiceId, action = 'Aprobado', extraDetails } = await req.json()

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'invoiceId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[facture-event] Iniciando flujo Facture (${action}) para factura ID ${invoiceId}...`)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? 'https://zohdtksgxhbheaftgmsi.supabase.co'
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Obtener datos de la factura en Registro_Facturas
    const { data: invoice, error: fetchErr } = await supabase
      .from('Registro_Facturas')
      .select('ID, Nro_Factura, Nit, Proveedor, Responsable_de_Autorizar, Observaciones, Creado, FechaAprobacion')
      .eq('ID', Number(invoiceId))
      .single()

    if (fetchErr || !invoice) {
      console.error(`[facture-event] Factura ID ${invoiceId} no encontrada:`, fetchErr?.message)
      return new Response(
        JSON.stringify({ success: false, error: `Factura ID ${invoiceId} no encontrada en Registro_Facturas` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Limpiar Nro_Factura (quitar prefijos FAC/FE)
    const rawNroFactura = (invoice.Nro_Factura || '').trim()
    const cleanNroFactura = rawNroFactura.replace(/^(FAC|FE)[-_]?/i, '').trim()
    const nroFactura = cleanNroFactura || rawNroFactura
    const cleanNit = (invoice.Nit || '').split('-')[0].trim().replace(/\D/g, '')

    if (!rawNroFactura) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nro_Factura no disponible' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[facture-event] Factura: ${nroFactura} (raw: ${rawNroFactura}), NIT: ${cleanNit}, Acción: ${action}`)

    // 2. Autenticación en Facture
    const user = Deno.env.get('FACTURE_API_USER') ?? '890927404'
    const pass = Deno.env.get('FACTURE_API_PASSWORD') ?? '|uLuG&W@SDUdQ26'

    const loginRes = await fetch('https://api.facture.co/PLColab.Identity/Auth/Login', {
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

    console.log(`[facture-event] ✅ Autenticación exitosa en Facture`)

    // 3. Buscar LDF en el Inbox de Facture (con paginación hasta 5 páginas)
    let ldfString = ''
    try {
      const now = new Date()
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(now.getDate() - 90)
      const formatDate = (d: Date) => d.toISOString().split('T')[0] + 'T00:00:00.00'

      for (let page = 1; page <= 5; page++) {
        const inboxUrl = new URL(`${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`)
        inboxUrl.searchParams.append('receiverStartingDate', formatDate(ninetyDaysAgo))
        inboxUrl.searchParams.append('receiverEndingDate', formatDate(now))
        inboxUrl.searchParams.append('pageIndex', String(page))
        inboxUrl.searchParams.append('pageSize', '100')

        const inboxRes = await fetch(inboxUrl.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!inboxRes.ok) {
          console.warn(`[facture-event] Inbox página ${page} falló (${inboxRes.status})`)
          break
        }

        const inboxData = await inboxRes.json()
        const items: any[] = inboxData?.items || inboxData || []
        if (!items.length) {
          console.log(`[facture-event] Inbox página ${page}: 0 items, terminando búsqueda`)
          break
        }

        console.log(`[facture-event] Inbox página ${page}: ${items.length} items`)

        const match = items.find((i: any) => {
          const num = (i.number || i.documentCode || i.ldf || '').toUpperCase()
          const targetClean = cleanNroFactura.toUpperCase()
          const targetRaw = rawNroFactura.toUpperCase()
          return (targetClean && num.includes(targetClean)) || num.includes(targetRaw) || targetRaw.includes(num)
        })

        if (match && match.ldf) {
          ldfString = match.ldf
          console.log(`[facture-event] ✅ LDF encontrado en página ${page}: ${ldfString}`)
          break
        }
      }
    } catch (_e) {
      console.warn('[facture-event] Error buscando en Inbox:', _e)
    }

    // Fallback: construir LDF con verificación de múltiples fechas
    if (!ldfString) {
      const fechaBaseObj = invoice.Creado
      const baseDate = fechaBaseObj ? new Date(fechaBaseObj) : new Date()

      let validLdf = ''
      for (let offset = 0; offset <= 15; offset++) {
        const candidateDate = new Date(baseDate)
        candidateDate.setDate(baseDate.getDate() - offset)
        const dateStr = candidateDate.toISOString().split('T')[0]
        const candidateLdf = `FACTURA-UBL(${cleanNit};${nroFactura};${dateStr};PRINCIPAL;PRINCIPAL)`

        try {
          const testToken = btoa(candidateLdf)
          const testUrl = `https://reception-domain-service.facture.co/PLColab.Documents/Document/RECEIVEGOODS/${encodeURIComponent(testToken)}`
          const testRes = await fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'reception': 'true',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              motive: 'Otro',
              sourceDelivery: 'INBOX',
              canal: 'INBOX',
              medio: Deno.env.get('FACTURE_MEDIO_EMAIL') ?? 'recepcionfacturas@firplak.com',
              receiverDocumentType: 'CC',
              receiverDocumentNumber: '123456789',
              receiverName: 'Verificación',
              receiverLastName: 'Contabilidad',
              receiveDateTime: new Date().toISOString()
            })
          })

          const testJson = await testRes.json().catch(() => null)
          const errDesc = testJson?.eventItems?.[0]?.shortDescription || testJson?.message || ''

          if (testRes.ok || errDesc.includes('recibido') || errDesc.includes('aceptado') || errDesc.includes('reclamar')) {
            validLdf = candidateLdf
            console.log(`[facture-event] ✅ LDF verificado con fecha ${dateStr}: ${validLdf}`)
            break
          }
        } catch (_tErr) { /* ignore */ }
      }

      ldfString = validLdf || `FACTURA-UBL(${cleanNit};${nroFactura};${baseDate.toISOString().split('T')[0]};PRINCIPAL;PRINCIPAL)`
      console.log(`[facture-event] LDF final determinado: ${ldfString}`)
    }

    const documentTokenBase64 = btoa(ldfString)

    // 4. Si la acción es RECHAZADO:
    if (action === 'Rechazado') {
      const obsReason = extraDetails?.observaciones || invoice.Observaciones || 'Documento rechazado por el autorizador'
      console.log(`[facture-event] ❌ Emitiendo REJECT/V2 para ${nroFactura} con motivo: "${obsReason}"`)

      const rejectUrl = `https://reception-domain-service.facture.co/PLColab.Documents/Document/REJECT/V2/${encodeURIComponent(documentTokenBase64)}`

      const rejectRes = await fetch(rejectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://plataforma.facture.co',
          'Referer': 'https://plataforma.facture.co/',
          'reception': 'true',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          motive: 'Documento con inconsistencias',
          observation: obsReason,
          comments: obsReason,
          sourceDelivery: 'INBOX',
          canal: 'INBOX',
          medio: Deno.env.get('FACTURE_MEDIO_EMAIL') ?? '890927404@factureinbox.co',
          codigoMotivo: '01'
        })
      })

      const rejectData = await rejectRes.json().catch(() => null)
      console.log(`[facture-event] REJECT/V2 response (${rejectRes.status}):`, JSON.stringify(rejectData))

      return new Response(
        JSON.stringify({ success: rejectRes.ok, data: rejectData, ldf: ldfString }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Si la acción es APROBADO: RECEIVEGOODS + pausa + ACCEPT/V2
    const fullResponsableName = extraDetails?.responsableName || invoice.Responsable_de_Autorizar || 'Responsable Autorizador'
    const nameParts = fullResponsableName.trim().split(' ')
    const firstName = nameParts[0] || 'Aprobador'
    const lastName = nameParts.slice(1).join(' ') || 'Contabilidad'

    // PASO 1: RECEIVEGOODS (Evento 032 - Recibo de Bienes)
    console.log(`[facture-event] 📦 PASO 1: Emitiendo RECEIVEGOODS (032) para ${nroFactura}...`)
    const receiveUrl = `https://reception-domain-service.facture.co/PLColab.Documents/Document/RECEIVEGOODS/${encodeURIComponent(documentTokenBase64)}`
    const receiveRes = await fetch(receiveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://plataforma.facture.co',
        'Referer': 'https://plataforma.facture.co/',
        'reception': 'true',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        motive: 'Otro',
        sourceDelivery: 'INBOX',
        canal: 'INBOX',
        medio: Deno.env.get('FACTURE_MEDIO_EMAIL') ?? 'recepcionfacturas@firplak.com',
        receiverDocumentType: 'CC',
        receiverDocumentNumber: '123456789',
        receiverName: firstName,
        receiverLastName: lastName,
        receiverJobTitle: 'Responsable de Autorizar',
        receiverOrganizationDepartment: 'Contabilidad',
        receiveDateTime: new Date().toISOString()
      })
    })
    const receiveData = await receiveRes.json().catch(() => null)
    console.log(`[facture-event] RECEIVEGOODS response (${receiveRes.status}):`, JSON.stringify(receiveData))

    // PASO INTERMEDIO: Pausa obligatoria de 3 segundos para sincronización del Evento 032 en la DIAN
    console.log(`[facture-event] ⏳ Pausa de 3 segundos para sincronización obligatoria del Evento 032 en la DIAN...`)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // PASO 2: ACCEPT/V2 (Evento 033 - Aceptación Expresa)
    console.log(`[facture-event] ✔️ PASO 2: Emitiendo ACCEPT/V2 (033) para ${nroFactura}...`)
    const acceptUrl = `https://reception-domain-service.facture.co/PLColab.Documents/Document/ACCEPT/V2/${encodeURIComponent(documentTokenBase64)}`
    const acceptRes = await fetch(acceptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://plataforma.facture.co',
        'Referer': 'https://plataforma.facture.co/',
        'reception': 'true',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        motive: 'Aceptación',
        sourceDelivery: 'INBOX',
        canal: 'INBOX',
        medio: Deno.env.get('FACTURE_MEDIO_EMAIL') ?? 'recepcionfacturas@firplak.com'
      })
    })
    const acceptData = await acceptRes.json().catch(() => null)
    console.log(`[facture-event] ACCEPT/V2 response (${acceptRes.status}):`, JSON.stringify(acceptData))

    return new Response(
      JSON.stringify({
        success: true,
        ldf: ldfString,
        data: { receive: receiveData, accept: acceptData }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[facture-event] Error en Edge Function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
