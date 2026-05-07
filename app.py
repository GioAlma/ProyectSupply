import os
import pandas as pd
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# ── Configuración ──────────────────────────────────────────────
EXCEL_PATH = os.path.join(os.path.expanduser("~"), "Desktop", "Lineas.xlsx")

COLUMNAS_REQUERIDAS = [
    "Concepto Diseño",
    "ESTATUSUSUARIO",
    "Orden",
    "FECHAINIEXTREMA",
    "Fecha Programacion",
    "COMENTARIOSCOMPRAS",
    "PUESTODESCARGA",
    "FProduccion",
    "CLASEOP",
    "PLANIFICADOR",
    "Cantidad Original",
]

COLUMNAS_FECHA = ["FECHAINIEXTREMA", "Fecha Programacion", "FProduccion"]


# ── Carga de datos (funcional, sin estado global mutable) ───────
def cargar_datos(ruta: str) -> tuple[pd.DataFrame | None, str | None]:
    """Lee el Excel y retorna (DataFrame, None) o (None, mensaje_error)."""
    if not os.path.isfile(ruta):
        return None, f"Archivo no encontrado: {ruta}"
    try:
        df = pd.read_excel(ruta, dtype=str)
    except Exception as exc:
        return None, f"Error al leer el Excel: {exc}"

    faltantes = [c for c in COLUMNAS_REQUERIDAS if c not in df.columns]
    if faltantes:
        return None, f"Columnas faltantes en el archivo: {faltantes}"

    df = df[COLUMNAS_REQUERIDAS].copy()
    df = normalizar_fechas(df)
    df = df.fillna("")
    return df, None


def normalizar_fechas(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte columnas de fecha a formato YYYY-MM-DD (cadena)."""
    for col in COLUMNAS_FECHA:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


def obtener_df() -> tuple[pd.DataFrame | None, str | None]:
    return cargar_datos(EXCEL_PATH)


# ── Helpers ─────────────────────────────────────────────────────
def respuesta_error(mensaje: str, codigo: int = 400):
    return jsonify({"error": mensaje}), codigo


def serie_unica_ordenada(df: pd.DataFrame, columna: str) -> list:
    return sorted(df[columna].dropna().unique().tolist())


# ── Rutas API ───────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/conceptos")
def api_conceptos():
    """Devuelve los valores únicos de 'Concepto Diseño'."""
    df, error = obtener_df()
    if error:
        return respuesta_error(error, 500)
    return jsonify(serie_unica_ordenada(df, "Concepto Diseño"))


@app.route("/api/estados")
def api_estados():
    """Devuelve los ESTATUSUSUARIO únicos para un Concepto Diseño dado,
    con el conteo de órdenes por estado."""
    concepto = request.args.get("concepto", "").strip()
    if not concepto:
        return respuesta_error("Parámetro 'concepto' requerido")

    df, error = obtener_df()
    if error:
        return respuesta_error(error, 500)

    filtrado = df[df["Concepto Diseño"] == concepto]
    if filtrado.empty:
        return jsonify([])

    conteos = (
        filtrado.groupby("ESTATUSUSUARIO")
        .size()
        .reset_index(name="total")
        .sort_values("ESTATUSUSUARIO")
    )
    return jsonify(conteos.to_dict(orient="records"))


@app.route("/api/ordenes")
def api_ordenes():
    """Devuelve las órdenes filtradas por Concepto Diseño y uno o
    varios ESTATUSUSUARIO (parámetro 'estado' repetible)."""
    concepto = request.args.get("concepto", "").strip()
    estados = request.args.getlist("estado")

    if not concepto:
        return respuesta_error("Parámetro 'concepto' requerido")

    df, error = obtener_df()
    if error:
        return respuesta_error(error, 500)

    filtrado = df[df["Concepto Diseño"] == concepto]

    if estados:
        filtrado = filtrado[filtrado["ESTATUSUSUARIO"].isin(estados)]

    columnas_tabla = [c for c in COLUMNAS_REQUERIDAS if c not in ("Concepto Diseño",)]
    return jsonify(filtrado[columnas_tabla].to_dict(orient="records"))


# ── Entry point ─────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000)
