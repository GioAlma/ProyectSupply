/* ── Estado de la aplicación ────────────────────────────────── */
const state = {
  concepto: "",
  estadosActivos: new Set(),   // vacío = TODOS
  estados: [],                  // [{ ESTATUSUSUARIO, total }]
};

/* ── Referencias DOM ─────────────────────────────────────────── */
const selConcepto  = document.getElementById("sel-concepto");
const statusBar    = document.getElementById("status-bar");
const statusPills  = document.getElementById("status-pills");
const btnTodos     = document.getElementById("btn-todos");
const estadoTabla  = document.getElementById("estado-tabla");
const tableWrap    = document.getElementById("table-wrap");
const tbody        = document.getElementById("tbody");
const tableFooter  = document.getElementById("table-footer");
const headerMeta   = document.getElementById("header-meta");

/* ── Colores por estado (cíclicos) ───────────────────────────── */
const COLORES_ESTADO = [
  "#e0a030", "#4a9eff", "#34c87a", "#c070e0",
  "#e05050", "#50d0c0", "#e080a0", "#80b0ff",
];

const colorEstado = (() => {
  const mapa = {};
  return (estado, lista) => {
    if (!mapa[estado]) {
      const idx = lista.indexOf(estado) % COLORES_ESTADO.length;
      mapa[estado] = COLORES_ESTADO[Math.max(idx, 0)];
    }
    return mapa[estado];
  };
})();

/* ── Fetch helpers ───────────────────────────────────────────── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function buildQS(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(val => qs.append(k, val));
    else qs.set(k, v);
  });
  return qs.toString();
}

/* ── Render helpers ──────────────────────────────────────────── */
function mostrarMensaje(texto, esError = false) {
  estadoTabla.hidden = false;
  tableWrap.hidden   = true;
  tableFooter.hidden = true;
  estadoTabla.className = "estado-msg" + (esError ? " msg-error" : "");
  estadoTabla.innerHTML = texto;
}

function mostrarCargando(texto = "Cargando…") {
  mostrarMensaje(`<span class="spinner"></span>${texto}`);
}

function fechaCorta(valor) {
  if (!valor || valor === "NaT" || valor === "nan") return "—";
  return valor.slice(0, 10);   // YYYY-MM-DD → solo los primeros 10 chars
}

function renderTabla(ordenes) {
  const nombresEstados = state.estados.map(e => e.ESTATUSUSUARIO);

  tbody.innerHTML = ordenes.map(o => {
    const color = colorEstado(o.ESTATUSUSUARIO, nombresEstados);
    return `<tr>
      <td class="col-orden">${o.Orden || "—"}</td>
      <td class="col-fecha">${fechaCorta(o.FECHAINIEXTREMA)}</td>
      <td class="col-fecha">${fechaCorta(o["Fecha Programacion"])}</td>
      <td class="col-text">${o.COMENTARIOSCOMPRAS || "—"}</td>
      <td class="col-text">${o.PUESTODESCARGA || "—"}</td>
      <td class="col-fecha">${fechaCorta(o.FProduccion)}</td>
      <td class="col-text">${o.CLASEOP || "—"}</td>
      <td class="col-text">${o.PLANIFICADOR || "—"}</td>
      <td class="col-cant">${o["Cantidad Original"] || "—"}</td>
      <td class="col-estado">
        <span class="tag-estado" style="color:${color};border-color:${color}20;background:${color}12">
          ${o.ESTATUSUSUARIO || "—"}
        </span>
      </td>
    </tr>`;
  }).join("");

  estadoTabla.hidden = true;
  tableWrap.hidden   = false;
  tableFooter.hidden = false;
  tableFooter.textContent = `${ordenes.length} ORDEN${ordenes.length !== 1 ? "ES" : ""} · ${state.concepto}`;
}

/* ── Lógica de estado ────────────────────────────────────────── */
function estadosSeleccionados() {
  return state.estadosActivos.size === 0
    ? []
    : [...state.estadosActivos];
}

