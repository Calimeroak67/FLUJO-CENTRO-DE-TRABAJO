#!/usr/bin/env python3
"""
Limpia y valida el CSV de clientes para importar a Supabase.
Tabla destino: public.clientes
"""

import csv
import re
import sys

INPUT_FILE = "clientes pcbr.csv"
OUTPUT_FILE = "clientes_supabase.csv"

def fix_valor(valor_str):
    """
    Convierte 'R$ 1.200,00' o 'R$ 0,00' o '-R$ 1,00' a formato numérico '1200.00'
    """
    if not valor_str:
        return "0.00"
    # Eliminar 'R$', espacios, y manejar negativos
    s = valor_str.strip()
    negative = s.startswith("-")
    s = s.replace("-", "").replace("R$", "").strip()
    # Quitar puntos de miles y reemplazar coma decimal por punto
    s = s.replace(".", "").replace(",", ".")
    try:
        val = float(s)
        if negative:
            val = -val
        return f"{val:.2f}"
    except ValueError:
        return "0.00"

def fix_email(email):
    """Limpia emails con errores comunes."""
    if not email:
        return ""
    email = email.strip()
    # Eliminar punto al final
    if email.endswith("."):
        email = email[:-1]
    # Verificar que tiene '@' y un dominio válido
    pattern = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'
    if not re.match(pattern, email):
        # Email inválido - devolver vacío para no romper la importación
        return ""
    return email.lower()

def fix_phone(phone):
    """Limpia el teléfono dejando solo dígitos."""
    if not phone:
        return ""
    return re.sub(r'\D', '', phone.strip())

def fix_text(text):
    """Limpia texto general."""
    if not text:
        return ""
    return text.strip()

# Mapeo de columnas del CSV a la tabla de Supabase
# CSV:    FECHA, CPF, CLIENTE, TELEFONO, EMAIL, VALOR, PAIS, CIUDAD, ESTADO, CANAL ADQUISICIÓN
# Tabla:  fecha, cpf, nombre,  telefono, email, valor_total, pais, ciudad, estado, canal_adquisicion

rows_ok = 0
rows_skipped = 0
invalid_emails = []

with open(INPUT_FILE, "r", encoding="utf-8") as fin, \
     open(OUTPUT_FILE, "w", encoding="utf-8", newline="") as fout:

    reader = csv.reader(fin)
    writer = csv.writer(fout, quoting=csv.QUOTE_MINIMAL)

    # Escribir header según la tabla de Supabase (sin id, creado_en, modificado_en - se generan automáticamente)
    writer.writerow([
        "fecha",
        "cpf",
        "nombre",
        "telefono",
        "email",
        "valor_total",
        "pais",
        "ciudad",
        "estado",
        "canal_adquisicion"
    ])

    next(reader)  # Saltar header original

    for line_num, row in enumerate(reader, start=2):
        if len(row) < 10:
            rows_skipped += 1
            continue

        fecha    = fix_text(row[0])
        cpf      = fix_text(row[1])
        nombre   = fix_text(row[2])
        telefono = fix_phone(row[3])
        email    = fix_email(row[4])
        valor    = fix_valor(row[5])
        pais     = fix_text(row[6])
        ciudad   = fix_text(row[7])
        estado   = fix_text(row[8])
        canal    = fix_text(row[9])

        # Registrar emails inválidos
        if row[4].strip() and not email:
            invalid_emails.append((line_num, row[2], row[4].strip()))

        writer.writerow([fecha, cpf, nombre, telefono, email, valor, pais, ciudad, estado, canal])
        rows_ok += 1

print(f"✅ Filas exportadas correctamente: {rows_ok}")
print(f"⚠️  Filas omitidas (columnas faltantes): {rows_skipped}")
print(f"📧 Emails inválidos limpiados (campo dejado vacío): {len(invalid_emails)}")
if invalid_emails:
    print("\nLista de emails inválidos:")
    for ln, name, em in invalid_emails:
        print(f"  Línea {ln} | {name}: '{em}'")

print(f"\n📁 Archivo generado: {OUTPUT_FILE}")
