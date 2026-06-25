import PocketBase from 'pocketbase';
import axios from 'axios';

const API_TOKEN = 'e9a9228d3a9f48b0952544fa76efd3c9'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';

// REEMPLAZÁ ESTO CON TU CORREO Y CONTRASEÑA REALES DE POCKETHOST
const ADMIN_EMAIL = 'nazaortiz001@hotmail.com'; 
const ADMIN_PASSWORD = 'Naza140501-';

const pb = new PocketBase(URL_POCKETBASE);

// Función para esperar un poco entre peticiones (evita saturar el server)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sincronizarMundial() {
    try {
        console.log("Iniciando sincronización...");
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        
        const respuestaApi = await axios.get(`https://api.football-data.org/v4/competitions/2000/matches`, {
            headers: { 'X-Auth-Token': API_TOKEN }
        });

        const partidosApi = respuestaApi.data.matches;
        
        // --- NUEVO FILTRO ESTRICTO: SOLO DE 16AVOS EN ADELANTE ---
        // Ignoramos todos los partidos que sean de Fase de Grupos ('GROUP_STAGE')
        const partidosFiltrados = partidosApi.filter(p => p.stage !== 'GROUP_STAGE');
        
        for (const pApi of partidosFiltrados) {
            try {
                // Buscamos
                const lista = await pb.collection('partidos').getList(1, 1, { filter: `api_id=${pApi.id}` });
                
                if (lista.items.length > 0) {
                    const record = lista.items[0];
                    
                    let dataActualizar = {
                        goles1: Number(pApi.score?.fullTime?.home ?? 0),
                        goles2: Number(pApi.score?.fullTime?.away ?? 0),
                        estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                    };

                    // ACTUALIZACIÓN AUTOMÁTICA DE CLASIFICADOS:
                    // Si en tu BD dice "Por definir" pero la FIFA ya confirmó qué país juega, se actualiza solo.
                    const nombreApi1 = pApi.homeTeam?.name || 'Por definir';
                    const nombreApi2 = pApi.awayTeam?.name || 'Por definir';

                    if (record.equipo1 === 'Por definir' && nombreApi1 !== 'Por definir') {
                        dataActualizar.equipo1 = nombreApi1;
                        dataActualizar.codigo1 = pApi.homeTeam?.tla ? pApi.homeTeam.tla.slice(0, 2).toLowerCase() : "tbd";
                    }
                    
                    if (record.equipo2 === 'Por definir' && nombreApi2 !== 'Por definir') {
                        dataActualizar.equipo2 = nombreApi2;
                        dataActualizar.codigo2 = pApi.awayTeam?.tla ? pApi.awayTeam.tla.slice(0, 2).toLowerCase() : "tbd";
                    }

                    await pb.collection('partidos').update(record.id, dataActualizar);
                } else {
                    await pb.collection('partidos').create({
                        api_id: pApi.id,
                        equipo1: pApi.homeTeam?.name || "Por definir",
                        equipo2: pApi.awayTeam?.name || "Por definir",
                        codigo1: pApi.homeTeam?.tla ? pApi.homeTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                        codigo2: pApi.awayTeam?.tla ? pApi.awayTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                        estado: 'pendiente'
                    });
                }
                await sleep(500); // Pausa de medio segundo para no saturar
            } catch (err) {
                // Ignoramos errores de duplicados, reportamos otros
                if (err.status !== 400) console.error("Error en partido:", pApi.id);
            }
        }
        console.log("Sincronización finalizada.");
    } catch (e) { 
        console.error("Error fatal en el motor:", e.message); 
    }
}

sincronizarMundial();
setInterval(sincronizarMundial, 300000); // Cambiado a 5 minutos (300,000ms) para que no moleste tanto
