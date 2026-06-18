const invoices = [
  {
    ID: 50365,
    Nro_Factura: 'FE5456',
    Proveedor: 'MACANA DEL VECCHIO YULIETH ROCIO',
  },
  {
    ID: 50366,
    Nro_Factura: 'FE5455',
    Proveedor: 'MACANA DEL VECCHIO YULIETH ROCIO',
  },
  {
    ID: 50367,
    Nro_Factura: 'CVFE23465',
    Proveedor: 'COBRE Y VIDRIO SAS',
  },
  {
    ID: 50368,
    Nro_Factura: '1FE55333',
    Proveedor: 'INTERWORLD FREIGHT SAS',
  },
  {
    ID: 50369,
    Nro_Factura: 'M9833',
    Proveedor: 'GRUPO EMPRESARIAL MAXIASEO SAS',
  },
  {
    ID: 50370,
    Nro_Factura: 'FEP57',
    Proveedor: 'POCO COMUN SAS',
  },
  {
    ID: 50371,
    Nro_Factura: 'FCPT13231184',
    Proveedor: 'COLOMBIA MOVIL S A E S P',
  },
  {
    ID: 50372,
    Nro_Factura: 'FCPT13231639',
    Proveedor: 'COLOMBIA MOVIL S A E S P',
  },
  {
    ID: 50373,
    Nro_Factura: 'FV2870',
    Proveedor: 'corbox s.a.s',
  },
  {
    ID: 50374,
    Nro_Factura: '580831471473',
    Proveedor: 'COLOMBIA TELECOMUNICACIONES S A ESP',
  },
  {
    ID: 50382,
    Nro_Factura: '006152681',
    Proveedor: 'BANCO DE OCCIDENTE',
  }
];

async function assign() {
    console.log("Searching for Daniela Patiño...");
    let daniela;
    try {
        const searchRes = await fetch("http://localhost:3005/api/users/search?q=Daniela");
        const searchData = await searchRes.json();
        
        daniela = searchData.users?.find((u) => u.name.toLowerCase().includes("patiño"));
        if (!daniela) {
            console.log("Users found:", searchData.users);
            throw new Error("Could not find Daniela Patiño");
        }
        console.log("Found user:", daniela);
    } catch (e) {
        console.error("Error searching user:", e.message);
        return;
    }

    let successCount = 0;
    for (const inv of invoices) {
        console.log(`Assigning invoice ${inv.Nro_Factura} to ${daniela.name}...`);
        try {
            const body = {
                itemId: inv.ID,
                userEmail: daniela.email,
                userName: daniela.name,
                assignedByName: "Sistema/Asistente",
                invoiceNumber: inv.Nro_Factura,
                providerName: inv.Proveedor
            };
            const res = await fetch("http://localhost:3005/api/sharepoint/update-responsible", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                console.log(`✅ Success for ${inv.Nro_Factura}`);
                successCount++;
            } else {
                console.error(`❌ Failed for ${inv.Nro_Factura}:`, data.error);
            }
        } catch (e) {
            console.error(`❌ Error for ${inv.Nro_Factura}:`, e.message);
        }
    }
    console.log(`Finished assigning. ${successCount}/${invoices.length} successful.`);
}

assign();
