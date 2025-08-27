// arquivo: src/etl/aprendiz.etl.ts
/**
 * APRENDIZ (tabela separada, recebe VR):
 * - Lê xls/APRENDIZ.xlsx
 * - UPSERT em `aprendizes` (NÃO mexe na tabela `colaboradores`)
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { Aprendiz } from '../db/entities/aprendiz';
import { readSheet } from '../utils/excel';
import { trimMatricula, normalizeText, normalizeSindicato } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'APRENDIZ.xlsx');
const ALIAS_PATH = path.resolve(process.cwd(), 'src/etl/dictionaries/sindicato_alias.json');

type Row = Record<string, any>;
function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toUpperCase()] = v;
  return out;
}
function getMatricula(row: Row): string {
  return trimMatricula(row['MATRICULA'] ?? row['MATRÍCULA'] ?? row['CADASTRO'] ?? row['ID'] ?? row['COLABORADOR']);
}

export async function runAprendiz() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Arquivo não encontrado: ${FILE}`); return; }

  let aliasMap: Record<string, string[]> = {};
  if (fs.existsSync(ALIAS_PATH)) {
    try { aliasMap = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8')); }
    catch { /* segue sem alias */ }
  }

  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(Aprendiz);

  let upserts = 0, semMatricula = 0;

  for (const raw of rows) {
    const matricula = getMatricula(raw);
    if (!matricula) { semMatricula++; continue; }

    const empresa = normalizeText(raw['EMPRESA'] ?? raw['EMPRESA/NOME']);
    const cargo = normalizeText(raw['CARGO'] ?? raw['TITULO DO CARGO'] ?? raw['FUNCAO'] ?? raw['FUNÇÃO']);
    const situacao = normalizeText(raw['SITUACAO'] ?? raw['DESC. SITUACAO'] ?? raw['SITUAÇÃO']);
    const sindicatoRaw = normalizeText(raw['SINDICATO'] ?? raw['SINDICADO'] ?? raw['SINDICATO DO COLABORADOR'] ?? raw['SINDICATO/UF']);
    const sindicato = normalizeSindicato(sindicatoRaw ?? null, aliasMap);

    const existing = await repo.findOne({ where: { matricula } });
    if (existing) {
      existing.empresa = empresa ?? existing.empresa;
      existing.cargo = cargo ?? existing.cargo;
      existing.situacao = situacao ?? existing.situacao;
      existing.sindicato = sindicato ?? existing.sindicato;
      existing.elegivel_beneficio = true; // aprendizes recebem VR
      await repo.save(existing);
      upserts++;
    } else {
      const novo = repo.create({
        matricula,
        empresa: empresa ?? null,
        cargo: cargo ?? null,
        situacao: situacao ?? null,
        sindicato: sindicato ?? null,
        data_admissao: null,
        data_desligamento: null,
        elegivel_beneficio: true
      });
      await repo.save(novo);
      upserts++;
    }
  }

  console.log(`✅ APRENDIZ (tabela própria): ${upserts} upserts; ${semMatricula} ignorados (sem matrícula).`);
}