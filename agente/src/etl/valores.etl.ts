// arquivo: src/etl/valores.etl.ts
/**
 * VALORES (VR por sindicato):
 * - Lê xls/Base sindicato x valor.xlsx
 * - Normaliza sindicato (com alias) e valor diário (R$)
 * - Substitui registros existentes da competência (idempotente)
 * OBS: conexão centralizada via getDataSource() — nada de initialize/destroy aqui.
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { SindicatoValor } from '../db/entities/sindicato-valor';
import { readSheet } from '../utils/excel';
import { normalizeText, normalizeSindicato, ensureCompetencia } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'Base sindicato x valor.xlsx');
const ALIAS_PATH = path.resolve(process.cwd(), 'src/etl/dictionaries/sindicato_alias.json');

type Row = Record<string, any>;

function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim().toUpperCase()] = v;
  }
  return out;
}

/** Converte string/number de valor (com R$, pontos, vírgulas) para número JS com 2 casas */
function parseMoney(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number(v.toFixed(2));
  }
  let s = String(v).trim();

  // remove "R$" e espaços
  s = s.replace(/\s|R\$/gi, '');

  // Se tiver vírgula e ponto, define separador decimal pelo último símbolo
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // decimal é vírgula → remove pontos (milhar), troca vírgula por ponto
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // decimal é ponto → remove vírgulas (milhar)
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // só vírgula → decimal vírgula
    s = s.replace(/\./g, ''); // se tiver ponto perdido
    s = s.replace(',', '.');
  } else {
    // só ponto ou nada → mantém, remove vírgulas perdidas
    s = s.replace(/,/g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

export async function runValores() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Arquivo não encontrado: ${FILE}`);
    return;
  }

  // Carrega alias de sindicato (se existir)
  let aliasMap: Record<string, string[]> = {};
  if (fs.existsSync(ALIAS_PATH)) {
    try {
      aliasMap = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8'));
    } catch (e) {
      console.warn(`⚠️  Não foi possível ler ${ALIAS_PATH}. Prosseguindo sem alias.`, e);
    }
  }

  const competencia = ensureCompetencia();
  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(SindicatoValor);

  // Idempotência por competência
  await repo.delete({ competencia });

  let ok = 0, skipSind = 0, skipValor = 0;

  for (const r of rows) {
    const sindicatoRaw =
      r['SINDICATO'] ??
      r['SINDICADO'] ??
      r['SINDICATO DO COLABORADOR'] ??
      r['SINDICATO/UF'];

    const sindicato = normalizeSindicato(normalizeText(sindicatoRaw), aliasMap);
    if (!sindicato) { skipSind++; continue; }

    const valorRaw =
      r['VALOR'] ??
      r['VALOR VR'] ??
      r['VR'] ??
      r['VALOR_DIARIO'] ??
      r['VALOR DIARIO'] ??
      r['VALOR/DIA'] ??
      r['VALOR DIA'];

    const valor = parseMoney(valorRaw);
    if (valor == null || !(valor > 0)) { skipValor++; continue; }

    // Entidade usa DECIMAL(10,2); se seu entity está `number`, salvar número é OK.
    const rec = repo.create({
      competencia,
      sindicato,
      valor_diario: Number(valor.toFixed(2))
    });

    await repo.save(rec);
    ok++;
  }

  console.log(
    `✅ VALORES: ${ok} registros inseridos; ` +
    `${skipSind} ignorados (sindicato inválido); ` +
    `${skipValor} ignorados (valor inválido/zero).`
  );
}