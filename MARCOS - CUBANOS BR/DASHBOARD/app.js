const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_LARGO = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORES = ['#378ADD','#1D9E75','#D85A30','#BA7517','#7F77DD','#888780','#D4537E','#639922','#E24B4A','#5DCAA5'];
const COSTOS_COLORS = ['#D85A30','#BA7517','#378ADD','#7F77DD','#1D9E75','#888780'];

const SALARIOS = {
  jessica: 1900, solange: 1900, eric: 1900, jorge: 1900, victor: 1900, angel: 1900,
  michel: 1900, laritiza: 1900,
};
const COMISION_RATE = 0.05;

let supabase = null;
let charts = {};
let rawData = { entradas: [], salidas: [], clientes: [] };
let DATA = emptyData();
let realtimeChannel = null;
let refreshTimer = null;

function emptyData() {
  return {
    mensual: { labels: [], entradas: [], costos: [], lucro: [] },
    marketing: { inversion: [], leads: [], ventas: [], roas: [] },
    atendentes: [],
    atendentesKey: [],
    atendenteFact: [],
    servicios: [],
    serviciosDist: { labels: [], valores: [] },
    costos: { labels: [], valores: [], colors: COSTOS_COLORS },
    colaboradores: [],
    mesesDisponibles: [],
  };
}

function fmt(n) { return 'R$ ' + Math.round(n).toLocaleString('pt-BR'); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }
function num(v) { return Number(v) || 0; }
function norm(s) { return (s || '').toString().trim().toLowerCase(); }

function getMes() { return parseInt(document.getElementById('filtroMes').value, 10); }
function getAtendente() { return document.getElementById('filtroAtendente').value; }
function getAno() { return window.SUPABASE_CONFIG?.ano || 2026; }

function filterEntradas(mes, atendente) {
  const ano = getAno();
  return rawData.entradas.filter(e => {
    if (e.ano !== ano) return false;
    if (mes > 0 && e.mes !== mes) return false;
    if (atendente !== 'todos' && norm(e.atendente) !== norm(atendente)) return false;
    return true;
  });
}

function filterSalidas(mes) {
  const ano = getAno();
  return rawData.salidas.filter(s => {
    if (s.ano !== ano) return false;
    if (mes > 0 && s.mes !== mes) return false;
    return true;
  });
}

function isMarketingSalida(s) {
  const text = [s.categoria, s.subcategoria, s.razon].map(norm).join(' ');
  return /marketing|mkt|ads|anuncio|publicidad|meta|google/.test(text);
}

function mapCategoriaCosto(categoria) {
  const c = norm(categoria);
  if (/marketing|mkt|ads/.test(c)) return 'Marketing';
  if (/venta|comision|venda/.test(c)) return 'Ventas';
  if (/pessoal|salario|folha|rh|colaborador/.test(c)) return 'Pessoal';
  if (/estrutura|aluguel|infra/.test(c)) return 'Estructura';
  if (/software|saas|ferramenta|tech/.test(c)) return 'Softwares';
  return c ? categoria : 'Otros';
}

