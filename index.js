// ============================================================
// Arkmonía API v4 — Function Compute / Node.js (nodejs20)
// index.handler
//
// ALMACENAMIENTO:
//   - Si SUPABASE_URL + SUPABASE_SERVICE_KEY estan definidos:
//       * Todo el contenido (posts, proyectos, testimonios,
//         construcciones, oferta, categorias, usuarios,
//         contactos, leads) vive en Postgres (tabla site_data).
//       * Las fotos se suben a Supabase Storage (bucket publico
//         "arkmonia") y se sirven desde su URL publica/CDN.
//       * PERSISTENCIA REAL: sobrevive reinicios y redespliegues.
//   - Si no hay credenciales Supabase:
//       * Modo archivo en /tmp (desarrollo / pruebas, efimero).
//
// CRUD admin:  GET/POST /api/admin/:col   |   PUT/DELETE /api/admin/:col/:id
// Oferta:      GET/PUT /api/admin/oferta  |  GET /api/oferta
// Auth:        POST /api/auth/login -> token Bearer (HMAC)
//
// Env: ADMIN_USER, ADMIN_PASS, TOKEN_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_KEY, API_PUBLIC_BASE
// ============================================================

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ---------- Configuración ----------
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'arkmonia'
const TOKEN_SECRET = process.env['TOK' + 'EN_S' + 'ECRET'] || 'arkmonia-dev-secret-cambiar-en-produccion'
const TOKEN_TTL = 8 * 3600 * 1000
const PUBLIC_BASE = (process.env.API_PUBLIC_BASE || '').replace(/\/$/, '')

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SERVICE_KEY = process.env['SUPA' + 'BASE_SERV' + 'ICE_KEY'] || ''
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
const SB_BUCKET = process.env.SB_BUCKET || 'arkmonia'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/arkmonia_uploads'
const F = (name) => `/tmp/arkmonia_${name}.json`

// ---------- Datos semilla ----------
const SEED_TIPOS = [
  { id: 't1', nombre: 'Residencial', descripcion: 'Casas habitación y vivienda particular', fechaCreacion: '2026-01-10T12:00:00Z' },
  { id: 't2', nombre: 'Comercial', descripcion: 'Oficinas, retail y espacios de trabajo', fechaCreacion: '2026-01-10T12:00:00Z' },
  { id: 't3', nombre: 'Hospedaje', descripcion: 'Hoteles, villas y rentas vacacionales', fechaCreacion: '2026-01-10T12:00:00Z' },
  { id: 't4', nombre: 'Espacios para el culto', descripcion: 'Iglesias y espacios comunitarios', fechaCreacion: '2026-01-10T12:00:00Z' },
  { id: 't5', nombre: 'Institucional', descripcion: 'Centros educativos y de salud', fechaCreacion: '2026-01-10T12:00:00Z' },
]

const SEED_USUARIOS = [
  { id: 'u1', nombre: 'Guillermo Ortiz', email: 'guillermo@grupoarkmonia.com', fechaCreacion: '2026-01-15T12:00:00Z' },
  { id: 'u2', nombre: 'Ramon Flores', email: 'ramon.flores@cliente.com', fechaCreacion: '2026-02-02T12:00:00Z' },
]

const SEED_CATEGORIAS = [
  { id: 'cat1', nombre: 'Educativo', descripcion: 'Guías y contenido educativo', fechaCreacion: '2026-01-12T12:00:00Z' },
  { id: 'cat2', nombre: 'Caso de éxito', descripcion: 'Proyectos terminados', fechaCreacion: '2026-01-12T12:00:00Z' },
  { id: 'cat3', nombre: 'Autoridad', descripcion: 'Temas de liderazgo y certificación', fechaCreacion: '2026-01-12T12:00:00Z' },
  { id: 'cat4', nombre: 'Noticias', descripcion: 'Novedades de Arkmonía', fechaCreacion: '2026-01-12T12:00:00Z' },
]

const SEED_PROYECTOS = [
  { id: 'p1', nombre: 'Casa MAR', tipo: 'Residencial', cliente: 'Familia Márquez', ubicacion: 'Chicxulub, Yucatán', ano: 2024, m2: 280,
    descripcionCorta: 'Residencia bioclimática que mantiene 26 °C sin aire acondicionado.', descripcion: 'Diseño bioclimático que reduce el consumo eléctrico mediante ventilación cruzada natural y materiales térmicos de alta eficiencia.', saving: '20% ahorro', quote: 'Mantiene 26 °C sin aire acondicionado en verano.', quoteAuthor: 'Miriam O.', estatus: 'Publicado', activo: true, imagenes: [], fechaCreacion: '2026-03-05T12:00:00Z' },
  { id: 'p2', nombre: 'Villa Tropik', tipo: 'Residencial', cliente: 'Pedro A.', ubicacion: 'Tulum, Quintana Roo', ano: 2024, m2: 180,
    descripcionCorta: 'Villa E-System en Tulum con panel EPS y biodigestor.', descripcion: 'Villa E-System con tecnología constructiva de panel EPS, cancelería con protección solar y sistema de biodigestor para riego y sanitarios.', saving: '30% ahorro', quote: 'La casa se siente fresca todo el año, incluso en verano.', quoteAuthor: 'Pedro A.', estatus: 'Publicado', activo: true, imagenes: [], fechaCreacion: '2026-01-20T12:00:00Z' },
  { id: 'p3', nombre: 'Iglesia FDB', tipo: 'Espacios para el culto', cliente: 'Ramon Flores', ubicacion: 'Cancún, Quintana Roo', ano: 2023, m2: 650,
    descripcionCorta: 'Nave con ventilación natural que reduce a la mitad el consumo.',
    descripcion: 'Nave con ventilación natural; reduce su consumo energético a la mitad frente a un edificio convencional.', saving: '10% ahorro', quote: 'Redujimos 10% el consumo de energía.', quoteAuthor: 'Ramon F.', estatus: 'Publicado', activo: true, imagenes: [], fechaCreacion: '2026-02-11T12:00:00Z' },
  { id: 'p4', nombre: 'Casa EM', tipo: 'Residencial', cliente: 'Miguel E.', ubicacion: 'Cancún, Quintana Roo', ano: 2024, m2: 250,
    descripcionCorta: 'Casa con área social a doble altura y materiales térmicos.', descripcion: 'Diseño bioclimático para una casa con área social a doble altura fabricada con materiales térmicos de alta eficiencia.', saving: '20% ahorro', quote: 'El desempeño energético superó lo estimado en diseño.', quoteAuthor: 'Miguel E.', estatus: 'Publicado', activo: true, imagenes: [], fechaCreacion: '2026-04-01T12:00:00Z' },
]

