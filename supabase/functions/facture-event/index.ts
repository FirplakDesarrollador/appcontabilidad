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
      return new Response(
        JSON.stringify({ success: false, error: `Factura ID ${invoiceId} no encontrada en Registro_Facturas` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nroFactura = (invoice.Nro_Factura || '').trim()
    const cleanNit = (invoice.Nit || '').split('-')[0].trim().replace(/\D/g, '')

    if (!nroFactura) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nro_Factura no disponible' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // 3. Obtener LDF
    let ldfString = ''
    try {
      const now = new Date()
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(now.getDate() - 60)
      const formatDate = (d: Date) => d.toISOString().split('T')[0] + 'T00:00:00.00'

      const inboxUrl = new URL(`${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`)
      inboxUrl.searchParams.append('receiverStartingDate', formatDate(sixtyDaysAgo))
      inboxUrl.searchParams.append('receiverEndingDate', formatDate(now))
      inboxUrl.searchParams.append('pageIndex', '1')
      inboxUrl.searchParams.append('pageSize', '100')

      const inboxRes = await fetch(inboxUrl.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (inboxRes.ok) {
        const inboxData = await inboxRes.json()
        const items: any[] = inboxData?.items || inboxData || []
        const match = items.find((i: any) => {
          const num = i.number || i.documentCode || i.ldf || ''
          return num.includes(nroFactura) || (cleanNit && i.supplierIdentification && i.supplierIdentification.includes(cleanNit))
        })
        if (match && match.ldf) {
          ldfString = match.ldf
        }
      }
    } catch (_e) {
      // Ignore inbox query errors and fallback
    }

    if (!ldfString) {
      const fechaStr = invoice.Creado ? new Date(invoice.Creado).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      ldfString = `FACTURA-UBL(${cleanNit};${nroFactura};${fechaStr};PRINCIPAL;PRINCIPAL)`
    }

    const documentTokenBase64 = btoa(ldfString)

    // 4. Si la acción es RECHAZADO:
    if (action === 'Rechazado') {
      const obsReason = extraDetails?.observaciones || invoice.Observaciones || 'Documento rechazado por el autorizador'
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

      return new Response(
        JSON.stringify({ success: rejectRes.ok, data: rejectData, ldf: ldfString }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Si la acción es APROBADO:
    const fullResponsableName = extraDetails?.responsableName || invoice.Responsable_de_Autorizar || 'Responsable Autorizador'
    const nameParts = fullResponsableName.trim().split(' ')
    const firstName = nameParts[0] || 'Aprobador'
    const lastName = nameParts.slice(1).join(' ') || 'Contabilidad'

    // Step A: RECEIVEGOODS
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

    // Step B: ACCEPT/V2
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

    return new Response(
      JSON.stringify({
        success: true,
        ldf: ldfString,
        data: { receive: receiveData, accept: acceptData }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in facture-event Edge Function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