function aggregate(entradas, salidas, clientes) {
  const ano = getAno();
  const data = emptyData();
  const mesesSet = new Set();

  entradas.forEach(e => { if (e.ano === ano && e.mes) mesesSet.add(e.mes); });
  salidas.forEach(s => { if (s.ano === ano && s.mes) mesesSet.add(s.mes); });
  clientes.forEach(c => {
    const d = c.creado_en ? new Date(c.creado_en) : null;
    if (d && d.getFullYear() === ano) mesesSet.add(d.getMonth() + 1);
  });

  const meses = mesesSet.size ? [...mesesSet].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
  data.mesesDisponibles = meses;

  meses.forEach(m => {
    const ent = entradas.filter(e => e.ano === ano && e.mes === m).reduce((a, e) => a + num(e.valor), 0);
    const sal = salidas.filter(s => s.ano === ano && s.mes === m).reduce((a, s) => a + num(s.valor), 0);
    const inv = salidas.filter(s => s.ano === ano && s.mes === m && isMarketingSalida(s)).reduce((a, s) => a + num(s.valor), 0);
    const leads = clientes.filter(c => {
      if (!c.creado_en) return false;
      const d = new Date(c.creado_en);
      return d.getFullYear() === ano && d.getMonth() + 1 === m;
    }).length;
    const ventas = entradas.filter(e => e.ano === ano && e.mes === m).length;

    data.mensual.labels.push(MESES_CORTO[m - 1]);
    data.mensual.entradas.push(ent);
    data.mensual.costos.push(sal);
    data.mensual.lucro.push(ent - sal);
    data.marketing.inversion.push(inv);
    data.marketing.leads.push(leads);
    data.marketing.ventas.push(ventas);
    data.marketing.roas.push(inv > 0 ? ent / inv : 0);
  });

  const atendenteMap = {};
  entradas.filter(e => e.ano === ano).forEach(e => {
    const key = (e.atendente || 'Sin asignar').trim();
    atendenteMap[key] = (atendenteMap[key] || 0) + num(e.valor);
  });
  const sortedAtendentes = Object.entries(atendenteMap).sort((a, b) => b[1] - a[1]);
  data.atendentes = sortedAtendentes.map(([k]) => k);
  data.atendentesKey = sortedAtendentes.map(([k]) => k.toUpperCase());
  data.atendenteFact = sortedAtendentes.map(([, v]) => v);

  const servicioMap = {};
  entradas.filter(e => e.ano === ano).forEach(e => {
    const key = (e.servicio || 'Otros').trim();
    servicioMap[key] = (servicioMap[key] || 0) + num(e.valor);
  });
  const sortedServicios = Object.entries(servicioMap).sort((a, b) => b[1] - a[1]);
  const topServicios = sortedServicios.slice(0, 9);
  const otrosVal = sortedServicios.slice(9).reduce((a, [, v]) => a + v, 0);
  data.serviciosDist.labels = topServicios.map(([k]) => k);
  data.serviciosDist.valores = topServicios.map(([, v]) => v);
  if (otrosVal > 0) {
    data.serviciosDist.labels.push('Otros');
    data.serviciosDist.valores.push(otrosVal);
  }

  const totalEnt = entradas.filter(e => e.ano === ano).reduce((a, e) => a + num(e.valor), 0);
  const totalSal = salidas.filter(s => s.ano === ano).reduce((a, s) => a + num(s.valor), 0);
  const costRatio = totalEnt > 0 ? totalSal / totalEnt : 0.3;

  data.servicios = Object.entries(servicioMap).map(([nombre, total]) => {
    const count = entradas.filter(e => e.ano === ano && (e.servicio || 'Otros').trim() === nombre).length || 1;
    const valor = total / count;
    const cv = valor * Math.min(costRatio, 0.85);
    const lucro = valor - cv;
    const mc = valor > 0 ? lucro / valor : 0;
    const roi = cv > 0 ? lucro / cv : 0;
    return { nombre, valor, cv, lucro, mc, roi };
  }).sort((a, b) => b.valor - a.valor);

  const categoriaMap = {};
  salidas.filter(s => s.ano === ano).forEach(s => {
    const cat = mapCategoriaCosto(s.categoria);
    categoriaMap[cat] = (categoriaMap[cat] || 0) + num(s.valor);
  });
  const sortedCats = Object.entries(categoriaMap).sort((a, b) => b[1] - a[1]);
  data.costos.labels = sortedCats.map(([k]) => k);
  data.costos.valores = sortedCats.map(([, v]) => v);
  data.costos.colors = sortedCats.map((_, i) => COSTOS_COLORS[i % COSTOS_COLORS.length]);

  const colabMap = {};
  entradas.filter(e => e.ano === ano).forEach(e => {
    const nombre = (e.atendente || '').trim();
    if (!nombre) return;
    const key = norm(nombre);
    colabMap[key] = (colabMap[key] || 0) + num(e.valor);
  });
  data.colaboradores = Object.entries(colabMap).map(([key, facturado]) => {
    const nombre = key.charAt(0).toUpperCase() + key.slice(1);
    const salario = SALARIOS[key] || 1900;
    const comision = Math.round(facturado * COMISION_RATE);
    return { nombre, salario, comision };
  }).sort((a, b) => (b.salario + b.comision) - (a.salario + a.comision));

  return data;
}