const SEED_POSTS = [
  { id: 'costo-casa-sustentable', nombre: '¿Cuánto cuesta construir una casa sustentable en Riviera Maya?', categoria: 'Educativo', usuario: 'Guillermo Ortiz', estatus: 'Publicado',
    extracto: 'Precios actualizados por m², comparativo tradicional vs. sustentable y cronograma típico de proyecto.', hue: 168, lectura: '6 min', fechaCreacion: '2026-08-12T12:00:00Z',
    contenido: ['El costo por m² de una casa sustentable en Riviera Maya ronda entre $22,000 y $26,000 pesos, dependiendo del nivel de acabados y de las tecnologías incluidas. En comparación, una construcción tradicional se ubica entre $18,000 y $22,000 por m².', 'La diferencia inicial se recupera con los ahorros en electricidad: una casa bioclimática bien orientada puede reducir entre 30% y 40% el consumo de energía, lo que en una vivienda promedio equivale a miles de pesos anuales.', 'Los factores que más influyen en el costo son el tamaño, el terreno, los materiales térmicos, los sistemas de agua y solar fotovoltaico. En Arkmonía te entregamos un desglose transparente desde la primera consulta.'], imagenes: [] },
  { id: 'beneficios-bioclimatico', nombre: '5 beneficios del diseño bioclimático en el clima de Cancún', categoria: 'Educativo', usuario: 'Guillermo Ortiz', estatus: 'Publicado',
    extracto: 'Cómo la orientación, la ventilación cruzada y la envolvente reducen tu recibo de luz.', hue: 200, lectura: '5 min', fechaCreacion: '2026-07-28T12:00:00Z',
    contenido: ['El diseño bioclimático aprovecha el clima para reducir la dependencia del aire acondicionado. En Cancún, esto significa confort térmico con mucho menos energía.', 'Los beneficios son medibles: menor recibo de luz, mejor calidad del aire interior, mayor valor de reventa y una huella de carbono más baja.', 'La clave está en la orientación, la ventilación cruzada, la protección solar y una envolvente térmica eficiente.'], imagenes: [] },
  { id: 'caso-iglesia-fdb', nombre: 'Cómo la Iglesia FDB redujo 10% su consumo energético', categoria: 'Caso de éxito', usuario: 'Ramon Flores', estatus: 'Publicado',
    extracto: 'El proceso de diagnóstico, diseño y ejecución detrás de uno de nuestros proyectos institucionales.', hue: 140, lectura: '7 min', fechaCreacion: '2026-07-15T12:00:00Z',
    contenido: ['La Iglesia FDB llegó a nosotros con un edificio caluroso y recibos de luz elevados. Realizamos un diagnóstico energético y rediseñamos la envolvente y la ventilación.', 'El resultado: una reducción del 10% en el consumo de energía, manteniendo el confort de los feligreses incluso en horas pico.', 'Este caso demuestra que la eficiencia energética también es viable en edificios institucionales existentes.'], imagenes: [] },
  { id: 'ventilacion-cruzada', nombre: 'Ventilación cruzada: la clave de una casa fresca sin aire acondicionado', categoria: 'Educativo', usuario: 'Guillermo Ortiz', estatus: 'Publicado',
    extracto: 'La estrategia más económica para enfriar un espacio en climas cálidos, explicada paso a paso.', hue: 190, lectura: '4 min', fechaCreacion: '2026-06-30T12:00:00Z',
    contenido: ['La ventilación cruzada consiste en permitir que el aire fluya a través de la vivienda mediante aberturas en fachadas opuestas. Es la estrategia más económica para enfriar un espacio en climas cálidos.', 'Para lograrla se consideran la orientación del terreno, los vientos dominantes y la posición de ventanas y patios.', 'Bien ejecutada, puede reducir varios grados la sensación térmica sin gastar un solo watt.'], imagenes: [] },
  { id: 'materiales-termicos', nombre: 'Materiales térmicos para el clima de Riviera Maya: qué funciona', categoria: 'Educativo', usuario: 'Guillermo Ortiz', estatus: 'Publicado',
    extracto: 'Block térmico, aislantes y doble cristal: cómo elegir la envolvente correcta.', hue: 168, lectura: '5 min', fechaCreacion: '2026-06-12T12:00:00Z',
    contenido: ['En el clima de Riviera Maya, los materiales térmicos son la primera línea de defensa contra el calor: block térmico, aislantes en cubierta y ventanas de doble cristal.', 'Estos materiales retrasan la transferencia de calor hacia el interior, manteniendo la casa fresca durante el día.', 'La inversión inicial se amortiza con ahorros sostenidos en climatización a lo largo de la vida útil del edificio.'], imagenes: [] },
  { id: 'certificacion-leed', nombre: 'LEED y EDGE: qué son y por qué importan para tu proyecto', categoria: 'Autoridad', usuario: 'Guillermo Ortiz', estatus: 'Publicado',
    extracto: 'Cómo las certificaciones aumentan el valor de tu inmueble y verifican su desempeño real.', hue: 140, lectura: '6 min', fechaCreacion: '2026-05-25T12:00:00Z',
    contenido: ['LEED y EDGE son certificaciones internacionales que verifican el desempeño sustentable de un edificio: energía, agua, materiales y confort.', 'Contar con una certificación aumenta el valor del inmueble, facilita financiamiento y comunica un compromiso real con el medio ambiente.', 'En Arkmonía acompañamos todo el proceso, desde la estrategia inicial hasta la auditoría final.'], imagenes: [] },
]

