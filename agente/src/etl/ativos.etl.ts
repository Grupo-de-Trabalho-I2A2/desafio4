// arquivo: src/etl/ativos.etl.ts
/**
 * ETL de ATIVOS:
 * - Lê xls/ATIVOS.xlsx (primeira aba)
 * - Normaliza cabeçalhos e campos
 * - Aplica alias de sindicato (src/etl/dictionaries/sindicato_alias.json)
 * - UPSERT em colaboradores (chave: matricula)
 * OBS: conexão centralizada via index.ts
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { Colaborador } from '../db/entities/colaborador';
import { readSheet } from '../utils/excel';
import { trimMatricula, normalizeText, normalizeSindicato } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'ATIVOS.xlsx');
const ALIAS_PATH = path.resolve(process.cwd(), 'src/etl/dictionaries/sindicato_alias.json');

type Row = Record<string, any>;
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toUpperCase()] = v;
  return out;
}

export async function runAtivos() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Arquivo não encontrado: ${FILE}`); return; }

  let aliasMap: Record<string, string[]> = {};
  if (fs.existsSync(ALIAS_PATH)) {
    try { aliasMap = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8')); }
    catch (e) { console.warn(`⚠️  Não foi possível ler ${ALIAS_PATH}.`, e); }
  }

  const rows = readSheet(FILE).map(normalizeHeaders);
  const ds = await getDataSource();
  const repo = ds.getRepository(Colaborador);

  let ok = 0, skip = 0;
  for (const r of rows) {
    const matricula = trimMatricula(r['MATRICULA']);
    if (!matricula) { skip++; continue; }

    const empresa = normalizeText(r['EMPRESA']);
    const cargo = normalizeText(r['TITULO DO CARGO'] ?? r['CARGO']);
    const situacao = normalizeText(r['DESC. SITUACAO'] ?? r['SITUACAO']);

    const sindicato = normalizeSindicato(
      normalizeText(r['SINDICATO'] ?? r['SINDICADO'] ?? r['SINDICATO DO COLABORADOR'] ?? r['SINDICATO/UF']),
      aliasMap
    );

    const existing = await repo.findOne({ where: { matricula } });
    if (existing) {
      existing.empresa = empresa ?? existing.empresa;
      existing.cargo = cargo ?? existing.cargo;
      existing.situacao = situacao ?? existing.situacao;
      existing.sindicato = sindicato ?? existing.sindicato;
      await repo.save(existing);
    } else {
      const col = repo.create({
        matricula,
        empresa: empresa ?? null,
        cargo: cargo ?? null,
        situacao: situacao ?? null,
        sindicato: sindicato ?? null,
        elegivel_beneficio: true,
        motivo_inelegibilidade: null
      });
      await repo.save(col);
    }
    ok++;
  }

  console.log(`✅ ATIVOS processado: ${ok} upserts, ${skip} ignorados (sem matrícula).`);
}