function getEntradas(mes) {
  const atendente = getAtendente();
  if (atendente !== 'todos') {
    return filterEntradas(mes, atendente).reduce((a, e) => a + num(e.valor), 0);
  }
  if (mes === 0) return filterEntradas(0, 'todos').reduce((a, e) => a + num(e.valor), 0);
  const idx = DATA.mesesDisponibles.indexOf(mes);
  return idx >= 0 ? DATA.mensual.entradas[idx] : filterEntradas(mes, 'todos').reduce((a, e) => a + num(e.valor), 0);
}

function getCostos(mes) {
  if (mes === 0) return filterSalidas(0).reduce((a, s) => a + num(s.valor), 0);
  const idx = DATA.mesesDisponibles.indexOf(mes);
  return idx >= 0 ? DATA.mensual.costos[idx] : filterSalidas(mes).reduce((a, s) => a + num(s.valor), 0);
}

function getLucro(mes) {
  return getEntradas(mes) - getCostos(mes);
}

function setStatus(state, text) {
  const el = document.getElementById('statusBadge');
  if (!el) return;
  el.className = 'status-badge status-' + state;
  el.textContent = text;
}

function populateFilters() {
  const mesSelect = document.getElementById('filtroMes');
  const current = getMes();
  mesSelect.innerHTML = '<option value="0">Todos los meses</option>';
  DATA.mesesDisponibles.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = MESES_LARGO[m];
    if (m === current) opt.selected = true;
    mesSelect.appendChild(opt);
  });

  const atSelect = document.getElementById('filtroAtendente');
  const currentAt = getAtendente();
  atSelect.innerHTML = '<option value="todos">Todos</option>';
  DATA.atendentes.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = DATA.atendentesKey[i];
    opt.textContent = a;
    if (DATA.atendentesKey[i] === currentAt) opt.selected = true;
    atSelect.appendChild(opt);
  });
}

function renderMetrics(mes) {
  const ent = getEntradas(mes);
  const cos = getCostos(mes);
  const luc = getLucro(mes);
  const margin = ent > 0 ? luc / ent : 0;
  const idx = mes === 0 ? -1 : DATA.mesesDisponibles.indexOf(mes);
  const inv = mes === 0
    ? DATA.marketing.inversion.reduce((a, b) => a + b, 0)
    : (idx >= 0 ? DATA.marketing.inversion[idx] : 0);
  const roas = inv > 0 ? ent / inv : 0;

  const metrics = [
    { label: 'Facturamiento', value: fmt(ent), sub: mes === 0 ? `Acumulado ${getAno()}` : '' },
    { label: 'Costos totales', value: fmt(cos), sub: pct(ent > 0 ? cos / ent : 0) + ' del fact.' },
    { label: 'Lucro neto', value: fmt(luc), cls: luc >= 0 ? 'green' : 'red', sub: '' },
    { label: 'Margen lucro', value: pct(margin), cls: margin >= 0.3 ? 'green' : 'amber', sub: '' },
    { label: 'Inv. marketing', value: fmt(inv), sub: '' },
    { label: 'ROAS', value: roas > 0 ? roas.toFixed(2) + 'x' : '—', cls: roas >= 6 ? 'green' : '', sub: '' },
  ];

  document.getElementById('metricGrid').innerHTML = metrics.map(m =>
    `<div class="metric">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value ${m.cls || ''}">${m.value}</div>
      ${m.sub ? `<div class="metric-sub">${m.sub}</div>` : ''}
    </div>`
  ).join('');
}

