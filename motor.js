import PocketBase from 'pocketbase';
import axios from 'axios';

// TU NUEVA API KEY DE API-SPORTS YA CONFIGURADA
const API_TOKEN = 'cce0718210cacd7e8d55dbbebcd25bf1'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';

// REEMPLAZÁ ESTO CON TU CORREO Y CONTRASEÑA REALES DE POCKETHOST
const ADMIN_EMAIL = 'nazaortiz001@hotmail.com'; 
const ADMIN_PASSWORD = 'Naza140501-';

const pb = new PocketBase(URL_POCKETBASE);

// Función para esperar un poco entre peticiones (evita saturar el server)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// MAPEO INTELIGENTE ADAPTADO A API-SPORTS: 
// Esta API envía los nombres completos en lugar de códigos cortos, así que los mapeamos para las banderas.
function obtenerCodigoBandera(teamName) {
    if (!teamName || teamName === 'TBD' || teamName === 'Por definir') return 'tbd';
    const mapa = {
        'Argentina': 'ar', 'Brazil': 'br', 'France': 'fr', 'Germany': 'de', 'Spain': 'es', 
        'England': 'gb', 'Netherlands': 'nl', 'Portugal': 'pt', 'Belgium': 'be', 'Croatia': 'hr', 
        'Italy': 'it', 'Mexico': 'mx', 'USA': 'us', 'Canada': 'ca', 'Japan': 'jp', 
        'South Korea': 'kr', 'Saudi Arabia': 'sa', 'Morocco': 'ma', 'Senegal': 'sn', 'Uruguay': 'uy', 
        'Ecuador': 'ec', 'Colombia': 'co', 'Peru': 'pe', 'Chile': 'cl', 'Australia': 'au'
    };
    return mapa[teamName] || 'tbd';
}

async function sincronizarMundial() {
    try {
        console.log("Iniciando sincronización con API-Sports...");
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        
        // CONEXIÓN A API-SPORTS (Mundial es league 1, temporada 2026)
        const respuestaApi = await axios.get(`https://v3.football.api-sports.io/fixtures?league=1&season=2026`, {
            headers: { 'x-apisports-key': API_TOKEN }
        });

        // La nueva API devuelve los datos en el array 'response'
        const partidosApi = respuestaApi.data.response;
        
        // Filtro estricto: Solo de 16avos en adelante (Excluimos los que contengan 'Group')
        const partidosFiltrados = partidosApi.filter(p => !p.league.round.includes('Group'));
        
        for (const pApi of partidosFiltrados) {
            try {
                const apiId = pApi.fixture.id;
                const lista = await pb.collection('partidos').getList(1, 1, { filter: `api_id=${apiId}` });
                
                // LOG DE DIAGNÓSTICO: Veremos en Render exactamente qué países envía la API
                const nombreEquip1 = pApi.teams.home.name || "Por definir";
                const nombreEquip2 = pApi.teams.away.name || "Por definir";
                console.log(`Partido ${apiId} (${pApi.league.round}): Local -> ${nombreEquip1}, Visitante -> ${nombreEquip2}`);

                const codBandera1 = obtenerCodigoBandera(nombreEquip1);
                const codBandera2 = obtenerCodigoBandera(nombreEquip2);

                // Mapeo del estado del partido según API-Sports
                const statusShort = pApi.fixture.status.short;
                let estadoPartido = 'pendiente';
                if (['FT', 'AET', 'PEN'].includes(statusShort)) estadoPartido = 'finalizado';
                else if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT'].includes(statusShort)) estadoPartido = 'en_vivo';

                // Mapeo de los goles
                const golesLocal = pApi.score?.fulltime?.home ?? (pApi.goals?.home ?? 0);
                const golesVisitante = pApi.score?.fulltime?.away ?? (pApi.goals?.away ?? 0);

                if (lista.items.length > 0) {
                    const record = lista.items[0];
                    
                    await pb.collection('partidos').update(record.id, {
                        equipo1: nombreEquip1,
                        equipo2: nombreEquip2,
                        codigo1: codBandera1,
                        codigo2: codBandera2,
                        goles1: Number(golesLocal),
                        goles2: Number(golesVisitante),
                        estado: estadoPartido
                    });
                } else {
                    await pb.collection('partidos').create({
                        api_id: apiId,
                        equipo1: nombreEquip1,
                        equipo2: nombreEquip2,
                        codigo1: codBandera1,
                        codigo2: codBandera2,
                        goles1: Number(golesLocal),
                        goles2: Number(golesVisitante),
                        estado: estadoPartido
                    });
                }
                await sleep(500); 
            } catch (err) {
                if (err.status !== 400) console.error("Error en partido:", pApi.fixture?.id);
            }
        }
        console.log("Sincronización finalizada.");
    } catch (e) { 
        console.error("Error fatal en el motor:", e.message); 
    }
}

sincronizarMundial();
setInterval(sincronizarMundial, 300000);
