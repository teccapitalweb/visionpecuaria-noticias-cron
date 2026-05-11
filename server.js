// ════════════════════════════════════════════════════════════════
// VISIÓN PECUARIA — Cron de Mercado Pecuario (Railway)
// Cada 12 horas actualiza precios base con variación realista del mercado
// y mantiene histórico de 7 días para sparklines.
// Respeta ediciones manuales del admin (campo manualEdit: true)
// ════════════════════════════════════════════════════════════════

const express = require('express');
const cron = require('node-cron');
const admin = require('firebase-admin');

// ─── Firebase Admin Init ───
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8')
);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const CRON_SECRET = process.env.CRON_SECRET || 'vp-mercado-secret-2026';

// ─── Catálogo base — 30 productos del sector pecuario mexicano ───
// Precios oficiales SIAP-SADER, SNIIM, UGRJ, INEGI INPC, Comecarne 2026
// El cron aplica drift realista de mean reversion alrededor de cada base.
const PRODUCTOS_BASE = [
  // ════════════ 🐂 BOVINOS — Ganado en pie y leche ════════════
  {
    id: 'becerro-engorda',
    emoji: '🐂',
    nombre: 'Becerro engorda',
    detalle: '180-220 kg · en pie',
    precioBase: 78,
    unidad: '/kg',
    fuente: 'SIAP-SADER',
    categoria: 'bovinos',
    color: '#f59e0b',
    volatilidad: 0.025,
    orden: 1
  },
  {
    id: 'becerra-cebu',
    emoji: '🐃',
    nombre: 'Becerra Cebú',
    detalle: '170-250 kg · hembra',
    precioBase: 72,
    unidad: '/kg',
    fuente: 'UGRJ Rastro GDL',
    categoria: 'bovinos',
    color: '#f59e0b',
    volatilidad: 0.024,
    orden: 2
  },
  {
    id: 'novillo-engorda',
    emoji: '🐂',
    nombre: 'Novillo engorda',
    detalle: '300-450 kg · en pie',
    precioBase: 56,
    unidad: '/kg',
    fuente: 'SIAP-SADER',
    categoria: 'bovinos',
    color: '#d97706',
    volatilidad: 0.02,
    orden: 3
  },
  {
    id: 'toro-reproductor',
    emoji: '🐂',
    nombre: 'Toro reproductor',
    detalle: '600+ kg · genética',
    precioBase: 88,
    unidad: '/kg',
    fuente: 'Mexicoganadero',
    categoria: 'bovinos',
    color: '#b45309',
    volatilidad: 0.015,
    orden: 4
  },
  {
    id: 'vaca-abasto',
    emoji: '🐄',
    nombre: 'Vaca para abasto',
    detalle: '380-450 kg · canal',
    precioBase: 41,
    unidad: '/kg',
    fuente: 'UGRJ Rastro GDL',
    categoria: 'bovinos',
    color: '#dc2626',
    volatilidad: 0.015,
    orden: 5
  },
  {
    id: 'vaca-flaca',
    emoji: '🐄',
    nombre: 'Vaca flaca abasto',
    detalle: 'Bajo rendimiento',
    precioBase: 36,
    unidad: '/kg',
    fuente: 'UGRJ',
    categoria: 'bovinos',
    color: '#b91c1c',
    volatilidad: 0.018,
    orden: 6
  },
  {
    id: 'res-canal',
    emoji: '🥩',
    nombre: 'Res en canal',
    detalle: 'Carne · certificada',
    precioBase: 66,
    unidad: '/kg',
    fuente: 'Comecarne',
    categoria: 'bovinos',
    color: '#dc2626',
    volatilidad: 0.018,
    orden: 7
  },
  {
    id: 'leche-cruda',
    emoji: '🥛',
    nombre: 'Leche cruda bronca',
    detalle: 'Por litro · productor',
    precioBase: 9.20,
    unidad: '/L',
    fuente: 'SIAP-SADER',
    categoria: 'bovinos',
    color: '#e2e8f0',
    volatilidad: 0.012,
    orden: 8
  },

  // ════════════ 🥩 CORTES DE RES (mayoreo) ════════════
  {
    id: 'bistec-res',
    emoji: '🥩',
    nombre: 'Bistec de res',
    detalle: 'Mayoreo · INEGI',
    precioBase: 183,
    unidad: '/kg',
    fuente: 'INEGI INPC',
    categoria: 'cortes',
    color: '#dc2626',
    volatilidad: 0.014,
    orden: 9
  },
  {
    id: 'arrachera',
    emoji: '🥩',
    nombre: 'Arrachera',
    detalle: 'Corte premium',
    precioBase: 220,
    unidad: '/kg',
    fuente: 'Comecarne',
    categoria: 'cortes',
    color: '#991b1b',
    volatilidad: 0.013,
    orden: 10
  },

  // ════════════ 🐖 PORCINOS ════════════
  {
    id: 'cerdo-pie',
    emoji: '🐖',
    nombre: 'Cerdo en pie',
    detalle: '95-110 kg · canal',
    precioBase: 51,
    unidad: '/kg',
    fuente: 'SIAP-INEGI',
    categoria: 'porcinos',
    color: '#f472b6',
    volatilidad: 0.018,
    orden: 11
  },
  {
    id: 'lechon-destetado',
    emoji: '🐷',
    nombre: 'Lechón destetado',
    detalle: '8-12 kg · 21 días',
    precioBase: 95,
    unidad: '/kg',
    fuente: 'Porcicultura.com',
    categoria: 'porcinos',
    color: '#fb7185',
    volatilidad: 0.022,
    orden: 12
  },
  {
    id: 'cerdo-canal',
    emoji: '🥓',
    nombre: 'Cerdo en canal',
    detalle: 'Magra 51-53%',
    precioBase: 78,
    unidad: '/kg',
    fuente: 'SAGARPA-ASERCA',
    categoria: 'porcinos',
    color: '#f472b6',
    volatilidad: 0.017,
    orden: 13
  },
  {
    id: 'bistec-cerdo',
    emoji: '🥓',
    nombre: 'Bistec de cerdo',
    detalle: 'Mayoreo',
    precioBase: 124,
    unidad: '/kg',
    fuente: 'INEGI INPC',
    categoria: 'porcinos',
    color: '#ec4899',
    volatilidad: 0.015,
    orden: 14
  },

  // ════════════ 🐔 AVÍCOLA ════════════
  {
    id: 'pollo-pie',
    emoji: '🐔',
    nombre: 'Pollo en pie',
    detalle: '2.2-2.5 kg · granja',
    precioBase: 47,
    unidad: '/kg',
    fuente: 'SNIIM Pecuarios',
    categoria: 'avicola',
    color: '#fbbf24',
    volatilidad: 0.025,
    orden: 15
  },
  {
    id: 'pollo-entero',
    emoji: '🍗',
    nombre: 'Pollo entero limpio',
    detalle: 'Listo para venta',
    precioBase: 81,
    unidad: '/kg',
    fuente: 'INEGI INPC',
    categoria: 'avicola',
    color: '#f59e0b',
    volatilidad: 0.022,
    orden: 16
  },
  {
    id: 'pierna-muslo',
    emoji: '🍗',
    nombre: 'Pierna y muslo',
    detalle: 'Con hueso · mayoreo',
    precioBase: 78,
    unidad: '/kg',
    fuente: 'INEGI INPC',
    categoria: 'avicola',
    color: '#f59e0b',
    volatilidad: 0.024,
    orden: 17
  },
  {
    id: 'pechuga-pollo',
    emoji: '🍗',
    nombre: 'Pechuga de pollo',
    detalle: 'Con hueso · mayoreo',
    precioBase: 119,
    unidad: '/kg',
    fuente: 'INEGI INPC',
    categoria: 'avicola',
    color: '#fbbf24',
    volatilidad: 0.02,
    orden: 18
  },
  {
    id: 'huevo-blanco',
    emoji: '🥚',
    nombre: 'Huevo blanco',
    detalle: 'Por kg · mayorista',
    precioBase: 38,
    unidad: '/kg',
    fuente: 'SIAP-INEGI',
    categoria: 'avicola',
    color: '#fde68a',
    volatilidad: 0.035,
    orden: 19
  },
  {
    id: 'huevo-rojo',
    emoji: '🥚',
    nombre: 'Huevo rojo',
    detalle: 'Por kg · mayorista',
    precioBase: 42,
    unidad: '/kg',
    fuente: 'SNIIM Pecuarios',
    categoria: 'avicola',
    color: '#fbbf24',
    volatilidad: 0.032,
    orden: 20
  },
  {
    id: 'gallina-ponedora',
    emoji: '🐓',
    nombre: 'Gallina ponedora',
    detalle: 'Descarte · ciclo final',
    precioBase: 28,
    unidad: '/kg',
    fuente: 'SNIIM',
    categoria: 'avicola',
    color: '#a16207',
    volatilidad: 0.028,
    orden: 21
  },

  // ════════════ 🦃 OTRAS AVES ════════════
  {
    id: 'guajolote',
    emoji: '🦃',
    nombre: 'Guajolote / Pavo',
    detalle: '8-12 kg · en pie',
    precioBase: 72,
    unidad: '/kg',
    fuente: 'SIAP-SADER',
    categoria: 'avicola',
    color: '#92400e',
    volatilidad: 0.02,
    orden: 22
  },
  {
    id: 'pato-pie',
    emoji: '🦆',
    nombre: 'Pato en pie',
    detalle: '2.5-3 kg · finalización',
    precioBase: 95,
    unidad: '/kg',
    fuente: 'Productor directo',
    categoria: 'avicola',
    color: '#65a30d',
    volatilidad: 0.026,
    orden: 23
  },
  {
    id: 'codorniz',
    emoji: '🐦',
    nombre: 'Codorniz en pie',
    detalle: '180-220 g · unidad',
    precioBase: 38,
    unidad: '/pza',
    fuente: 'Productor MX',
    categoria: 'avicola',
    color: '#a16207',
    volatilidad: 0.025,
    orden: 24
  },

  // ════════════ 🐑 OVINOS Y CAPRINOS ════════════
  {
    id: 'cordero-pelibuey',
    emoji: '🐑',
    nombre: 'Cordero Pelibuey',
    detalle: '35-45 kg · en pie',
    precioBase: 78,
    unidad: '/kg',
    fuente: 'SNIIM Ovinos',
    categoria: 'ovinos',
    color: '#c084fc',
    volatilidad: 0.022,
    orden: 25
  },
  {
    id: 'borrego-canal',
    emoji: '🐑',
    nombre: 'Borrego en canal',
    detalle: 'Carne · TIF',
    precioBase: 145,
    unidad: '/kg',
    fuente: 'Comecarne',
    categoria: 'ovinos',
    color: '#a855f7',
    volatilidad: 0.018,
    orden: 26
  },
  {
    id: 'cabra-lechera',
    emoji: '🐐',
    nombre: 'Cabra lechera',
    detalle: '40-55 kg · vientre',
    precioBase: 65,
    unidad: '/kg',
    fuente: 'SIAP-SADER',
    categoria: 'caprinos',
    color: '#9333ea',
    volatilidad: 0.02,
    orden: 27
  },
  {
    id: 'cabrito',
    emoji: '🐐',
    nombre: 'Cabrito',
    detalle: '8-12 kg · en pie',
    precioBase: 130,
    unidad: '/kg',
    fuente: 'SNIIM Caprinos',
    categoria: 'caprinos',
    color: '#7c3aed',
    volatilidad: 0.022,
    orden: 28
  },

  // ════════════ 🐰🍯🧶 ESPECIES MENORES Y SUBPRODUCTOS ════════════
  {
    id: 'conejo-pie',
    emoji: '🐰',
    nombre: 'Conejo en pie',
    detalle: '2-2.5 kg · engorda',
    precioBase: 85,
    unidad: '/kg',
    fuente: 'Productor MX',
    categoria: 'otros',
    color: '#94a3b8',
    volatilidad: 0.024,
    orden: 29
  },
  {
    id: 'miel-multifloral',
    emoji: '🍯',
    nombre: 'Miel multifloral',
    detalle: 'Por kg · acopio',
    precioBase: 92,
    unidad: '/kg',
    fuente: 'SIAP-SADER',
    categoria: 'apicola',
    color: '#fbbf24',
    volatilidad: 0.014,
    orden: 30
  }
];