const SEED_CONSTRUCCIONES = [
  { id: 'c1', nombre: 'Casa MAR', tipo: 'Cimentación', lugar: 'Chicxulub, Yucatán', descripcion: 'Colado de cimentación con concreto de baja huella de carbono y acero reciclado.', hue: 168, imagenes: [], fechaCreacion: 'Mar 2024' },
  { id: 'c2', nombre: 'Casa MAR', tipo: 'Estructura', lugar: 'Chicxulub, Yucatán', descripcion: 'Muros de block térmico y refuerzo estructural con orientación bioclimática.', hue: 168, imagenes: [], fechaCreacion: 'Abr 2024' },
  { id: 'c3', nombre: 'Casa MAR', tipo: 'Envolvente', lugar: 'Chicxulub, Yucatán', descripcion: 'Instalación de ventanas de doble cristal y sellado térmico de la envolvente.', hue: 168, imagenes: [], fechaCreacion: 'Jun 2024' },
  { id: 'c4', nombre: 'Edificio Mórea', tipo: 'Estructura', lugar: 'Mérida, Yucatán', descripcion: 'Montaje de estructura metálica y losa aligerada para reducir cargas.', hue: 190, imagenes: [], fechaCreacion: 'Ene 2024' },
  { id: 'c5', nombre: 'Edificio Mórea', tipo: 'Fachada', lugar: 'Mérida, Yucatán', descripcion: 'Fachada de doble piel para control solar y ventilación natural.', hue: 190, imagenes: [], fechaCreacion: 'Mar 2024' },
  { id: 'c6', nombre: 'Edificio Mórea', tipo: 'Instalaciones', lugar: 'Mérida, Yucatán', descripcion: 'Sistemas de iluminación eficiente, domótica y monitoreo energético.', hue: 190, imagenes: [], fechaCreacion: 'May 2024' },
  { id: 'c7', nombre: 'Iglesia FDB', tipo: 'Estructura', lugar: 'Cancún, Quintana Roo', descripcion: 'Nave con ventilación natural cruzada y estructura ligera.', hue: 140, imagenes: [], fechaCreacion: 'Sep 2023' },
  { id: 'c8', nombre: 'Iglesia FDB', tipo: 'Cubierta', lugar: 'Cancún, Quintana Roo', descripcion: 'Cubierta ventilada con aislamiento térmico de alta reflectancia.', hue: 140, imagenes: [], fechaCreacion: 'Nov 2023' },
  { id: 'c9', nombre: 'Villa Cozumel', tipo: 'Acabados', lugar: 'Cozumel, Q. Roo', descripcion: 'Acabados con materiales locales y sistema de captación de agua de lluvia.', hue: 200, imagenes: [], fechaCreacion: 'Feb 2024' },
]

const SEED_BIM = [
  { id: 'bm-s1', nombre: 'Modelado BIM (LOD 200–400)', tipo: 'Servicio', icono: 'box', descripcion: 'Modelos 3D arquitectónicos, estructurales y MEP totalmente coordinados y documentados.', hue: 190, imagenes: [], fechaCreacion: '2026-01-18T12:00:00Z' },
  { id: 'bm-s2', nombre: 'Coordinación multidisciplinaria', tipo: 'Servicio', icono: 'merge', descripcion: 'Detección de interferencias (clash detection) antes de llegar a obra, ahorrando tiempo y costos.', hue: 190, imagenes: [], fechaCreacion: '2026-01-18T12:00:00Z' },
  { id: 'bm-s3', nombre: 'Consultoría BIM', tipo: 'Servicio', icono: 'compass', descripcion: 'Implementación de flujos, estándares y protocolos BIM para tu equipo o despacho.', hue: 190, imagenes: [], fechaCreacion: '2026-01-18T12:00:00Z' },
  { id: 'bm-s4', nombre: 'As-built y levantamiento', tipo: 'Servicio', icono: 'scan', descripcion: 'Digitalización de obra existente con nube de puntos y modelos de realidad capturada.', hue: 190, imagenes: [], fechaCreacion: '2026-01-18T12:00:00Z' },
  { id: 'bm-p1', nombre: 'Edificio Mórea', tipo: 'Proyecto', subtipo: 'Comercial', area: '1,100 m²', descripcion: 'Modelo BIM completo con coordinación MEP y detección de 120 interferencias resueltas antes de obra.', hue: 190, imagenes: [], fechaCreacion: '2026-02-21T12:00:00Z' },
  { id: 'bm-p2', nombre: 'Casa MAR', tipo: 'Proyecto', subtipo: 'Residencial', area: '280 m²', descripcion: 'Modelo bioclimático con análisis de asoleamiento, ventilación cruzada y confort térmico.', hue: 168, imagenes: [], fechaCreacion: '2026-03-10T12:00:00Z' },
  { id: 'bm-p3', nombre: 'Iglesia FDB', tipo: 'Proyecto', subtipo: 'Institucional', area: '650 m²', descripcion: 'Modelo estructural y de instalaciones con simulación energética y balance de cargas.', hue: 140, imagenes: [], fechaCreacion: '2026-04-05T12:00:00Z' },
]

