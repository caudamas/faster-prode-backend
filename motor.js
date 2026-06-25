import PocketBase from 'pocketbase';
import axios from 'axios';

// ==========================================
// CONFIGURACIÓN PRINCIPAL
// ==========================================
// Reemplaza esto con tu token real de football-data.org
const API_TOKEN = 'e9a9228d3a9f48b0952544fa76efd3c9'; 
const URL_POCKETBASE = 'https://fasterprode.pockethost.io/';

// Debes poner el email y contraseña del administrador de tu PocketBase
const ADMIN_EMAIL = 'nazaortiz001@hotmail.com';
const ADMIN_PASSWORD = 'Naza140501-';

const pb = new PocketBase(URL_POCKETBASE);

// ==========================================
// LÓGICA DE REPARTO DE PUNTOS AUTOMÁTICA
// ==========================================
async function repartirPuntos(partidoPBId, golesReales1, golesReales2) {
    console.log(`Calculando puntos para el partido ID: ${partidoPBId}...`);
    
    try {
        // 1. Buscar todas las predicciones hechas para este partido
        const predicciones = await pb.collection('predicciones').getFullList({
            filter: `partido = "${partidoPBId}"`,
            expand: 'usuario'
        });

        for (const pred of predicciones) {
            let puntosGanados = 0;
            const predG1 = pred.goles_eq1;
            const predG2 = pred.goles_eq2;

            // Lógica de cálculo
            if (predG1 === golesReales1 && predG2 === golesReales2) {
                puntosGanados = 10; // Exacto
            } else {
                const ganoEq1Pred = predG1 > predG2;
                const ganoEq2Pred = predG2 > predG1;
                const empatePred = predG1 === predG2;

                const ganoEq1Real = golesReales1 > golesReales2;
                const ganoEq2Real = golesReales2 > golesReales1;
                const empateReal = golesReales1 === golesReales2;

                if ((ganoEq1Pred && ganoEq1Real) || (ganoEq2Pred && ganoEq2Real) || (empatePred && empateReal)) {
                    puntosGanados = 5; // Tendencia
                }
            }

            if (puntosGanados > 0) {
                // Actualizar la predicción para dejar registro de lo que ganó
                await pb.collection('predicciones').update(pred.id, {
                    puntos_ganados: puntosGanados
                });

                // Sumarle los puntos al usuario (para el Ranking)
                const usuario = pred.expand.usuario;
                await pb.collection('users').update(usuario.id, {
                    puntos_totales: usuario.puntos_totales + puntosGanados
                });

                console.log(`[+] ${usuario.nombre} ganó ${puntosGanados} pts.`);
            }
        }
        console.log("Reparto de puntos finalizado exitosamente.");
    } catch (error) {
        console.error("Error al repartir puntos:", error);
    }
}