function renderMensual() {
  const ctx = document.getElementById('chartMensual').getContext('2d');
  if (charts.mensual) charts.mensual.destroy();
  charts.mensual = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DATA.mensual.labels,
      datasets: [
        { label: 'Entradas', data: DATA.mensual.entradas, backgroundColor: '#378ADD', borderRadius: 3 },
        { label: 'Costos', data: DATA.mensual.costos, backgroundColor: '#D85A30', borderRadius: 3 },
        { label: 'Lucro', data: DATA.mensual.lucro, backgroundColor: '#1D9E75', borderRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: 11 }, callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' } },
      },
    },
  });
}

function renderAtendente() {
  const ctx = document.getElementById('chartAtendente').getContext('2d');
  if (charts.atendente) charts.atendente.destroy();
  const colors = COLORES.slice(0, DATA.atendentes.length);
  document.getElementById('legendAtendente').innerHTML = DATA.atendentes.map((a, i) =>
    `<span><span class="legend-dot" style="background:${colors[i]}"></span>${a}</span>`
  ).join('');
  charts.atendente = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DATA.atendentes,
      datasets: [{ label: 'Facturado', data: DATA.atendenteFact, backgroundColor: colors, borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: 11 }, callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' } },
      },
    },
  });
}

function renderServicio() {
  const ctx = document.getElementById('chartServicio').getContext('2d');
  if (charts.servicio) charts.servicio.destroy();
  const total = DATA.serviciosDist.valores.reduce((a, b) => a + b, 0) || 1;
  document.getElementById('legendServicio').innerHTML = DATA.serviciosDist.labels.slice(0, 5).map((l, i) =>
    `<span><span class="legend-dot" style="background:${COLORES[i]}"></span>${l} ${pct(DATA.serviciosDist.valores[i] / total)}</span>`
  ).join('');
  charts.servicio = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: DATA.serviciosDist.labels,
      datasets: [{ data: DATA.serviciosDist.valores, backgroundColor: COLORES, borderWidth: 1, borderColor: 'transparent' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ': R$' + Math.round(c.raw).toLocaleString('pt-BR') } } },
      cutout: '60%',
    },
  });
}

function renderCostos() {
  const ctx = document.getElementById('chartCostos').getContext('2d');
  if (charts.costos) charts.costos.destroy();
  const total = DATA.costos.valores.reduce((a, b) => a + b, 0) || 1;
  document.getElementById('legendCostos').innerHTML = DATA.costos.labels.map((l, i) =>
    `<span><span class="legend-dot" style="background:${DATA.costos.colors[i]}"></span>${l} ${pct(DATA.costos.valores[i] / total)}</span>`
  ).join('');
  charts.costos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: DATA.costos.labels,
      datasets: [{ data: DATA.costos.valores, backgroundColor: DATA.costos.colors, borderWidth: 1, borderColor: 'transparent' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '60%',
    },
  });
}

function renderMarketing(mes) {
  const idx = mes === 0 ? -1 : DATA.mesesDisponibles.indexOf(mes);
  const inv = mes === 0 ? DATA.marketing.inversion.reduce((a, b) => a + b, 0) : (idx >= 0 ? DATA.marketing.inversion[idx] : 0);
  const leads = mes === 0 ? DATA.marketing.leads.reduce((a, b) => a + b, 0) : (idx >= 0 ? DATA.marketing.leads[idx] : 0);
  const ventas = mes === 0 ? DATA.marketing.ventas.reduce((a, b) => a + b, 0) : (idx >= 0 ? DATA.marketing.ventas[idx] : 0);
  const cpl = leads > 0 ? (inv / leads).toFixed(2) : '—';
  const cac = ventas > 0 ? (inv / ventas).toFixed(2) : '—';
  const roasVal = inv > 0 && idx >= 0 ? DATA.marketing.roas[idx] : 0;
  const items = [
    { label: 'Inversión total', value: fmt(inv) },
    { label: 'Leads', value: leads > 0 ? leads.toLocaleString('pt-BR') : '—' },
    { label: 'Ventas nuevas', value: ventas > 0 ? ventas : '—' },
    { label: 'CPL', value: cpl !== '—' ? 'R$' + cpl : '—' },
    { label: 'CAC', value: cac !== '—' ? 'R$' + cac : '—' },
    { label: 'ROAS', value: roasVal > 0 ? roasVal.toFixed(2) + 'x' : '—' },
  ];
  document.getElementById('marketingMetrics').innerHTML = items.map(i =>
    `<div class="metric">
      <div class="metric-label">${i.label}</div>
      <div class="metric-value" style="font-size:18px">${i.value}</div>
    </div>`
  ).join('');
}

