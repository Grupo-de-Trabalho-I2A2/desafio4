// arquivo: src/etl/afastamentos.etl.ts
/**
 * ETL de AFASTAMENTOS:
 * - Lê xls/AFASTAMENTOS.xlsx
 * - Insere em eventos_afastamentos para a COMPETENCIA
 * - Marca colaborador como inelegível (motivo "Afastado")
 * OBS: conexão centralizada via index.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { EventoAfastamento } from '../db/entities/evento-afastamento';
import { Colaborador } from '../db/entities/colaborador';
import { readSheet } from '../utils/excel';
import { trimMatricula, normalizeText, ensureCompetencia } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'AFASTAMENTOS.xlsx');

type Row = Record<string, any>;
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toUpperCase()] = v;
  return out;
}

export async function runAfastamentos() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Arquivo não encontrado: ${FILE}`); return; }

  const competencia = ensureCompetencia();
  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repoAfast = ds.getRepository(EventoAfastamento);
  const repoColab = ds.getRepository(Colaborador);

  await repoAfast.delete({ competencia });

  let ok = 0, skip = 0;
  for (const r of rows) {
    const matricula = trimMatricula(r['MATRICULA']);
    if (!matricula) { skip++; continue; }

    const tipo = normalizeText(r['DESC. SITUACAO'] ?? r['SITUACAO'] ?? r['TIPO'] ?? 'Afastamento') ?? 'Afastamento';

    await repoAfast.save(repoAfast.create({ competencia, matricula, tipo_afastamento: tipo, excluir_da_compra: true }));

    const col = await repoColab.findOne({ where: { matricula } });
    if (col) {
      col.elegivel_beneficio = false;
      const motivos: string[] = Array.isArray(col.motivo_inelegibilidade) ? col.motivo_inelegibilidade : (col.motivo_inelegibilidade ?? []);
      if (!motivos.includes('Afastado')) motivos.push('Afastado');
      col.motivo_inelegibilidade = motivos;
      await repoColab.save(col);
    }

    ok++;
  }

  console.log(`✅ AFASTAMENTOS processado: ${ok} registros; ${skip} ignorados (sem matrícula).`);
}