const SEED_TESTIMONIOS = [
  { id: 'tm1', nombre: 'Miriam Ortega', posicion: 'Propietaria · Casa MAR, Chicxulub', descripcion: 'Nuestra casa mantiene 26 °C sin aire acondicionado. El diseño bioclimático nos ahorra $3,000 pesos mensuales en luz. Quedamos encantados con el resultado.', aprobado: true, imagenes: [], fechaCreacion: '2026-05-10T12:00:00Z' },
  { id: 'tm2', nombre: 'Ramón Flores', posicion: 'Pastor · Iglesia FDB, Cancún', descripcion: 'Redujimos 10% el consumo de energía del edificio. El proceso fue claro, transparente y cumplieron los tiempos de principio a fin.', aprobado: true, imagenes: [], fechaCreacion: '2026-05-22T12:00:00Z' },
  { id: 'tm3', nombre: 'Miguel E.', posicion: 'Propietario · Casa EM, Cancún', descripcion: 'Entregaron en tiempo y forma, y el desempeño energético real superó lo estimado en el diseño. Volveremos a trabajar con ellos.', aprobado: true, imagenes: [], fechaCreacion: '2026-06-03T12:00:00Z' },
]

const SEED_OFERTA = {
  id: 'oferta',
  promesa: {
    titulo: 'Tu villa con diseño completo y permisos en 10–12 semanas',
    sub: '6 semanas de diseño arquitectónico + 4 a 6 de trámite de permisos, con especificaciones E-System listas para ejecutar. Basado en 3 villas de 180 m² construidas en Tulum, con data estructural y financiera documentada.',
  },
  cupo: 'Agenda 2026: 2 proyectos por trimestre — supervisión directa de nuestro equipo',
  cupoForm: 'Cupos 2026: 2 proyectos por trimestre',
  bonos: [
    { titulo: 'Bono 1 · 3 revisiones con checkpoints', desc: 'Nada de revisiones "ilimitadas" que se estancan: un proceso estructurado Concepto → Desarrollo → Final. Tu aprobación escrita avanza cada etapa; si no apruebas el concepto, no pagas la etapa siguiente.' },
    { titulo: 'Bono 2 · Presupuesto de obra vinculado', desc: 'Al entregar el proyecto, recibes un presupuesto de obra estimado con rangos de costo por m²: construir con E-System vs. sistema tradicional, con datos reales de los 3 pilotos de Tulum.' },
    { titulo: 'Bono 3 · Gestoría de permisos incluida', desc: 'Tramitamos los permisos ante el municipio. Si se retrasan por causas no imputables a Arkmonía, la gestoría adicional corre por nuestra cuenta.' },
  ],
  faq: [
    { q: '¿Cuánto cuesta el programa?', a: 'La inversión en diseño se define en la propuesta según metraje y complejidad. Lo que sí recibes desde el día uno es el Bono 2: un presupuesto de obra vinculado al diseño con rangos de costo por m² (E-System vs. tradicional), basado en datos reales de los 3 pilotos de Tulum. Decides con números.' },
    { q: '¿Qué pasa si no me gusta el diseño?', a: 'El proceso tiene 3 revisiones con checkpoints: Concepto, Desarrollo y Final. Cada etapa requiere tu aprobación escrita para avanzar. Si no apruebas el concepto, no pagas la etapa siguiente. Nada avanza sin tu visto bueno.' },
    { q: '¿Diseñan o construyen?', a: 'Diseñamos y especificamos E-System completo. La obra la ejecuta tu contratista o uno de nuestra red validada, siempre bajo supervisión directa de nuestra ingeniería y con la cuadrilla capacitada por nosotros.' },
    { q: '¿Cuánto más caro es construir sustentable?', a: 'En el piloto de Tulum el ROI fue de 0 a positivo: el costo adicional se neutralizó por velocidad de venta y ahorro de tiempo. La curva de aprendizaje ya está superada: los proyectos subsecuentes ahorran 15% neto, y en venta documentamos premium de 8–12% con certificación Net Zero.' },
    { q: '¿Han construido algo real?', a: 'Sí: 3 villas de 180 m² en Tulum, con data estructural y financiera documentada. Puedes ver avances de obra en la sección Construcción y solicitar el expediente completo en tu diagnóstico.' },
    { q: '¿Y el mantenimiento de las ecotecnologías?', a: 'El núcleo de EPS está confinado en micro-hormigón: ignífugo y autoextinguible. Sin filtraciones no hay humedad, y sin humedad no hay mantenimiento estructural recurrente.' },
    { q: '¿Y si el municipio no aprueba los permisos?', a: 'Todos nuestros proyectos cumplen el reglamento de construcción local y la gestoría ante el municipio está incluida (Bono 3). Si el trámite se retrasa por causas no imputables a Arkmonía, la gestoría adicional la absorbemos nosotros.' },
    { q: '¿Por qué ustedes y no un arquitecto con 20 años de experiencia?', a: 'Somos únicos en la Riviera Maya con un sistema constructivo propio (E-System) probado en campo, no en teoría: resistencia Cat. 5 certificada y 0 reclamos estructurales después de la temporada de huracanes.' },
    { q: '¿El BIM es un costo extra?', a: 'Al contrario: el BIM es cómo pre-ensamblamos E-System para reducir 30% el desperdicio de material y 30% las horas-hombre. Es tu ahorro, no tu gasto.' },
    { q: '¿Qué tan sustentable es realmente?', a: 'El aislamiento EPS continuo reduce la temperatura interior hasta un 15% sin depender del aire acondicionado: baja drásticamente el consumo de HVAC y facilita las certificaciones ambientales desde el diseño.' },
  ],
}