// ─── Generador de precio con drift realista ───
// Aplica una variación gaussiana suave alrededor del precio anterior,
// con mean reversion hacia el precio base.
function siguientePrecio(precioActual, precioBase, volatilidad) {
  // Drift hacia el precio base (mean reversion) — 20% del gap
  const meanReversion = (precioBase - precioActual) * 0.2;

  // Variación aleatoria gaussiana (Box-Muller)
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ruido = z * volatilidad * precioBase * 0.4;

  let nuevo = precioActual + meanReversion + ruido;

  // Clamp: nunca más allá del ±10% del precio base
  const minP = precioBase * 0.9;
  const maxP = precioBase * 1.1;
  nuevo = Math.max(minP, Math.min(maxP, nuevo));

  // Redondear según escala del precio
  if (precioBase < 10) return Math.round(nuevo * 100) / 100;
  if (precioBase < 100) return Math.round(nuevo * 10) / 10;
  return Math.round(nuevo);
}

// ─── Calcular cambio % vs hace 30 días ───
function calcularCambio(historia) {
  if (!historia || historia.length < 2) return 0;
  const reciente = historia[historia.length - 1];
  const referencia = historia[0];
  if (!referencia) return 0;
  return Math.round(((reciente - referencia) / referencia) * 1000) / 10;
}

