import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function POST(req: NextRequest) {
    try {
        const { itemId, userEmail, userName, listName = 'Registro_de_Facturas' } = await req.json();

        if (!itemId || !userEmail) {

            return NextResponse.json({ error: 'Missing itemId or userEmail' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        const listId = list.id;


        // 3. Resolve User Email to SharePoint User ID
        // Direct email updates often fail to persist in some SharePoint environments.
        // We find the user in the site's "User Information List" to get their integer ID.
        let userInfoRes;
        try {
            userInfoRes = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                .expand('fields($select=id,EMail,Title)')
                .filter(`fields/EMail eq '${userEmail}'`)
                .get();
        } catch (e: any) {
            console.warn('Filtered search failed, falling back to full list search:', e.message);
            // If the filtered search still fails, we'll try the full list search below
        }

        let sharepointUserId = null;
        if (userInfoRes && userInfoRes.value && userInfoRes.value.length > 0) {
            sharepointUserId = userInfoRes.value[0].id;
        } else {
            // Fallback: try searching by Title if email filter fails (sometimes EMail is not filterable)
            const allUsers = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
                .expand('fields($select=id,EMail,Title)')
                .get();
            const foundUser = allUsers.value.find((u: any) =>
                u.fields.EMail?.toLowerCase() === userEmail.toLowerCase() ||
                u.fields.Title?.toLowerCase() === userName?.toLowerCase()
            );
            if (foundUser) sharepointUserId = foundUser.id;
        }

        if (!sharepointUserId) {
            throw new Error(`No se encontró al usuario ${userEmail} en la lista de información del sitio. Es posible que el usuario deba ingresar al sitio de SharePoint al menos una vez.`);
        }

        // 4. Update the Item using individual PATCH attempts with LookupId
        let updated = false;
        const idFieldsToTry = [
            'ResponsabledeAutorizarLookupId', 
            'Responsable_de_AutorizarLookupId',
            'ResponsableAprobarLookupId'
        ];


        for (const fieldName of idFieldsToTry) {
            try {
                // When using LookupId, we PATCH it on the /fields sub-resource or fields property
                await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
                    [fieldName]: sharepointUserId
                });
                console.log(`Successfully updated ${fieldName} for item ${itemId} with ID ${sharepointUserId}`);
                updated = true;
                break;
            } catch (e: any) {
                console.warn(`Field ${fieldName} not recognized or error: ${e.message}`);
            }
        }

        if (!updated) {
            throw new Error('No se pudo actualizar el responsable en ningún campo conocido de SharePoint usando el ID del usuario.');
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating responsible:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