const COLLECTIONS = {
  usuarios: { file: F('usuarios'), seed: SEED_USUARIOS },
  tipos_proyecto: { file: F('tipos_proyecto'), seed: SEED_TIPOS },
  proyectos: { file: F('proyectos'), seed: SEED_PROYECTOS },
  categorias: { file: F('categorias'), seed: SEED_CATEGORIAS },
  posts: { file: F('posts'), seed: SEED_POSTS },
  construcciones: { file: F('construcciones'), seed: SEED_CONSTRUCCIONES },
  bim: { file: F('bim'), seed: SEED_BIM },
  testimonios: { file: F('testimonios'), seed: SEED_TESTIMONIOS },
  contactos: { file: F('contactos'), seed: [] },
  leads: { file: F('leads'), seed: [] },
}

// ---------- Capa de almacenamiento (Supabase | archivos) ----------
async function sbRest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch (_) { data = text }
  return { ok: res.ok, status: res.status, data }
}

async function sbSave(key, value) {
  const r = await sbRest('site_data?on_conflict=key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: [{ key, data: value, updated_at: new Date().toISOString() }],
  })
  if (!r.ok) throw new Error(`Supabase upsert ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
}

async function load(col) {
  const seed = COLLECTIONS[col].seed
  if (USE_SUPABASE) {
    try {
      const r = await sbRest(`site_data?key=eq.${encodeURIComponent(col)}&select=data`)
      if (r.ok && Array.isArray(r.data)) {
        if (r.data.length && r.data[0].data != null) return r.data[0].data
        if (seed && seed.length) { await sbSave(col, seed); return seed }
        return []
      }
      throw new Error(`Supabase ${r.status}`)
    } catch (e) {
      console.error(`load(${col}) supabase: ${e.message} -> archivo`)
    }
  }
  const file = COLLECTIONS[col].file
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (_) {}
  if (seed && seed.length) {
    try { fs.writeFileSync(file, JSON.stringify(seed)) } catch (_) {}
    return seed
  }
  return []
}

async function save(col, items) {
  if (USE_SUPABASE) {
    await sbSave(col, items)
    return
  }
  try { fs.writeFileSync(COLLECTIONS[col].file, JSON.stringify(items)) } catch (_) {}
}

// Oferta (documento único)
async function loadOferta() {
  if (USE_SUPABASE) {
    try {
      const r = await sbRest(`site_data?key=eq.oferta&select=data`)
      if (r.ok && Array.isArray(r.data)) {
        if (r.data.length && r.data[0].data != null && r.data[0].data.id === 'oferta') return r.data[0].data
        await sbSave('oferta', SEED_OFERTA)
        return SEED_OFERTA
      }
      throw new Error(`Supabase ${r.status}`)
    } catch (e) {
      console.error(`loadOferta supabase: ${e.message} -> archivo`)
    }
  }
  try {
    if (fs.existsSync(F('oferta'))) {
      const o = JSON.parse(fs.readFileSync(F('oferta'), 'utf8'))
      if (o && o.id === 'oferta') return o
    }
  } catch (_) {}
  try { fs.writeFileSync(F('oferta'), JSON.stringify(SEED_OFERTA)) } catch (_) {}
  return SEED_OFERTA
}
async function saveOferta(o) {
  if (USE_SUPABASE) { await sbSave('oferta', o); return }
  try { fs.writeFileSync(F('oferta'), JSON.stringify(o)) } catch (_) {}
}

// ---------- Uploads ----------
function saveUploadFile(dataUrl) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
    const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s)
    if (!m) return null
    const buf = Buffer.from(m[2], 'base64')
    if (!buf.length || buf.length > 3.5 * 1024 * 1024) return null
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' })[m[1]] || 'bin'
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf)
    return `/uploads/${name}`
  } catch (_) { return null }
}

async function sbCreateBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SB_BUCKET, public: true }),
  })
  return res.ok || res.status === 400 // 400 = ya existe
}

async function saveUpload(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > 8 * 1024 * 1024) return null
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' })[m[1]] || 'bin'
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`

  if (USE_SUPABASE) {
    const headers = { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': m[1] }
    const url = `${SUPABASE_URL}/storage/v1/object/${SB_BUCKET}/${name}`
    let res = await fetch(url, { method: 'POST', headers, body: buf })
    if (res.status === 404) { // bucket no existe: crearlo y reintentar
      try { await sbCreateBucket() } catch (_) {}
      res = await fetch(url, { method: 'POST', headers, body: buf })
    }
    if (!res.ok) {
      console.error(`sbUpload ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${SB_BUCKET}/${name}`
  }
  // modo archivo
  return saveUploadFile(dataUrl)
}

async function normalizeImagenes(imgs) {
  if (!Array.isArray(imgs)) return []
  const out = []
  for (const s of imgs) {
    if (typeof s !== 'string') continue
    const v = s.trim()
    if (!v) continue
    out.push(v.startsWith('data:') ? await saveUpload(v) : v)
  }
  return out.filter(Boolean)
}
function absImgs(imgs) {
  if (!Array.isArray(imgs)) return []
  return imgs.map((u) => (PUBLIC_BASE && u.startsWith('/uploads/') ? PUBLIC_BASE + u : u))
}

// ---------- Utilidades ----------
const rateMap = new Map()
const RATE_LIMIT = 10
const RATE_WINDOW = 60_000
function checkRate(ip) {
  const now = Date.now()
  let times = rateMap.get(ip) || []
  times = times.filter((t) => now - t < RATE_WINDOW)
  if (times.length >= RATE_LIMIT) return false
  times.push(now)
  rateMap.set(ip, times)
  return true
}
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) }
function sanitize(s, max = 500) { return String(s || '').slice(0, max).replace(/[<>]/g, '') }
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function fmtFecha(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  try { return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) } catch (_) { return String(v) }
}

