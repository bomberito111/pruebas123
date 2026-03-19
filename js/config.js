/* ═══════════════════════════════════════════
   config.js — Constants and ISA TRAQ question set
   Plain JS — window globals (GitHub Pages / script tags)
═══════════════════════════════════════════ */

// ── PHASES ──
window.PHASES = [
  { label:'IDENTIFICACIÓN',              icon:'🌿', desc:'Datos básicos de la evaluación' },
  { label:'ZONA Y SALUD',               icon:'🩺', desc:'Topografía, Clima, Vigor y Follaje' },
  { label:'FACTORES DE CARGA',          icon:'🌬️', desc:'Suelo, Viento y Exposición de la Copa' },
  { label:'COPA Y RAMAS',               icon:'🌳', desc:'Defectos y evaluación de dianas en copa' },
  { label:'TRONCO',                     icon:'🪵', desc:'Defectos y evaluación de dianas en tronco' },
  { label:'RAÍCES',                     icon:'🌱', desc:'Defectos y evaluación de dianas en raíces' },
  { label:'BIOMETRÍA RINNTECH (OPCIONAL)', icon:'🔬', desc:'Medidas para análisis de pared residual APO' }
];

// ── FULL ISA TRAQ QUESTION SET ──
// Note: arbolId, cliente, especie, evaluador removed — they come from the wizard step 1
window.QS = [
  // ─── Phase 0 — Identification (medidas físicas) ───
  { id:'dap',         ph:0, label:'Diámetro nominal (DAP)',            type:'number',     unit:'cm',  min:1 },
  { id:'altura',      ph:0, label:'Altura del árbol',                  type:'number',     unit:'m',   min:1 },
  { id:'copa',        ph:0, label:'Proyección copa (Diámetro)',        type:'number',     unit:'m',   min:1 },
  { id:'valorProp',   ph:0, label:'Valor propiedad expuesta (USD)',    type:'number',     unit:'USD', min:0, step:100, opt:true },

  // ─── Phase 1 — Zone and Health ───
  { id:'historial_fallo', ph:1, label:'Historial de fallos en la zona', type:'choice',
    opts:['Ninguno','Ramas','Tronco','Raíces'] },

  { id:'tablaTopografia', ph:1, label:'Topografía', type:'group', fields:[
    { id:'tipo',    label:'Tipo',        type:'select', opts:['Plano','Pendiente'] },
    { id:'pct_pte', label:'% Pendiente', type:'number' }
  ]},

  { id:'cambios_zona', ph:1, label:'Cambios en la zona', type:'multi',
    opts:['Cambio de cota','Limpieza','Cambio hidrología','Cortes de raíces','Ninguno'], none:'Ninguno' },

  { id:'tablaSuelo', ph:1, label:'Condiciones del suelo', type:'group', fields:[
    { id:'vol_lim',    label:'Volumen limitado (%)',         type:'number' },
    { id:'encharcado', label:'Encharcado (%)',               type:'number' },
    { id:'superficial',label:'Superficial (%)',              type:'number' },
    { id:'compactado', label:'Compactado (%)',               type:'number' },
    { id:'pavimento',  label:'Pavimento sobre raíces (%)',   type:'number' },
    { id:'desc_suelo', label:'Descripción / Notas',          type:'text'   }
  ]},

  { id:'viento_dom',  ph:1, label:'Dirección de vientos dominantes',     type:'text', opt:true },
  { id:'climatologia',ph:1, label:'Climatología adversa frecuente',       type:'multi',
    opts:['Vientos fuertes','Hielo','Nieve','Lluvias fuertes','Ninguno'], none:'Ninguno' },

  // ─── Phase 2 — Load Factors ───
  { id:'vigor', ph:2, label:'Vigor del árbol', type:'choice',
    opts:['Bajo','Normal','Alto'] },

  { id:'tablaFollaje', ph:2, label:'Follaje', type:'group', fields:[
    { id:'estado',       label:'Estado',       type:'select', opts:['Normal','Ninguno (estación)','Ninguno (muerte)'] },
    { id:'pct_normal',   label:'% Normal',     type:'number' },
    { id:'pct_clorotico',label:'% Clorótico',  type:'number' },
    { id:'pct_necrotico',label:'% Necrótico',  type:'number' }
  ]},

  { id:'tablaPlagas', ph:2, label:'Plagas y enfermedades', type:'group', fields:[
    { id:'abiotico', label:'Abiótico (Desc)', type:'text' },
    { id:'biotico',  label:'Biótico (Desc)',  type:'text' }
  ]},

  { id:'perfil_fallo',      ph:2, label:'Perfil de fallos por especie', type:'multi',
    opts:['Ramas','Tronco','Raíces','No conocido'], none:'No conocido' },
  { id:'perfil_fallo_desc', ph:2, label:'Anotación / Descripción de fallos', type:'text', opt:true,
    ph_txt:'Ej: Historial de desgarre de ramas...' },

  { id:'exposViento', ph:2, label:'Exposición al viento', type:'choice',
    opts:['Protegida','Parcial','Total','Túnel de viento'] },

  { id:'tablaCarga', ph:2, label:'Factores de Carga', type:'group', fields:[
    { id:'tam_copa', label:'Tamaño relativo copa', type:'select', opts:['Pequeño','Medio','Grande'] },
    { id:'den_copa', label:'Densidad copa',         type:'select', opts:['Escasa','Normal','Densa'] },
    { id:'ram_int',  label:'Ramas interiores',      type:'select', opts:['Poca','Normal','Densa'] },
    { id:'trepadora',label:'Trepadora/Muérdago/Musgo', type:'select', opts:['Sí','No'] }
  ]},

  { id:'cambios_carga', ph:2, label:'Cambios recientes o previstos en cargas', type:'text', opt:true },

  // ─── Phase 3 — Crown Defects ───
  { id:'defCopa', ph:3, label:'Defectos en Copa y Ramas', type:'multi',
    opts:[
      'Copa desequilibrada','Ramas/ramillas muertas','Ramas rotas/colgantes',
      'Ramas sobre extendidas','Corteza incluida','Cavidades/nidos','Codominancia',
      'Uniones débiles','Fallos previos de ramas','Corteza muerta/pérdida',
      'Cáncer/agallas/nudos','Albura dañada/descompuesta','Cuerpos fructíferos',
      'Duramen descompuesto','Grietas','Daños por rayos','Crecimiento de respuesta',
      'Sin defectos'
    ], none:'Sin defectos' },

  { id:'tablaCopaDet', ph:3, label:'Detalles adicionales de Copa', type:'group', fields:[
    { id:'lcr',         label:'LCR % (Porcentaje copa viva)',    type:'number' },
    { id:'pct_muertas', label:'% Ramas muertas',                 type:'number' },
    { id:'diam_muertas',label:'Diám. máx ramas muertas',         type:'text'   },
    { id:'num_rotas',   label:'Nº Ramas rotas/colgantes',        type:'number' },
    { id:'diam_rotas',  label:'Diám. máx ramas rotas',           type:'text'   }
  ]},

  { id:'historial_poda', ph:3, label:'Historial de Poda', type:'multi',
    opts:['Limpieza','Aclareo','Reducción','Refaldado','Cortes a ras','Desmoche','Cola de León','Otros','Ninguno'],
    none:'Ninguno' },

  { id:'copa_preocupacion', ph:3, label:'Principal(es) preocupación(es) (Copa)', type:'text', opt:true },
  { id:'copa_cargas',       ph:3, label:'Cargas adicionales (Copa)',             type:'choice',
    opts:['Ninguna','Menor','Moderada','Significativa'] },
  { id:'copa_dianas',       ph:3, label:'Evaluación de Dianas y Riesgo (Copa)',  type:'risk_target_group' },

  // ─── Phase 4 — Trunk ───
  { id:'defTronco', ph:4, label:'Defectos en Tronco', type:'multi',
    opts:[
      'Corteza muerta/perdida','Color/textura anormal de corteza','Inclinación',
      'Estrangulamiento','Troncos codominantes','Corteza incluida','Grietas',
      'Albura dañada/descompuesta','Cáncer/agallas/nudos','Rezuman savia',
      'Cavidades','Daños por rayo','Duramen descompuesto','Cuerpos fructíferos/setas',
      'Crecimiento de respuesta','Sin defectos'
    ], none:'Sin defectos' },

  { id:'tablaTroncoDet', ph:4, label:'Detalles adicionales Tronco', type:'group', fields:[
    { id:'cavidad_pct', label:'Cavidad % Perímetro',      type:'number' },
    { id:'cavidad_prof',label:'Profundidad cavidad',       type:'number' },
    { id:'inc_grados',  label:'Inclinación °',             type:'number' },
    { id:'inc_corr',    label:'¿Inclinación corregida?',   type:'select', opts:['Sí','No'] }
  ]},

  { id:'tronco_preocupacion', ph:4, label:'Principal(es) preocupación(es) (Tronco)', type:'text', opt:true },
  { id:'tronco_cargas',       ph:4, label:'Cargas adicionales (Tronco)',              type:'choice',
    opts:['Ninguna','Menor','Moderada','Significativa'] },
  { id:'tronco_dianas',       ph:4, label:'Evaluación de Dianas y Riesgo (Tronco)',   type:'risk_target_group' },

  // ─── Phase 5 — Roots ───
  { id:'defRaices', ph:5, label:'Defectos en Raíces y Cuello radicular', type:'multi',
    opts:[
      'Cuello enterrado/no visible','Estrangulamiento','Raíz muerta/degradada',
      'Hongos/setas','Exudaciones','Cavidad/nido','Conicidad atípica',
      'Levantamiento del plato radicular','Debilidad de suelo','Grietas',
      'Cortes/raíces dañadas','Crecimiento de respuesta','Sin defectos'
    ], none:'Sin defectos' },

  { id:'tablaRaicesDet', ph:5, label:'Detalles adicionales Raíces', type:'group', fields:[
    { id:'cuello_prof',  label:'Profundidad cuello enterrado',  type:'number' },
    { id:'cavidad_pct',  label:'Cavidad % Perímetro',           type:'number' },
    { id:'cavidad_prof', label:'Profundidad cavidad',            type:'number' },
    { id:'cortes_dist',  label:'Cortes: Distancia al tronco',   type:'number' }
  ]},

  { id:'raices_preocupacion', ph:5, label:'Principal(es) preocupación(es) (Raíces)', type:'text', opt:true },
  { id:'raices_cargas',       ph:5, label:'Cargas adicionales (Raíces)',              type:'choice',
    opts:['Ninguna','Menor','Moderada','Significativa'] },
  { id:'raices_dianas',       ph:5, label:'Evaluación de Dianas y Riesgo (Raíces)',   type:'risk_target_group' },

  // ─── Phase 6 — Rinntech Biometry (optional) ───
  { id:'H',        ph:6, label:'(Rinntech) Altura total — H',                        type:'number', unit:'cm', def:1500, opt:true },
  { id:'C',        ph:6, label:'(Rinntech) Altura inicio copa — C',                  type:'number', unit:'cm', def:800,  opt:true },
  { id:'Di',       ph:6, label:'(Rinntech) Diámetro sección intacta — Di',           type:'number', unit:'cm', def:40,   opt:true },
  { id:'Hd',       ph:6, label:'(Rinntech) Altura del defecto — Hd',                 type:'number', unit:'cm', def:10,   opt:true },
  { id:'Dd',       ph:6, label:'(Rinntech) Diámetro exterior en defecto — Dd',       type:'number', unit:'cm', def:50,   opt:true },
  { id:'tActual',  ph:6, label:'(Rinntech) Espesor medido de pared residual — t_actual', type:'number', unit:'cm', opt:true },
  { id:'topologia',ph:6, label:'(Rinntech) Topología del defecto', type:'choice',
    opts:['⭕ Cavidad central','🔴 Pudrición exterior','💥 Apertura en tronco'] }
];

window.TOTAL_QS = window.QS.length;

// ── RISK COLORS ──
window.RISK_COLORS = {
  bajo:     '#15803d',
  moderado: '#f59e0b',
  alto:     '#f97316',
  extremo:  '#b91c1c'
};

window.RISK_LABELS = {
  bajo:     'Bajo',
  moderado: 'Moderado',
  alto:     'Alto',
  extremo:  'Extremo'
};

window.RISK_LABELS_UP = {
  bajo:     'BAJO',
  moderado: 'MODERADO',
  alto:     'ALTO',
  extremo:  'EXTREMO'
};
