/*
 * CONFIGURACIÓN COMERCIAL EDITABLE — Monte Olimpo / Santa Clara
 * Cambia aquí los valores sin tocar el resto del código.
 * (En la fase de panel administrativo estos datos pasarán a la base de datos.)
 */
window.MO_CONFIG = {
  whatsapp: {
    numero: "573002846310",          // formato internacional, sin + ni espacios
    visible: "+57 300 284 6310"
  },

  // Cartera: pagos y cuotas de los propietarios (lo usa el portal de clientes)
  cartera: {
    numero: "573017159701",
    visible: "301 715 9701"
  },

  redes: {
    instagram: { usuario: "santaclarapobladocampestre", url: "https://www.instagram.com/santaclarapobladocampestre/" },
    tiktok:    { usuario: "santaclarapobladoc",         url: "https://www.tiktok.com/@santaclarapobladoc" },
    youtube:   { usuario: "Santa Clara Poblado Campestre", url: "https://www.youtube.com/@PromotoraMonteOlimpo" }
  },

  financiacion: {
    interest_rate: 0,                 // sin intereses
    default_down_payment: 20,         // % cuota inicial de referencia
    down_payment_options: [20, 25, 30],
    reservation_amount: 500000,       // valor de separación en pesos. null = "Consúltalo con tu asesor"
    // Las cuotas mensuales se redondean HACIA ARRIBA a este múltiplo para que sean cifras cerradas
    // (ej. 1.690.000 → 1.700.000). La última cuota se ajusta para que la suma dé exactamente el saldo.
    redondeo_cuota: 50000,
    // Pago de contado: descuento sobre el valor de lista y plazo para pagar el saldo.
    contado: { descuento_pct: 2.5, plazo_dias: 30 },
    // Plazos de referencia según área del lote (m²). Se negocian con el asesor comercial.
    financing_rules: [
      { hasta_m2: 499,  min_months: 18, max_months: 24 },
      { hasta_m2: 599,  min_months: 18, max_months: 26 },
      { hasta_m2: 999,  min_months: 18, max_months: 30 },
      { hasta_m2: null, min_months: 18, max_months: 32 }
    ],
    aviso: "Simulación informativa. Condiciones sujetas a disponibilidad y aprobación comercial vigente."
  },

  // Inventario en vivo: hoja de Google de la empresa (pestaña del listado de valores). La página la lee cada minuto.
  // Debe estar compartida como "cualquier persona con el enlace puede ver". Borra hoja_id para usar solo data/santa-clara.js.
  inventario_vivo: { hoja_id: "1N_E_11j8MUycjeh2ytEqvEoFN-CpUVpvCOayvAfmfS8", gid: "572349608" },

  // Asistente Olimpo con IA: ruta de la función del servidor (api/olimpo.js). Si no responde, Olimpo usa su motor local.
  olimpo_api: "/api/olimpo",

  // Videos de YouTube (el id es lo que va después de youtu.be/). Se muestran en la galería de Santa Clara.
  videos_youtube: [
    { id: "Prvh4QMAIWs", titulo: "¿Buscas un lote campestre? Así es Santa Clara Poblado Campestre",
      descripcion: "Recorre el acceso, las vías y los lotes del proyecto en Palmar de Varela." }
  ],

  proyectos: {
    santaClara: {
      nombre: "Santa Clara",
      descriptor: "Poblado Campestre",
      ubicacion: "Palmar de Varela, Atlántico",
      acceso: "Vía Sabanalarga – Palmar de Varela",
      lat: 10.6997354, lng: -74.8061069,
      mapa: "https://maps.app.goo.gl/RfTXgP4545xXYMKC8"
    },
    comercializados: [
      // En orden cronológico (confirmado por la empresa): San Nicolás → Las Mercedes → La Inmaculada → Monte Olimpo → Santa Clara
      { nombre: "San Nicolás",  nota: "Nuestro primer proyecto", ubicacion: "Santo Tomás", mapa: null, lat: null, lng: null },
      { nombre: "Las Mercedes", nota: null, ubicacion: "Atlántico", mapa: "https://maps.app.goo.gl/qGGASZ4DBB4cW6mN6", lat: 10.7728379, lng: -74.8086873 },
      { nombre: "La Inmaculada", nota: null, ubicacion: "Atlántico", mapa: "https://maps.app.goo.gl/qTkPQbE3S5V2toFm6", lat: 10.765582, lng: -74.818933 },
      { nombre: "Monte Olimpo", nota: null, ubicacion: "Villa Polo Nuevo · Santo Tomás", mapa: "https://maps.app.goo.gl/YgrKbRekhRJQd6us9", lat: 10.7716349, lng: -74.8059453 }
    ]
  }
};