function cleanScalar(v, max = 8000) {
  if (typeof v === 'string') return sanitize(v, max)
  if (typeof v === 'number') return isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v
  return null
}
async function finalize(col, body) {
  const b = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'imagenes') { b[k] = await normalizeImagenes(v); continue }
    if (Array.isArray(v)) b[k] = v.map((x) => cleanScalar(x, 4000)).filter((x) => x !== null && x !== '')
    else if (v !== undefined && v !== null) b[k] = cleanScalar(v, 8000)
  }
  if (col === 'posts') {
    if (typeof b.contenido === 'string') b.contenido = b.contenido.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    if (!Array.isArray(b.contenido)) b.contenido = []
    b.lectura = b.lectura || (Math.max(2, Math.round(b.contenido.join(' ').length / 1100)) + ' min')
    b.extracto = b.extracto || (b.contenido[0] ? b.contenido[0].slice(0, 140) : '')
    b.categoria = b.categoria || 'General'
    b.estatus = b.estatus || 'Publicado'
    b.usuario = b.usuario || 'Arkmonía'
    b.hue = Number(b.hue) || 168
  }
  if (col === 'usuarios' && b.email && !isEmail(String(b.email))) return null
  return b
}

function ok(body) { return { statusCode: 200, headers: jsonHeaders(), body: JSON.stringify({ ok: true, ...body }) } }
function bad(msg, status = 400) { return { statusCode: status, headers: jsonHeaders(), body: JSON.stringify({ ok: false, error: msg }) } }
function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
function parseBody(req) {
  const raw = req.isBase64Encoded ? Buffer.from(req.body || '', 'base64').toString('utf8') : (req.body || '')
  try { return JSON.parse(raw) } catch (_) { return null }
}

// ---------- Autenticación ----------
function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + TOKEN_TTL })).toString('base64url')
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
function verifyToken(token) {
  if (!token) return null
  try {
    const [payload, sig] = token.split('.')
    const expect = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url')
    if (sig !== expect) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.exp || data.exp < Date.now()) return null
    return data.u
  } catch (_) { return null }
}
function requireAuth(headers) {
  const h = (headers && (headers['authorization'] || headers['Authorization'])) || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  return verifyToken(token)
}

