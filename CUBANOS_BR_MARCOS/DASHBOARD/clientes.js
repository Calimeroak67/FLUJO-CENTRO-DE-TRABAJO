const CLIENT_FIELDS = ['fecha', 'cpf', 'nombre', 'telefono', 'email', 'valor_total', 'pais', 'ciudad', 'estado', 'canal_adquisicion'];
const KOMMO_LOOKUP = ['canal_adquisicion', 'source', 'origen', 'utm_source', 'crm'];
const RECENT_DAYS = 7;

let supabase = null;
let clients = [];
let activeTab = 'all';
let editId = null;
let searchTerm = '';

function setStatus(state, text) {
  const badge = document.getElementById('statusBadge');
  if (!badge) return;
  badge.className = 'status-badge status-' + state;
  badge.textContent = text;
}

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function escapeHtml(value) {
  return safeText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getPrimaryKeyName(record) {
  return ['id', 'uuid', 'uid', 'id_cliente', 'cliente_id'].find(key => Object.prototype.hasOwnProperty.call(record, key));
}

function getPrimaryKeyValue(record) {
  const key = getPrimaryKeyName(record);
  return key ? record[key] : null;
}

function isRecentClient(record) {
  const dateString = record.fecha || record.created_at || record.createdAt || record.creado_en;
  if (!dateString) return false;
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return false;
  const diff = (Date.now() - value.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= RECENT_DAYS;
}

function isKommoClient(record) {
  const sourceText = KOMMO_LOOKUP.map(field => safeText(record[field])).join(' ').toLowerCase();
  if (sourceText.includes('kommo')) return true;
  return isRecentClient(record);
}

function updateFilters() {
  searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
}

function filterClients() {
  let rows = [...clients];
  if (activeTab === 'kommo') {
    rows = rows.filter(isKommoClient);
  }
  if (searchTerm) {
    rows = rows.filter(record => {
      return CLIENT_FIELDS.some(field => safeText(record[field]).toLowerCase().includes(searchTerm))
        || KOMMO_LOOKUP.some(field => safeText(record[field]).toLowerCase().includes(searchTerm));
    });
  }
  return rows;
}

function buildCell(value, name, isEditing) {
  if (!isEditing) {
    return `<td><div>${escapeHtml(value)}</div></td>`;
  }
  return `<td><input class="editable-input" name="${name}" value="${escapeHtml(value)}"></td>`;
}

function renderTable() {
  const container = document.getElementById('clientesTabla');
  const rows = filterClients();
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 24px; color: #6b6b6b;">No se encontraron clientes para esta vista.</td></tr>';
    return;
  }

  container.innerHTML = rows.map(record => {
    const recordId = getPrimaryKeyValue(record) || '';
    const isEditing = editId === recordId;
    const editButtons = isEditing
      ? `<button type="button" class="button primary" data-action="save" data-id="${recordId}">Guardar</button><button type="button" class="button secondary" data-action="cancel" data-id="${recordId}">Cancelar</button>`
      : `<button type="button" class="button secondary" data-action="edit" data-id="${recordId}">Editar</button>`;

    const cells = CLIENT_FIELDS.map(field => buildCell(record[field], field, isEditing)).join('');
    const badge = isKommoClient(record) ? '<span class="pill">Kommo</span>' : '';

    return `<tr data-id="${recordId}">${cells}<td class="actions-cell">${badge}${editButtons}</td></tr>`;
  }).join('');
}

function setActiveTab(tab) {
  activeTab = tab;
  editId = null;
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  renderTable();
}

async function fetchClients() {
  try {
    setStatus('loading', 'Cargando clientes...');
    const { data, error } = await supabase.from('clientes').select('*');
    if (error) throw error;
    clients = data || [];
    renderTable();
    setStatus('live', 'Conectado');
  } catch (error) {
    console.error(error);
    setStatus('error', 'Error al cargar clientes');
  }
}

async function saveClient(recordId, rowElement) {
  try {
    const keyName = getPrimaryKeyName(clients.find(rec => String(getPrimaryKeyValue(rec)) === recordId));
    if (!keyName) {
      setStatus('error', 'Clave primaria no encontrada para el cliente');
      return;
    }

    const updates = {};
    rowElement.querySelectorAll('input[name]').forEach(input => {
      updates[input.name] = input.value.trim();
    });

    if (updates.valor_total) {
      const parsed = Number(updates.valor_total.toString().replace(/[^0-9.,-]/g, '').replace(',', '.'));
      updates.valor_total = Number.isFinite(parsed) ? parsed : updates.valor_total;
    }

    setStatus('loading', 'Guardando cambios...');
    const { error, data } = await supabase.from('clientes').update(updates).eq(keyName, recordId).select().single();
    if (error) throw error;

    clients = clients.map(item => {
      if (String(getPrimaryKeyValue(item)) === recordId) return data;
      return item;
    });

    editId = null;
    renderTable();
    setStatus('live', 'Cambios guardados');
  } catch (error) {
    console.error(error);
    setStatus('error', 'Error al guardar');
  }
}

function setupEvents() {
  document.getElementById('searchInput').addEventListener('input', event => {
    updateFilters();
    renderTable();
  });

  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  document.getElementById('clientesTabla').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;

    const recordId = button.dataset.id;
    const action = button.dataset.action;
    const rowElement = document.querySelector(`tr[data-id="${recordId}"]`);

    if (action === 'edit') {
      editId = recordId;
      renderTable();
      return;
    }
    if (action === 'cancel') {
      editId = null;
      renderTable();
      return;
    }
    if (action === 'save' && rowElement) {
      await saveClient(recordId, rowElement);
      return;
    }
  });
}

function setupRealtime() {
  const channel = supabase.channel('clientes-realtime');
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
    fetchClients();
  }).subscribe(status => {
    if (status === 'SUBSCRIBED') setStatus('live', 'En vivo');
    if (status === 'CHANNEL_ERROR') setStatus('error', 'Realtime desconectado');
  });
}

async function init() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey || cfg.url.includes('__SUPABASE')) {
    setStatus('error', 'Configura Supabase en config.js');
    return;
  }

  supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
  setupEvents();
  await fetchClients();
  setupRealtime();
}

document.addEventListener('DOMContentLoaded', init);