// ==========================================
// MOTOR LÓGICO DE SINCRONIZACIÓN
// ==========================================
async function sincronizarMundial() {
    console.log(`[${new Date().toLocaleTimeString()}] Sincronizando con FIFA...`);

    try {
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

        // Consultamos los partidos del Mundial (Código 2000 en la API)
        // Pedimos específicamente los de 16avos de final (LAST_32) y en adelante
        const respuestaApi = await axios.get(`https://api.football-data.org/v4/competitions/2000/matches`, {
            headers: { 'X-Auth-Token': API_TOKEN }
        });

        const partidosApi = respuestaApi.data.matches;

        if (!partidosApi || partidosApi.length === 0) {
            console.log("No hay datos de partidos disponibles.");
            return;
        }

        // Filtramos para procesar solo las fases finales (Ej. LAST_32 es 16avos)
        const fasesFinales = partidosApi.filter(p => 
            p.stage === 'LAST_32' || p.stage === 'LAST_16' || 
            p.stage === 'QUARTER_FINALS' || p.stage === 'SEMI_FINALS' || p.stage === 'FINAL'
        );

        for (const partidoApi of fasesFinales) {
            const apiId = partidoApi.id;
            
            let estadoLocal = 'pendiente';
            if (partidoApi.status === 'IN_PLAY' || partidoApi.status === 'PAUSED') {
                estadoLocal = 'en_vivo';
            } else if (partidoApi.status === 'FINISHED') {
                estadoLocal = 'finalizado';
            }

            const goles1 = partidoApi.score?.fullTime?.home ?? partidoApi.score?.regularTime?.home ?? 0;
            const goles2 = partidoApi.score?.fullTime?.away ?? partidoApi.score?.regularTime?.away ?? 0;

            const equipoHomeName = partidoApi.homeTeam?.name || "Por definir";
            const equipoAwayName = partidoApi.awayTeam?.name || "Por definir";
            const equipoHomeCode = partidoApi.homeTeam?.tla ? partidoApi.homeTeam.tla.slice(0, 2).toLowerCase() : "tbd";
            const equipoAwayCode = partidoApi.awayTeam?.tla ? partidoApi.awayTeam.tla.slice(0, 2).toLowerCase() : "tbd";
            
            // Damos un formato legible a la fecha
            const fechaObj = new Date(partidoApi.utcDate);
            const fechaFormateada = `${fechaObj.getDate()} Jun • ${fechaObj.getHours().toString().padStart(2, '0')}:${fechaObj.getMinutes().toString().padStart(2, '0')} hs`;

            try {
                // 1. Intentamos buscar si el partido ya fue auto-creado antes
                const registroPB = await pb.collection('partidos').getFirstListItem(`api_id=${apiId}`);

                // 2. Si existe, revisamos si hay cambios para no saturar la base de datos
                if (registroPB.goles1 !== goles1 || registroPB.goles2 !== goles2 || registroPB.estado !== estadoLocal || registroPB.equipo1 !== equipoHomeName) {
                    
                    await pb.collection('partidos').update(registroPB.id, {
                        equipo1: equipoHomeName,
                        equipo2: equipoAwayName,
                        codigo1: equipoHomeCode,
                        codigo2: equipoAwayCode,
                        goles1: goles1,
                        goles2: goles2,
                        estado: estadoLocal,
                        fecha: fechaFormateada
                    });
                    
                    console.log(`[UPDATE] ${equipoHomeName} ${goles1} - ${goles2} ${equipoAwayName} (${estadoLocal})`);

                    // 3. EVENTO CRÍTICO: El partido acaba de terminar en este ciclo
                    if (estadoLocal === 'finalizado' && registroPB.estado !== 'finalizado') {
                        await repartirPuntos(registroPB.id, goles1, goles2);
                    }
                }

            } catch (err) {
                // 4. AUTO-CREACIÓN: Si el partido no existe en PocketBase, el motor lo crea completamente solo.
                // Esto es lo que forma el fixture automáticamente a medida que la FIFA confirma los cruces.
                if (err.status === 404) {
                    console.log(`[NUEVO] Detectado partido de FIFA. Creando auto-registro: ${equipoHomeName} vs ${equipoAwayName}...`);
                    
                    await pb.collection('partidos').create({
                        api_id: apiId,
                        equipo1: equipoHomeName,
                        equipo2: equipoAwayName,
                        codigo1: equipoHomeCode,
                        codigo2: equipoAwayCode,
                        goles1: goles1,
                        goles2: goles2,
                        estado: estadoLocal,
                        fecha: fechaFormateada
                    });
                }
            }
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.error("[ERROR] Límite de peticiones de la API. Reintentando luego.");
        } else {
            console.error("[ERROR CRÍTICO]:", error.message);
        }
    }
}

// ==========================================
// BUCLE DE EJECUCIÓN (CRON)
// ==========================================
// Ejecuta el motor una vez inmediatamente
sincronizarMundial();

// Y luego lo deja corriendo de fondo cada 60 segundos
const INTERVALO_MS = 60000; 
setInterval(sincronizarMundial, INTERVALO_MS);

console.log(`🚀 Cerebro Automático Faster Prode INICIADO. Esperando eventos FIFA...`);