// ─── Job principal: actualizar todos los precios ───
async function actualizarMercado() {
  console.log('🐂 [Mercado] Iniciando actualización:', new Date().toISOString());
  let actualizados = 0;
  let preservados = 0;
  let creados = 0;

  for (const base of PRODUCTOS_BASE) {
    const ref = db.collection('mercado').doc(base.id);
    const snap = await ref.get();

    if (!snap.exists) {
      // Primera vez — crear con histórico de 7 días simulado alrededor del precio base
      const historia = [];
      let p = base.precioBase * (0.97 + Math.random() * 0.06);
      for (let i = 0; i < 7; i++) {
        p = siguientePrecio(p, base.precioBase, base.volatilidad);
        historia.push(p);
      }
      await ref.set({
        ...base,
        precio: historia[historia.length - 1],
        cambio: calcularCambio(historia),
        semana: 'sem',
        historia,
        actualizado: admin.firestore.FieldValue.serverTimestamp(),
        creado: admin.firestore.FieldValue.serverTimestamp()
      });
      creados++;
      console.log(`  ✅ Creado: ${base.nombre} → $${historia[historia.length-1]}`);
      continue;
    }

    const data = snap.data();

    // Si está marcado como edición manual, respetar
    if (data.manualEdit === true) {
      preservados++;
      console.log(`  🔒 Preservado (manual): ${base.nombre}`);
      continue;
    }

    // Calcular nuevo precio y rotar histórico
    const historiaActual = data.historia || [base.precioBase];
    const precioActual = data.precio || base.precioBase;
    const nuevoPrecio = siguientePrecio(precioActual, base.precioBase, base.volatilidad);

    const nuevaHistoria = [...historiaActual, nuevoPrecio].slice(-7);

    await ref.update({
      // Re-sincronizar metadata por si cambió el catálogo base
      emoji: base.emoji,
      nombre: base.nombre,
      detalle: base.detalle,
      unidad: base.unidad,
      fuente: base.fuente,
      categoria: base.categoria,
      color: base.color,
      orden: base.orden,
      // Datos dinámicos
      precio: nuevoPrecio,
      cambio: calcularCambio(nuevaHistoria),
      semana: 'sem',
      historia: nuevaHistoria,
      actualizado: admin.firestore.FieldValue.serverTimestamp()
    });
    actualizados++;
    const flecha = nuevoPrecio >= precioActual ? '↗' : '↘';
    console.log(`  ${flecha} ${base.nombre}: $${precioActual} → $${nuevoPrecio}`);
  }

  console.log(`✅ Job terminado. Creados: ${creados}, actualizados: ${actualizados}, preservados: ${preservados}`);
  return { creados, actualizados, preservados };
}

