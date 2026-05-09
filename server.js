// ════════════════════════════════════════════════════════════════
// VISIÓN PECUARIA — Cron de Noticias (Railway)
// Cada 6 horas trae noticias del sector pecuario desde NewsData.io
// y las guarda en Firestore (colección 'noticias')
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

// ─── Config ───
const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET || 'visionpecuaria-cron-secret-2026';

// ─── Categorías y queries ───
const CATEGORIAS = [
  {
    id: 'bovinos',
    queries: [
      'ganado bovino',
      'becerro precio',
      'leche produccion',
      'carne res mexico'
    ]
  },
  {
    id: 'porcinos',
    queries: [
      'porcicultura',
      'carne cerdo',
      'cerdo precio'
    ]
  },
  {
    id: 'avicola',
    queries: [
      'avicultura',
      'pollo produccion',
      'huevo precio'
    ]
  },
  {
    id: 'mercados',
    queries: [
      'SADER ganaderia',
      'precio ganado',
      'exportacion carne'
    ]
  }
];

// ─── Fetch a NewsData.io ───
async function fetchNoticias(query) {
  const url = new URL('https://newsdata.io/api/1/latest');
  url.searchParams.set('apikey', NEWSDATA_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('language', 'es');
  url.searchParams.set('size', '10');

  try {
    const r = await fetch(url.toString());
    if (!r.ok) {
      const txt = await r.text();
      console.warn(`[NewsData] HTTP ${r.status} para query "${query}": ${txt.substring(0,200)}`);
      return [];
    }
    const data = await r.json();
    return data.results || [];
  } catch (e) {
    console.error(`[NewsData] Error en query "${query}":`, e.message);
    return [];
  }
}

// ─── Normalizar y guardar en Firestore ───
async function guardarNoticias(noticias, categoria) {
  let guardadas = 0;
  let omitidas = 0;
  const batch = db.batch();
  const colRef = db.collection('noticias');

  for (const n of noticias) {
    if (!n.title || !n.link) continue;
    if (!n.image_url) continue; // solo con imagen para que se vea perro

    // ID determinístico para evitar duplicados (basado en link)
    const id = Buffer.from(n.link).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '').substring(0, 60);

    // Verificar si ya existe
    const existe = await colRef.doc(id).get();
    if (existe.exists) { omitidas++; continue; }

    const docData = {
      titulo: n.title,
      resumen: n.description || '',
      imagen: n.image_url,
      fuente: n.source_id || (new URL(n.link)).hostname.replace('www.', ''),
      link: n.link,
      categoria,
      fecha: n.pubDate ? admin.firestore.Timestamp.fromDate(new Date(n.pubDate))
                       : admin.firestore.FieldValue.serverTimestamp(),
      creado: admin.firestore.FieldValue.serverTimestamp()
    };

    batch.set(colRef.doc(id), docData);
    guardadas++;
  }

  if (guardadas > 0) await batch.commit();
  return { guardadas, omitidas };
}

// ─── Limpiar noticias viejas (más de 14 días) ───
async function limpiarViejas() {
  const limite = admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 86400000);
  const snap = await db.collection('noticias')
    .where('fecha', '<', limite)
    .limit(500)
    .get();

  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

// ─── Job principal ───
async function correrJob() {
  console.log('🐂 Iniciando job de noticias:', new Date().toISOString());
  let totalGuardadas = 0;
  let totalOmitidas = 0;

  for (const cat of CATEGORIAS) {
    for (const q of cat.queries) {
      const noticias = await fetchNoticias(q);
      const { guardadas, omitidas } = await guardarNoticias(noticias, cat.id);
      console.log(`  ${cat.id} · "${q}": +${guardadas} nuevas, ${omitidas} ya existían`);
      totalGuardadas += guardadas;
      totalOmitidas += omitidas;
      // Pausa de 1s entre queries para no saturar API
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const eliminadas = await limpiarViejas();
  console.log(`✅ Job terminado. Guardadas: ${totalGuardadas}, omitidas: ${totalOmitidas}, eliminadas viejas: ${eliminadas}`);
  return { totalGuardadas, totalOmitidas, eliminadas };
}

// ─── Express server ───
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🐂 Visión Pecuaria — Cron de Noticias activo');
});

app.get('/health', (req, res) => res.json({ ok: true, time: new Date() }));

// Endpoint manual para forzar fetch (con secret)
app.get('/refresh', async (req, res) => {
  if (req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Secret incorrecto' });
  }
  try {
    const result = await correrJob();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Error en /refresh:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Cron cada 6 horas ───
cron.schedule('0 */6 * * *', () => {
  correrJob().catch(err => console.error('Error en cron:', err));
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`🐂 Server escuchando en puerto ${PORT}`);
  console.log(`⏰ Cron programado: cada 6 horas`);
  // Correr una vez al arranque (con delay para que la app esté lista)
  setTimeout(() => {
    correrJob().catch(err => console.error('Error en arranque:', err));
  }, 5000);
});
