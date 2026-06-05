#!/usr/bin/env python3
"""
Limpia y valida el CSV de entradas para importar a Supabase.
Tabla destino: public.entradas
"""

import csv
import re
import sys

INPUT_FILE = "entradas.csv"
OUTPUT_FILE = "entradas_supabase.csv"

# --- Helper functions ---

def fix_valor(valor_str: str) -> str:
    """Convierte valores como 'R$ 1.200,00' o '-R$ 1,00' a formato numérico '1200.00'.
    Si la cadena está vacía o no es válida, devuelve '0.00'."""
    if not valor_str:
        return "0.00"
    s = valor_str.strip()
    negative = s.startswith('-')
    s = s.replace('-', '').replace('R$', '').replace('R$', '').strip()
    s = s.replace('.', '').replace(',', '.')
    try:
        val = float(s)
        if negative:
            val = -val
        return f"{val:.2f}"
    except ValueError:
        return "0.00"


def fix_email(email: str) -> str:
    """Limpia emails con errores comunes y devuelve una cadena vacía si es inválido."""
    if not email:
        return ""
    email = email.strip()
    if email.endswith('.'):
        email = email[:-1]
    # Simple email regex
    pattern = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'
    return email.lower() if re.match(pattern, email) else ""


def fix_phone(phone: str) -> str:
    """Deja solo dígitos en el teléfono."""
    if not phone:
        return ""
    return re.sub(r'\D', '', phone.strip())


def fix_int(num_str: str) -> str:
    """Convierte cadenas como '1.0' o '2026.0' a entero sin decimales.
    Devuelve cadena vacía si la conversión falla."""
    if not num_str:
        return ""
    try:
        return str(int(float(num_str)))
    except ValueError:
        return ""


def fix_text(text: str) -> str:
    return text.strip() if text else ""

# Expected headers in the output (order matters for Supabase)
OUTPUT_HEADERS = [
    "id_kommo",
    "fecha",
    "nombre_pix",
    "valor",
    "servicio",
    "cliente",
    "telefono",
    "email",
    "pais",
    "ciudad",
    "estado",
    "cpf",
    "atendente",
    "utm_source",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "recorrencia",
    "mes",
    "ano",
]

# Read input using DictReader to safely handle missing columns
with open(INPUT_FILE, "r", encoding="utf-8") as fin, \
        open(OUTPUT_FILE, "w", encoding="utf-8", newline="") as fout:
    reader = csv.DictReader(fin)
    writer = csv.writer(fout, quoting=csv.QUOTE_MINIMAL)

    # Write header
    writer.writerow(OUTPUT_HEADERS)

    rows_ok = 0
    rows_skipped = 0
    invalid_emails = []

    for line_num, row in enumerate(reader, start=2):
        # Ensure all needed keys exist; missing keys will be None
        # Trim and clean each field
        id_kommo = fix_text(row.get("id_kommo", ""))
        fecha = fix_text(row.get("fecha", ""))
        nombre_pix = fix_text(row.get("nombre_pix", ""))
        valor = fix_valor(row.get("valor", ""))
        servicio = fix_text(row.get("servicio", ""))
        cliente = fix_text(row.get("cliente", ""))
        telefono = fix_phone(row.get("telefono", ""))
        email_raw = row.get("email", "") or ""
        email = fix_email(email_raw)
        pais = fix_text(row.get("pais", ""))
        ciudad = fix_text(row.get("ciudad", ""))
        estado = fix_text(row.get("estado", ""))
        cpf = fix_text(row.get("cpf", ""))
        atendente = fix_text(row.get("atendente", ""))
        utm_source = fix_text(row.get("utm_source", ""))
        utm_campaign = fix_text(row.get("utm_campaign", ""))
        utm_content = fix_text(row.get("utm_content", ""))
        utm_medium = fix_text(row.get("utm_medium", ""))
        recorrencia = fix_text(row.get("recorrencia", ""))
        mes = fix_int(row.get("mes", ""))
        ano = fix_int(row.get("ano", ""))

        # Log invalid emails (original non‑empty but cleaned to empty)
        if email_raw.strip() and not email:
            invalid_emails.append((line_num, nombre_pix, email_raw.strip()))

        writer.writerow([
            id_kommo,
            fecha,
            nombre_pix,
            valor,
            servicio,
            cliente,
            telefono,
            email,
            pais,
            ciudad,
            estado,
            cpf,
            atendente,
            utm_source,
            utm_campaign,
            utm_content,
            utm_medium,
            recorrencia,
            mes,
            ano,
        ])
        rows_ok += 1

print(f"✅ Filas exportadas correctamente: {rows_ok}")
print(f"⚠️  Filas omitidas (columnas faltantes): {rows_skipped}")
print(f"📧 Emails inválidos limpiados (campo dejado vacío): {len(invalid_emails)}")
if invalid_emails:
    print("\nLista de emails inválidos:")
    for ln, name, em in invalid_emails:
        print(f"  Línea {ln} | {name}: '{em}'")
print(f"\n📁 Archivo generado: {OUTPUT_FILE}")
