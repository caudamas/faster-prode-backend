import PocketBase from 'pocketbase';
import axios from 'axios';

const API_TOKEN = 'e9a9228d3a9f48b0952544fa76efd3c9'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const pb = new PocketBase(URL_POCKETBASE);

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
                // Intentamos buscarlo primero
                const registroPB = await pb.collection('partidos').getFirstListItem(`api_id=${pApi.id}`);
                
                // Si existe, actualizamos
                await pb.collection('partidos').update(registroPB.id, {
                    equipo1: pApi.homeTeam?.name || "Por definir",
                    equipo2: pApi.awayTeam?.name || "Por definir",
                    goles1: Number(pApi.score?.fullTime?.home ?? 0),
                    goles2: Number(pApi.score?.fullTime?.away ?? 0),
                    estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                });
                
            } catch (err) {
                // Si da error 404, es porque no existe, así que lo creamos
                if (err.status === 404) {
                    try {
                        await pb.collection('partidos').create({
                            api_id: pApi.id,
                            equipo1: pApi.homeTeam?.name || "Por definir",
                            equipo2: pApi.awayTeam?.name || "Por definir",
                            codigo1: pApi.homeTeam?.tla ? pApi.homeTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                            codigo2: pApi.awayTeam?.tla ? pApi.awayTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                            estado: 'pendiente'
                        });
                    } catch (createErr) {
                        // AQUÍ ESTÁ LA MAGIA: Si el error es que el ID ya existe, no hacemos nada (es normal)
                        const errorMsg = JSON.stringify(createErr.response?.data || createErr);
                        if (!errorMsg.includes("unique")) {
                            console.error("ERROR REAL AL CREAR:", errorMsg);
                        }
                    }
                }
            }
        }
        console.log("Sincronización finalizada correctamente.");
    } catch (e) { 
        console.error("ERROR GLOBAL:", e.message); 
    }
}

sincronizarMundial();
setInterval(sincronizarMundial, 60000);
