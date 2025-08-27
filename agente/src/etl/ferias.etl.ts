// arquivo: src/etl/ferias.etl.ts
/**
 * ETL de FÉRIAS:
 * - Lê xls/FÉRIAS.xlsx
 * - Insere em eventos_ferias para a COMPETENCIA (.env)
 * OBS: conexão centralizada via index.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { EventoFerias } from '../db/entities/evento-ferias';
import { readSheet } from '../utils/excel';
import { trimMatricula, parseIntSafe, ensureCompetencia } from '../utils/normalize';
import { Colaborador } from '../db/entities/colaborador';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'FÉRIAS.xlsx');

type Row = Record<string, any>;
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toUpperCase()] = v;
  return out;
}

export async function runFerias() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Arquivo não encontrado: ${FILE}`); return; }

  const competencia = ensureCompetencia();
  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(EventoFerias);

  await repo.delete({ competencia });


  let ok = 0, skip = 0, notFound = 0;
  const colabRepo = ds.getRepository(Colaborador);

  for (const r of rows) {
    const matricula = trimMatricula(r['MATRICULA']);
    if (!matricula) { skip++; continue; }

    // Verifica se existe na tabela de colaboradores
    const exists = await colabRepo.findOne({ where: { matricula } });
    if (!exists) { notFound++; continue; }

    const dias = parseIntSafe(r['DIAS DE FÉRIAS'] ?? r['FERIAS'] ?? r['DIAS'], 0);

    await repo.save(repo.create({ competencia, matricula, dias_ferias_mes: dias }));
    ok++;
  }

  console.log(`✅ FÉRIAS processado: ${ok} registros; ${skip} ignorados (sem matrícula); ${notFound} ignorados (sem colaborador).`);
}