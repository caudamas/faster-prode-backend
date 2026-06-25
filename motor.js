import PocketBase from 'pocketbase';
import axios from 'axios';

// --- CONFIGURACIÓN ---
// El API_TOKEN es el único que dejamos fijo aquí
const API_TOKEN = 'e9a9228d3a9f48b0952544fa76efd3c9'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';

// Estas credenciales se leen desde el panel de Render (Environment Variables)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const pb = new PocketBase(URL_POCKETBASE);

async function sincronizarMundial() {
    try {
        console.log("Iniciando sincronización...");
        
        // Autenticación segura usando variables de entorno
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        
        const respuestaApi = await axios.get(`https://api.football-data.org/v4/competitions/2000/matches`, {
            headers: { 'X-Auth-Token': API_TOKEN }
        });

        const partidosApi = respuestaApi.data.matches;
        
        for (const pApi of partidosApi) {
            try {
                // Buscamos el partido en nuestra BD
                const registroPB = await pb.collection('partidos').getFirstListItem(`api_id=${pApi.id}`);
                
                // --- REGLA DE ORO: PROTECCIÓN DE NOMBRES ---
                // Solo actualizamos el nombre si el valor actual en la BD es "Por definir" 
                // Y la API de FIFA ya tiene un nombre real (no "Por definir")
                const nombreApi1 = pApi.homeTeam?.name || 'Por definir';
                const nombreApi2 = pApi.awayTeam?.name || 'Por definir';

                const nuevoEquipo1 = (registroPB.equipo1 === 'Por definir' || !registroPB.equipo1) && nombreApi1 !== 'Por definir' 
                    ? nombreApi1 
                    : registroPB.equipo1;
                    
                const nuevoEquipo2 = (registroPB.equipo2 === 'Por definir' || !registroPB.equipo2) && nombreApi2 !== 'Por definir' 
                    ? nombreApi2 
                    : registroPB.equipo2;
                
                // Actualizamos solo los datos que corresponden
                await pb.collection('partidos').update(registroPB.id, {
                    equipo1: nuevoEquipo1,
                    equipo2: nuevoEquipo2,
                    goles1: pApi.score?.fullTime?.home ?? 0,
                    goles2: pApi.score?.fullTime?.away ?? 0,
                    estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                });
                
            } catch (err) {
                // Si el partido no existe en la BD (Error 404), lo creamos
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
        console.log("Sincronización exitosa.");
    } catch (e) { 
        console.error("Error en sincronización:", e.message); 
    }
}

// Correr el motor cada 60 segundos
setInterval(sincronizarMundial, 60000);

// Ejecutar una vez al iniciar
sincronizarMundial();