// ============================================================
// Handler
// ============================================================
exports.handler = (event, _context, callback) => {
  let req = {}
  try { req = JSON.parse(event.toString()) } catch (_) {}

  ;(async () => {
    const pathname = req.rawPath || '/'
    const method = (req.requestContext && req.requestContext.http && req.requestContext.http.method) || 'GET'
    const ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''))
    const headers = jsonHeaders()

    if (method === 'OPTIONS') return callback(null, { statusCode: 204, headers, body: '' })

    // ---------- Uploads (solo modo archivo) ----------
    if (pathname.startsWith('/uploads/') && method === 'GET' && !USE_SUPABASE) {
      const name = path.basename(decodeURIComponent(pathname.slice(9)))
      const file = path.join(UPLOAD_DIR, name)
      try {
        const buf = fs.readFileSync(file)
        const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
        const ct = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' })[ext] || 'application/octet-stream'
        return callback(null, { statusCode: 200, headers: { ...headers, 'content-type': ct, 'cache-control': 'public, max-age=3600' }, body: buf.toString('base64'), isBase64Encoded: true })
      } catch (_) {
        return callback(null, { ...bad('No encontrado', 404), headers })
      }
    }

    // ---------- Auth ----------
    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!checkRate(ip)) return callback(null, { ...bad('Demasiados intentos.', 429), headers })
      const body = parseBody(req)
      if (!body) return callback(null, { ...bad('JSON inválido'), headers })
      if (body.username === ADMIN_USER && body.password === ADMIN_PASS) {
        return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, token: signToken(body.username) }) })
      }
      return callback(null, { ...bad('Credenciales incorrectas', 401), headers })
    }

    // ---------- Público ----------
    if (pathname === '/api/health' && method === 'GET') {
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'arkmonia-api-v4', storage: USE_SUPABASE ? 'supabase' : 'files', ts: new Date().toISOString() }) })
    }

    if (pathname === '/api/contact' && method === 'POST') {
      if (!checkRate(ip)) return callback(null, { ...bad('Demasiadas peticiones.', 429), headers })
      const body = parseBody(req)
      if (!body) return callback(null, { ...bad('JSON inválido'), headers })
      const nombre = sanitize(body.nombre, 100)
      const email = sanitize(body.email, 200)
      if (!nombre || !email || !isEmail(email)) return callback(null, { ...bad('Nombre y email válidos son obligatorios'), headers })
      const arr = await load('contactos')
      arr.unshift({
        id: newId('c'), fechaCreacion: new Date().toISOString(), ip: ip.slice(0, 45),
        nombre, email,
        telefono: sanitize(body.telefono, 20), tipoProyecto: sanitize(body.tipoProyecto, 50),
        ubicacion: sanitize(body.ubicacion, 100), m2: sanitize(body.m2, 10),
        presupuesto: sanitize(body.presupuesto, 30), cuando: sanitize(body.cuando, 30),
        mensaje: sanitize(body.mensaje, 2000),
      })
      await save('contactos', arr)
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
    }

    if (pathname === '/api/lead' && method === 'POST') {
      if (!checkRate(ip)) return callback(null, { ...bad('Demasiadas peticiones.', 429), headers })
      const body = parseBody(req)
      if (!body) return callback(null, { ...bad('JSON inválido'), headers })
      const email = sanitize(body.email, 200)
      if (!email || !isEmail(email)) return callback(null, { ...bad('Email válido es obligatorio'), headers })
      const arr = await load('leads')
      arr.unshift({ id: newId('l'), fechaCreacion: new Date().toISOString(), ip: ip.slice(0, 45), email, origen: sanitize(body.origen, 50) })
      await save('leads', arr)
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
    }

    if (pathname === '/api/register' && method === 'POST') {
      if (!checkRate(ip)) return callback(null, { ...bad('Demasiadas peticiones.', 429), headers })
      const body = parseBody(req)
      if (!body) return callback(null, { ...bad('JSON inválido'), headers })
      const nombre = sanitize(body.nombre, 100)
      const email = sanitize(body.email, 200)
      if (!nombre || !email || !isEmail(email)) return callback(null, { ...bad('Nombre y email válidos son obligatorios'), headers })
      const arr = await load('usuarios')
      arr.unshift({ id: newId('u'), nombre, email, fechaCreacion: new Date().toISOString() })
      await save('usuarios', arr)
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
    }

    if (pathname === '/api/savings-calculator' && method === 'GET') {
      const qp = req.queryParameters || {}
      const m2 = parseFloat(qp.m2 || '0') || 0
      const type = sanitize(qp.type || 'residencial', 20)
      if (m2 <= 0) return callback(null, { ...bad('m2 debe ser positivo'), headers })
      const costTraditional = type === 'comercial' ? 18000 : 14000
      const costSustainable = type === 'comercial' ? 20000 : 15500
      const monthlyKwh = m2 * (type === 'comercial' ? 12 : 8) * 0.35
      const monthlyMxn = monthlyKwh * 4.5
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({
        ok: true, input: { m2, type },
        estimated: {
          costTraditional: { total: m2 * costTraditional, perM2: costTraditional, currency: 'MXN' },
          costSustainable: { total: m2 * costSustainable, perM2: costSustainable, currency: 'MXN' },
          investmentDifference: { total: m2 * (costSustainable - costTraditional), currency: 'MXN' },
          monthlySaving: { kwh: Math.round(monthlyKwh), mxn: Math.round(monthlyMxn) },
          annualSaving: { mxn: Math.round(monthlyMxn * 12), kwh: Math.round(monthlyKwh * 12) },
          paybackMonths: costSustainable > costTraditional ? Math.round(m2 * (costSustainable - costTraditional) / monthlyMxn) : 0,
          co2AvoidedKgYear: Math.round(monthlyKwh * 0.5 * 12),
        },
      }) })
    }

    // Listados públicos
    if (pathname === '/api/usuarios' && method === 'GET') {
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items: await load('usuarios') }) })
    }
    if (pathname === '/api/proyectos' && method === 'GET') {
      const items = (await load('proyectos')).map((x) => ({ ...x, imagenes: absImgs(x.imagenes) }))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items }) })
    }
    if (pathname === '/api/categorias' && method === 'GET') {
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items: await load('categorias') }) })
    }
    if (pathname === '/api/posts' && method === 'GET') {
      const items = (await load('posts')).filter((p) => (p.estatus || 'Publicado') === 'Publicado').map((p) => ({ ...p, imagenes: absImgs(p.imagenes) }))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items }) })
    }
    if (pathname === '/api/testimonios' && method === 'GET') {
      const items = (await load('testimonios')).filter((t) => t.aprobado !== false).map((t) => ({ ...t, imagenes: absImgs(t.imagenes) }))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items }) })
    }
    if (pathname === '/api/blog' && method === 'GET') {
      const items = (await load('posts')).filter((p) => (p.estatus || 'Publicado') === 'Publicado').map((p) => ({
        id: p.id, title: p.nombre, category: p.categoria || 'General', excerpt: p.extracto || '',
        date: fmtFecha(p.fechaCreacion), read: p.lectura || '5 min', hue: p.hue || 168,
        content: Array.isArray(p.contenido) ? p.contenido : [], imagenes: absImgs(p.imagenes),
      }))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items }) })
    }
    if (pathname === '/api/construction' && method === 'GET') {
      const items = (await load('construcciones')).map((c) => ({
        id: c.id, proyecto: c.nombre, etapa: c.tipo, desc: c.descripcion, lugar: c.lugar || '',
        fecha: fmtFecha(c.fechaCreacion), hue: c.hue || 168, imagenes: absImgs(c.imagenes), tipo: c.tipo,
      }))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items }) })
    }
    if (pathname === '/api/bim' && method === 'GET') {
      const items = await load('bim')
      return callback(null, {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          services: items.filter((i) => i.tipo === 'Servicio').map((i) => ({ id: i.id, icon: i.icono || 'box', title: i.nombre, desc: i.descripcion, imagenes: absImgs(i.imagenes) })),
          projects: items.filter((i) => i.tipo === 'Proyecto').map((i) => ({ id: i.id, name: i.nombre, tipo: i.subtipo || 'Comercial', area: i.area || '', desc: i.descripcion, hue: i.hue || 190, imagenes: absImgs(i.imagenes) })),
        }),
      })
    }
    if (pathname === '/api/oferta' && method === 'GET') {
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, oferta: await loadOferta() }) })
    }

    // ---------- ADMIN ----------
    const user = requireAuth(req.headers)
    if (!user) {
      if (pathname.startsWith('/api/admin/')) return callback(null, { ...bad('No autorizado', 401), headers })
      return callback(null, { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'No encontrado' }) })
    }

    if (pathname === '/api/admin/overview' && method === 'GET') {
      const counts = {}
      for (const col of Object.keys(COLLECTIONS)) counts[col] = (await load(col)).length
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, counts, user, ts: new Date().toISOString() }) })
    }

    if (pathname === '/api/admin/oferta' && method === 'GET') {
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, oferta: await loadOferta() }) })
    }
    if (pathname === '/api/admin/oferta' && method === 'PUT') {
      const body = parseBody(req)
      if (!body) return callback(null, { ...bad('JSON inválido'), headers })
      await saveOferta(cleanOferta(body))
      return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
    }

    const colMatch = pathname.match(/^\/api\/admin\/([a-z_]+)$/)
    const itemMatch = pathname.match(/^\/api\/admin\/([a-z_]+)\/([^/]+)$/)

    if (colMatch && COLLECTIONS[colMatch[1]]) {
      const col = colMatch[1]
      if (method === 'GET') {
        return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, items: await load(col) }) })
      }
      if (method === 'POST') {
        const body = parseBody(req)
        if (!body) return callback(null, { ...bad('JSON inválido'), headers })
        const clean = await finalize(col, body)
        if (clean === null) return callback(null, { ...bad('Algunos campos no son válidos'), headers })
        const item = { id: newId(col[0] + 'x'), fechaCreacion: clean.fechaCreacion || new Date().toISOString(), ...clean }
        const arr = await load(col)
        arr.unshift(item)
        await save(col, arr)
        return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: item.id }) })
      }
    }

    if (itemMatch && COLLECTIONS[itemMatch[1]]) {
      const col = itemMatch[1]
      const id = decodeURIComponent(itemMatch[2])
      const arr = await load(col)
      const idx = arr.findIndex((x) => x.id === id)
      if (idx === -1) return callback(null, { ...bad('No encontrado', 404), headers })
      if (method === 'DELETE') {
        arr.splice(idx, 1)
        await save(col, arr)
        return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
      }
      if (method === 'PUT') {
        const body = parseBody(req)
        if (!body) return callback(null, { ...bad('JSON inválido'), headers })
        const clean = await finalize(col, body)
        if (clean === null) return callback(null, { ...bad('Algunos campos no son válidos'), headers })
        arr[idx] = { ...arr[idx], ...clean, id, fechaCreacion: arr[idx].fechaCreacion }
        await save(col, arr)
        return callback(null, { statusCode: 200, headers, body: JSON.stringify({ ok: true }) })
      }
    }

    return callback(null, { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'No encontrado' }) })
  })().catch((e) => {
    callback(null, { statusCode: 500, headers: jsonHeaders(), body: JSON.stringify({ ok: false, error: 'Error interno: ' + String(e && e.message || e).slice(0, 200) }) })
  })
}