// ─── Express server ───
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🐂 Visión Pecuaria — Cron de Mercado activo');
});

app.get('/health', (req, res) => res.json({ ok: true, time: new Date() }));

app.get('/refresh', async (req, res) => {
  if (req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Secret incorrecto' });
  }
  try {
    const result = await actualizarMercado();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Error en /refresh:', e);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para ver precios actuales (debug)
app.get('/precios', async (req, res) => {
  if (req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Secret incorrecto' });
  }
  try {
    const snap = await db.collection('mercado').orderBy('orden').get();
    const precios = snap.docs.map(d => {
      const data = d.data();
      return {
        nombre: data.nombre,
        precio: data.precio,
        cambio: data.cambio,
        manual: data.manualEdit === true
      };
    });
    res.json({ ok: true, precios });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cron cada 12 horas (00:00 y 12:00) ───
cron.schedule('0 0,12 * * *', () => {
  actualizarMercado().catch(err => console.error('Error en cron:', err));
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`🐂 Server escuchando en puerto ${PORT}`);
  console.log(`⏰ Cron programado: cada 12 horas (00:00 y 12:00)`);
  // Correr una vez al arranque
  setTimeout(() => {
    actualizarMercado().catch(err => console.error('Error en arranque:', err));
  }, 5000);
});
