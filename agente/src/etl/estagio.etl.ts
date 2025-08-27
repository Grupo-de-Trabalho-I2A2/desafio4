// arquivo: src/etl/estagio.etl.ts
/**
 * ESTÁGIO:
 * - Lê xls/ESTÁGIO.xlsx
 * - Marca colaboradores como inelegíveis com motivo "Estagiario"
 * - Verifica FK (só atualiza se a matrícula existir em `colaboradores`)
 * OBS: conexão centralizada via index.ts
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
const FILE = path.join(XLS_DIR, 'ESTÁGIO.xlsx');

type Row = Record<string, any>;

/** Normaliza cabeçalhos */
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim().toUpperCase()] = v;
  }
  return out;
}

function getMatricula(row: Row): string {
  return trimMatricula(
    row['MATRICULA'] ??
    row['MATRÍCULA'] ??
    row['CADASTRO'] ??
    row['ID'] ??
    row['COLABORADOR']
  );
}

export async function runEstagio() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Arquivo não encontrado: ${FILE}`);
    return;
  }

  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(Colaborador);

  let ok = 0, skipSemMatricula = 0, skipNaoEncontrado = 0;

  for (const raw of rows) {
    const matricula = getMatricula(raw);
    if (!matricula) { skipSemMatricula++; continue; }

    const col = await repo.findOne({ where: { matricula } });
    if (!col) { skipNaoEncontrado++; continue; }

    col.elegivel_beneficio = false;

    const motivos: string[] = Array.isArray(col.motivo_inelegibilidade)
      ? col.motivo_inelegibilidade
      : (col.motivo_inelegibilidade ?? []);

    if (!motivos.includes('Estagiario')) motivos.push('Estagiario');
    col.motivo_inelegibilidade = motivos;

    await repo.save(col);
    ok++;
  }

  console.log(
    `✅ ESTÁGIO: ${ok} inelegíveis; ` +
    `${skipSemMatricula} ignorados (sem matrícula); ` +
    `${skipNaoEncontrado} ignorados (colaborador não encontrado).`
  );
}