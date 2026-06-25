import PocketBase from 'pocketbase';
import axios from 'axios';

const API_TOKEN = 'e9a9228d3a9f48b0952544fa76efd3c9'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';

// Credenciales directas de PocketHost
const ADMIN_EMAIL = 'nazaortiz001@hotmail.com'; 
const ADMIN_PASSWORD = 'Naza140501-';

const pb = new PocketBase(URL_POCKETBASE);

// Función para esperar un poco entre peticiones (evita saturar el server)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// MAPEO INTELIGENTE: Traduce los códigos de la FIFA al formato real de las banderas automáticamente
function obtenerCodigoBandera(tla) {
    if (!tla) return 'tbd';
    const mapa = {
        'ARG': 'ar', 'BRA': 'br', 'FRA': 'fr', 'GER': 'de', 'ESP': 'es', 
        'ENG': 'gb', 'NED': 'nl', 'POR': 'pt', 'BEL': 'be', 'CRO': 'hr', 
        'ITA': 'it', 'MEX': 'mx', 'USA': 'us', 'CAN': 'ca', 'JPN': 'jp', 
        'KOR': 'kr', 'KSA': 'sa', 'MAR': 'ma', 'SEN': 'sn', 'URU': 'uy', 
        'ECU': 'ec', 'COL': 'co', 'PER': 'pe', 'CHI': 'cl', 'AUS': 'au'
    };
    return mapa[tla.toUpperCase()] || tla.slice(0, 2).toLowerCase();
}

async function sincronizarMundial() {
    try {
        console.log("Iniciando sincronización...");
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        
        const respuestaApi = await axios.get(`https://api.football-data.org/v4/competitions/2000/matches`, {
            headers: { 'X-Auth-Token': API_TOKEN }
        });

        const partidosApi = respuestaApi.data.matches;
        
        // Filtro estricto: Solo de 16avos en adelante
        const partidosFiltrados = partidosApi.filter(p => p.stage !== 'GROUP_STAGE');
        
        for (const pApi of partidosFiltrados) {
            try {
                // Buscamos si el partido ya existe en nuestra base de datos
                const lista = await pb.collection('partidos').getList(1, 1, { filter: `api_id=${pApi.id}` });
                
                // Valores en tiempo real provenientes de la API de la FIFA
                const nombreEquip1 = pApi.homeTeam?.name || "Por definir";
                const nombreEquip2 = pApi.awayTeam?.name || "Por definir";
                const codBandera1 = obtenerCodigoBandera(pApi.homeTeam?.tla);
                const codBandera2 = obtenerCodigoBandera(pApi.awayTeam?.tla);

                if (lista.items.length > 0) {
                    const record = lista.items[0];
                    
                    // SOLUCIÓN TOTAL: Ahora cada 5 minutos el motor sobreescribe los nombres y códigos.
                    // Si cambia de "null" a un equipo real, impacta en la web inmediatamente de forma automática.
                    await pb.collection('partidos').update(record.id, {
                        equipo1: nombreEquip1,
                        equipo2: nombreEquip2,
                        codigo1: codBandera1,
                        codigo2: codBandera2,
                        goles1: Number(pApi.score?.fullTime?.home ?? 0),
                        goles2: Number(pApi.score?.fullTime?.away ?? 0),
                        estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                    });
                } else {
                    // Si el partido es nuevo, lo crea con los datos disponibles
                    await pb.collection('partidos').create({
                        api_id: pApi.id,
                        equipo1: nombreEquip1,
                        equipo2: nombreEquip2,
                        codigo1: codBandera1,
                        codigo2: codBandera2,
                        goles1: Number(pApi.score?.fullTime?.home ?? 0),
                        goles2: Number(pApi.score?.fullTime?.away ?? 0),
                        estado: pApi.status === 'FINISHED' ? 'finalizado' : (pApi.status === 'IN_PLAY' ? 'en_vivo' : 'pendiente')
                    });
                }
                await sleep(500); // Pausa de medio segundo para estabilidad del servidor
            } catch (err) {
                if (err.status !== 400) console.error("Error en partido:", pApi.id);
            }
        }
        console.log("Sincronización finalizada.");
    } catch (e) { 
        console.error("Error fatal en el motor:", e.message); 
    }
}

sincronizarMundial();
setInterval(sincronizarMundial, 300000); // Sincronización automática cada 5 minutos