function actualizarPills() {
  const todoActivo = state.estadosActivos.size === 0;
  btnTodos.classList.toggle("active", todoActivo);

  statusPills.querySelectorAll(".pill").forEach(p => {
    const est = p.dataset.estado;
    p.classList.toggle("active", state.estadosActivos.has(est));
  });
}

/* ── Cargar y renderizar órdenes ─────────────────────────────── */
async function cargarOrdenes() {
  mostrarCargando();
  const params = { concepto: state.concepto };
  const sel = estadosSeleccionados();
  if (sel.length) params.estado = sel;

  try {
    const data = await fetchJSON(`/api/ordenes?${buildQS(params)}`);
    if (data.length === 0) {
      mostrarMensaje("Sin órdenes para el filtro seleccionado.");
    } else {
      renderTabla(data);
    }
  } catch (err) {
    mostrarMensaje(`Error al cargar órdenes: ${err.message}`, true);
  }
}

/* ── Cargar estados para un concepto ─────────────────────────── */
async function cargarEstados(concepto) {
  statusBar.hidden = true;
  statusPills.innerHTML = "";
  state.estadosActivos.clear();
  state.estados = [];

  mostrarCargando("Cargando estados…");

  try {
    const data = await fetchJSON(`/api/estados?concepto=${encodeURIComponent(concepto)}`);
    state.estados = data;

    if (data.length === 0) {
      mostrarMensaje("Sin datos para este concepto.");
      return;
    }

    const nombresEstados = data.map(e => e.ESTATUSUSUARIO);

    statusPills.innerHTML = data.map(({ ESTATUSUSUARIO: est, total }) => {
      const color = colorEstado(est, nombresEstados);
      return `<button class="pill" data-estado="${est}"
                style="--pill-color:${color}">
                ${est}
                <span class="pill-badge">${total}</span>
              </button>`;
    }).join("");

    // Clicks en pills individuales
    statusPills.querySelectorAll(".pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const est = btn.dataset.estado;
        if (state.estadosActivos.has(est)) {
          state.estadosActivos.delete(est);
        } else {
          state.estadosActivos.add(est);
        }
        actualizarPills();
        cargarOrdenes();
      });
    });

    statusBar.hidden = false;
    actualizarPills();
    await cargarOrdenes();

  } catch (err) {
    mostrarMensaje(`Error al cargar estados: ${err.message}`, true);
  }
}

/* ── Inicialización ──────────────────────────────────────────── */
async function inicializar() {
  mostrarCargando("Conectando con el archivo Excel…");
  headerMeta.textContent = "CARGANDO…";

  try {
    const conceptos = await fetchJSON("/api/conceptos");

    selConcepto.innerHTML = conceptos.length
      ? `<option value="">— Selecciona un concepto —</option>` +
        conceptos.map(c => `<option value="${c}">${c}</option>`).join("")
      : `<option value="">Sin datos disponibles</option>`;

    headerMeta.textContent = `${conceptos.length} CONCEPTO${conceptos.length !== 1 ? "S" : ""} CARGADOS`;
    mostrarMensaje("Selecciona un Concepto Diseño para comenzar.");

  } catch (err) {
    selConcepto.innerHTML = `<option value="">Error al cargar</option>`;
    headerMeta.textContent = "ERROR";
    mostrarMensaje(`No se pudo conectar con el servidor: ${err.message}`, true);
  }
}

/* ── Eventos ─────────────────────────────────────────────────── */
selConcepto.addEventListener("change", () => {
  state.concepto = selConcepto.value;
  if (!state.concepto) {
    statusBar.hidden = true;
    mostrarMensaje("Selecciona un Concepto Diseño para comenzar.");
    return;
  }
  cargarEstados(state.concepto);
});

btnTodos.addEventListener("click", () => {
  state.estadosActivos.clear();
  actualizarPills();
  cargarOrdenes();
});

/* ── Arranque ─────────────────────────────────────────────────── */
inicializar();
