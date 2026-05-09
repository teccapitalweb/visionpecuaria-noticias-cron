# 🐂 Visión Pecuaria — Cron de Noticias

Servicio que cada 6 horas trae noticias del sector pecuario desde NewsData.io y las guarda en Firestore.

## 🚀 DEPLOY EN RAILWAY

### 1. Crear repo en GitHub
- Crea repo nuevo en `teccapitalweb`: `visionpecuaria-noticias-cron`
- Sube los 3 archivos: `server.js`, `package.json`, `README.md`

### 2. Crear servicio en Railway
- Entra a railway.app → New Project → Deploy from GitHub repo
- Selecciona `teccapitalweb/visionpecuaria-noticias-cron`
- Railway detecta Node.js automáticamente

### 3. Variables de entorno (Variables tab en Railway)

| Variable | Valor |
|---|---|
| `NEWSDATA_API_KEY` | `pub_0e241a225e664d0c8e13129875265f78` |
| `FIREBASE_SERVICE_ACCOUNT_B64` | (ver paso 4) |
| `CRON_SECRET` | `visionpecuaria-cron-2026` (cualquier string secreto) |

### 4. Generar `FIREBASE_SERVICE_ACCOUNT_B64`

a) Ve a Firebase Console → proyecto `visionpecuaria-vip` → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada". Descarga el JSON.

b) Convierte a base64. En tu terminal local:

**Mac/Linux:**
```bash
base64 -i ruta/al/serviceAccountKey.json | tr -d '\n'
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ruta\al\serviceAccountKey.json"))
```

c) Copia el resultado completo (es una cadena larga) y pégalo como valor de `FIREBASE_SERVICE_ACCOUNT_B64` en Railway.

### 5. Generar dominio público
En Railway → Settings → Networking → Generate Domain. Te dan algo como `visionpecuaria-noticias-cron-production.up.railway.app`

### 6. Probar
- Abre `https://tu-dominio-railway.app/` → debe decir "🐂 Visión Pecuaria — Cron de Noticias activo"
- Forzar fetch manual: `https://tu-dominio-railway.app/refresh?secret=visionpecuaria-cron-2026`
- En 30-60 segundos verás noticias nuevas en Firestore Console (colección `noticias`)
- En el portal `teccapitalweb.github.io/VisionPecuaria/` deben aparecer en la sección "Noticias del rancho"

---

## 📊 LÍMITES Y COSTOS

- **NewsData.io free**: 200 requests/día. El cron usa 14 queries × 4 ejecuciones diarias = 56 requests/día. Sobra muchísimo.
- **Railway free tier**: 500 horas/mes ($5 de crédito gratis). Este servicio es muy ligero.
- **Firestore**: con 200 noticias guardadas y limpieza automática de las de más de 14 días, no llegamos ni al 1% del free tier.

---

## 🔧 ARQUITECTURA

```
NewsData.io API
      ↓
[Railway Cron] ←─ cada 6h
      ↓
Firestore /noticias
      ↓
Frontend Visión Pecuaria
```

- **Categorías**: Bovinos, Porcinos, Avícola, Mercados
- **Filtros**: solo noticias en español con imagen
- **Anti-duplicados**: ID determinístico por link
- **Limpieza**: borra noticias de más de 14 días automáticamente

---

## 🚨 TROUBLESHOOTING

**"No se ven noticias en el portal"**
1. Verifica logs en Railway → ¿corrió el cron?
2. Forza con `/refresh?secret=...`
3. Verifica Firestore Console → ¿hay docs en `noticias`?
4. Verifica reglas Firestore → debe permitir lectura autenticada

**"Error: FIREBASE_SERVICE_ACCOUNT_B64 inválido"**
- Asegúrate de que NO tenga saltos de línea (debe ser una sola línea larga)
- El JSON original debe tener `"type": "service_account"`

**"Cuota de NewsData.io excedida"**
- Espera 24h o sube a plan paid

---

Cambio y fuera 🐂