function renderTablas() {
  document.getElementById('tablaServicios').innerHTML = DATA.servicios.length
    ? DATA.servicios.map(s =>
      `<tr>
        <td>${s.nombre}</td>
        <td>R$${s.valor.toFixed(0)}</td>
        <td>R$${s.cv.toFixed(1)}</td>
        <td style="color:#1D9E75; font-weight:500">R$${s.lucro.toFixed(1)}</td>
        <td><span class="badge ${s.mc >= 0.4 ? 'badge-green' : 'badge-amber'}">${pct(s.mc)}</span></td>
        <td>${pct(s.roi)}</td>
      </tr>`
    ).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--color-text-secondary)">Sin datos de servicios</td></tr>';

  document.getElementById('tablaColaboradores').innerHTML = DATA.colaboradores.length
    ? DATA.colaboradores.map(c => {
      const total = c.salario + c.comision;
      return `<tr>
        <td style="font-weight:500">${c.nombre}</td>
        <td>R$${c.salario.toLocaleString('pt-BR')}</td>
        <td>R$${c.comision.toLocaleString('pt-BR')}</td>
        <td style="font-weight:500">R$${total.toLocaleString('pt-BR')}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--color-text-secondary)">Sin datos de colaboradores</td></tr>';
}

function actualizar() {
  const mes = getMes();
  renderMetrics(mes);
  renderMarketing(mes);
}

function renderAll() {
  populateFilters();
  renderMensual();
  renderAtendente();
  renderServicio();
  renderCostos();
  renderTablas();
  actualizar();
}

async function fetchData() {
  const ano = getAno();
  const [entRes, salRes, cliRes] = await Promise.all([
    supabase.from('entradas').select('*').eq('ano', ano),
    supabase.from('salidas').select('*').eq('ano', ano),
    supabase.from('clientes').select('*'),
  ]);

  if (entRes.error) throw entRes.error;
  if (salRes.error) throw salRes.error;
  if (cliRes.error) throw cliRes.error;

  rawData.entradas = entRes.data || [];
  rawData.salidas = salRes.data || [];
  rawData.clientes = cliRes.data || [];
  DATA = aggregate(rawData.entradas, rawData.salidas, rawData.clientes);
}

async function refreshDashboard() {
  try {
    setStatus('loading', 'Actualizando...');
    await fetchData();
    renderAll();
    setStatus('live', 'En vivo');
  } catch (err) {
    console.error(err);
    setStatus('error', 'Error de conexión');
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshDashboard, 400);
}

function setupRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel('dashboard-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salidas' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, scheduleRefresh)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setStatus('live', 'En vivo');
      if (status === 'CHANNEL_ERROR') setStatus('error', 'Realtime desconectado');
    });
}

async function init() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey || cfg.url.includes('__SUPABASE')) {
    setStatus('error', 'Configura Supabase en .env');
    return;
  }

  setStatus('loading', 'Conectando...');
  supabase = window.supabase.createClient(cfg.url, cfg.anonKey);

  await refreshDashboard();
  setupRealtime();

  setInterval(refreshDashboard, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
