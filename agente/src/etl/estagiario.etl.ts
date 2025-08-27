// arquivo: src/etl/estagiario.etl.ts
/**
 * ESTAGIÁRIO (tabela separada):
 * - Lê xls/ESTÁGIO.xlsx
 * - UPSERT em `estagiarios`
 * - elegivel_beneficio = false (padrão) — pode ser habilitado depois por regra de sindicato
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { Estagiario } from '../db/entities/estagiario';
import { readSheet } from '../utils/excel';
import { trimMatricula, normalizeText, normalizeSindicato } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'ESTÁGIO.xlsx');
const ALIAS_PATH = path.resolve(process.cwd(), 'src/etl/dictionaries/sindicato_alias.json');

type Row = Record<string, any>;
const headers = (row: Row) => {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toUpperCase()] = v;
  return out;
};
const getMatricula = (r: Row) =>
  trimMatricula(r['MATRICULA'] ?? r['MATRÍCULA'] ?? r['CADASTRO'] ?? r['ID'] ?? r['COLABORADOR']);

export async function runEstagiarioTabela() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Arquivo não encontrado: ${FILE}`); return; }

  let aliasMap: Record<string, string[]> = {};
  if (fs.existsSync(ALIAS_PATH)) {
    try { aliasMap = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8')); } catch {}
  }

  const rows = readSheet(FILE).map(headers);
  const ds = await getDataSource();
  const repo = ds.getRepository(Estagiario);

  let upserts = 0, semMatricula = 0;

  for (const r of rows) {
    const matricula = getMatricula(r);
    if (!matricula) { semMatricula++; continue; }

    const empresa   = normalizeText(r['EMPRESA'] ?? r['EMPRESA/NOME']);
    const cargo     = normalizeText(r['CARGO'] ?? r['TITULO DO CARGO'] ?? r['FUNCAO'] ?? r['FUNÇÃO']);
    const situacao  = normalizeText(r['SITUACAO'] ?? r['DESC. SITUACAO'] ?? r['SITUAÇÃO']);
    const sindicatoRaw = normalizeText(r['SINDICATO'] ?? r['SINDICATO DO COLABORADOR'] ?? r['SINDICATO/UF']);
    const sindicato = normalizeSindicato(sindicatoRaw ?? null, aliasMap) ?? sindicatoRaw ?? null;

    const existing = await repo.findOne({ where: { matricula } });
    if (existing) {
      existing.empresa   = empresa   ?? existing.empresa;
      existing.cargo     = cargo     ?? existing.cargo;
      existing.situacao  = situacao  ?? existing.situacao;
      existing.sindicato = sindicato ?? existing.sindicato;
      // mantém elegibilidade atual (default false)
      await repo.save(existing);
      upserts++;
    } else {
      const novo: Estagiario = repo.create({
        matricula,
        empresa: empresa ?? null,
        cargo: cargo ?? null,
        situacao: situacao ?? null,
        sindicato: sindicato ?? null,
        data_admissao: null,
        data_desligamento: null,
        elegivel_beneficio: false, // << boolean (não 0)
      } as Partial<Estagiario>); // ajuda o TS no overload
      await repo.save(novo);
      upserts++;
    }
  }

  console.log(`✅ ESTAGIÁRIOS (tabela própria): ${upserts} upserts; ${semMatricula} ignorados (sem matrícula).`);
}