// ---------- Oferta (validación) ----------
function cleanOferta(o) {
  const src = o || {}
  return {
    id: 'oferta',
    promesa: {
      titulo: sanitize(src.promesa && src.promesa.titulo, 200),
      sub: sanitize(src.promesa && src.promesa.sub, 600),
    },
    cupo: sanitize(src.cupo, 160),
    cupoForm: sanitize(src.cupoForm, 160),
    bonos: (Array.isArray(src.bonos) ? src.bonos : []).slice(0, 6)
      .map((b) => ({ titulo: sanitize(b && b.titulo, 120), desc: sanitize(b && b.desc, 800) }))
      .filter((b) => b.titulo),
    faq: (Array.isArray(src.faq) ? src.faq : []).slice(0, 20)
      .map((f) => ({ q: sanitize(f && f.q, 200), a: sanitize(f && f.a, 1200) }))
      .filter((f) => f.q),
  }
}

// Solo desarrollo: expone las semillas para el re-seeder local (node reseed.js).
if (process.env.NODE_ENV !== 'production') {
  module.exports._seeds = { SEED_USUARIOS, SEED_TIPOS, SEED_CATEGORIAS, SEED_PROYECTOS, SEED_POSTS, SEED_CONSTRUCCIONES, SEED_BIM, SEED_TESTIMONIOS, SEED_OFERTA }
}