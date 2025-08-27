// arquivo: src/etl/exterior.etl.ts
/**
 * EXTERIOR:
 * - Lê xls/EXTERIOR.xlsx
 * - Marca colaboradores como inelegíveis com motivo "Exterior"
 * - Verifica FK (só atualiza se a matrícula existir em `colaboradores`)
 * OBS: conexão centralizada via index.ts (não inicializa/destroi aqui)
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { Colaborador } from '../db/entities/colaborador';
import { readSheet } from '../utils/excel';
import { trimMatricula } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'EXTERIOR.xlsx');

type Row = Record<string, any>;

/** Normaliza cabeçalhos (MAIÚSCULO + trim) */
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim().toUpperCase()] = v;
  }
  return out;
}

/** Tenta achar matrícula em várias chaves comuns */
function getMatricula(row: Row): string {
  return trimMatricula(
    row['CADASTRO'] ??
    row['MATRICULA'] ??
    row['MATRÍCULA'] ??
    row['ID'] ??
    row['COLABORADOR']
  );
}

export async function runExterior() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Arquivo não encontrado: ${FILE}`);
    return; // não derruba o pipeline
  }

  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(Colaborador);

  let ok = 0;
  let skipSemMatricula = 0;
  let skipNaoEncontrado = 0;

  for (const raw of rows) {
    const matricula = getMatricula(raw);
    if (!matricula) { skipSemMatricula++; continue; }

    const col = await repo.findOne({ where: { matricula } });
    if (!col) { skipNaoEncontrado++; continue; }

    col.elegivel_beneficio = false;

    const motivos: string[] = Array.isArray(col.motivo_inelegibilidade)
      ? col.motivo_inelegibilidade
      : (col.motivo_inelegibilidade ?? []);

    if (!motivos.includes('Exterior')) motivos.push('Exterior');
    col.motivo_inelegibilidade = motivos;

    await repo.save(col);
    ok++;
  }

  console.log(
    `✅ EXTERIOR: ${ok} inelegíveis; ` +
    `${skipSemMatricula} ignorados (sem matrícula); ` +
    `${skipNaoEncontrado} ignorados (colaborador não encontrado).`
  );
}