import PocketBase from 'pocketbase';
import axios from 'axios';

const API_TOKEN = 'TU_TOKEN_REAL'; // Mantené el tuyo
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';
const ADMIN_EMAIL = 'tu_correo@ejemplo.com'; // Mantené los tuyos
const ADMIN_PASSWORD = 'tu_contraseña';

const pb = new PocketBase(URL_POCKETBASE);

async function sincronizarMundial() {
    try {
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        const respuestaApi = await axios.get(`https://api.football-data.org/v4/competitions/2000/matches`, {
            headers: { 'X-Auth-Token': API_TOKEN }
        });

        const partidosApi = respuestaApi.data.matches;
        for (const pApi of partidosApi) {
            try {
                const registroPB = await pb.collection('partidos').getFirstListItem(`api_id=${pApi.id}`);
                
                // --- REGLA DE ORO: PROTECCIÓN DE NOMBRES ---
                // Solo actualizamos el nombre si el registro actual dice "Por definir" 
                // y la API trae un nombre nuevo.
                const nuevoEquipo1 = pApi.homeTeam?.name !== 'Por definir' ? pApi.homeTeam?.name : registroPB.equipo1;
                const nuevoEquipo2 = pApi.awayTeam?.name !== 'Por definir' ? pApi.awayTeam?.name : registroPB.equipo2;
                
                await pb.collection('partidos').update(registroPB.id, {
                    equipo1: nuevoEquipo1,
                    equipo2: nuevoEquipo2,
                    goles1: pApi.score?.fullTime?.home ?? 0,
                    goles2: pApi.score?.fullTime?.away ?? 0,
                    estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                });
            } catch (err) {
                // Si no existe, lo crea
                if (err.status === 404) {
                    await pb.collection('partidos').create({
                        api_id: pApi.id,
                        equipo1: pApi.homeTeam?.name || "Por definir",
                        equipo2: pApi.awayTeam?.name || "Por definir",
                        codigo1: pApi.homeTeam?.tla ? pApi.homeTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                        codigo2: pApi.awayTeam?.tla ? pApi.awayTeam.tla.slice(0, 2).toLowerCase() : "tbd",
                        estado: 'pendiente'
                    });
                }
            }
        }
    } catch (e) { console.error(e); }
}

setInterval(sincronizarMundial, 60000);
