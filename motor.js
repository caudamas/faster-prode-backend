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
        
        for (const pApi of partidosApi) {
            try {
                // Buscamos
                const lista = await pb.collection('partidos').getList(1, 1, { filter: `api_id=${pApi.id}` });
                
                if (lista.items.length > 0) {
                    const record = lista.items[0];
                    await pb.collection('partidos').update(record.id, {
                        goles1: Number(pApi.score?.fullTime?.home ?? 0),
                        goles2: Number(pApi.score?.fullTime?.away ?? 0),
                        estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                    });
                } else {
                    await pb.collection('partidos').create({
                        api_id: pApi.id,
                        equipo1: pApi.homeTeam?.name || "Por definir",
                        equipo2: pApi.awayTeam?.name || "Por definir",
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
