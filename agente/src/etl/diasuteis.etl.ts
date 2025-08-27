// arquivo: src/etl/diasuteis.etl.ts

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { SindicatoDiasUteis } from '../db/entities/sindicato-dias-uteis';
import { readSheet } from '../utils/excel';
import { normalizeText, normalizeSindicato, ensureCompetencia } from '../utils/normalize';

dotenv.config();

const XLS_DIR    = path.resolve(process.cwd(), 'xls');
const FILE       = path.join(XLS_DIR, 'Base dias uteis.xlsx');
const ALIAS_PATH = path.resolve(process.cwd(), 'src/etl/dictionaries/sindicato_alias.json');
const OV_DIR     = path.resolve(process.cwd(), 'src/etl/overrides');

type Row = Record<string, any>;

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    const key = fold(String(k)).toUpperCase();
    out[key] = v;
  }
  return out;
}

function parseDias(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function findSindicatoKey(keys: string[]): string | null {
  return keys.find(h => /SINDIC/.test(h)) ?? null;
}

function findDiasKey(keys: string[]): string | null {
  let k = keys.find(h => /DIAS/.test(h) && /(UTEIS|ÚTEIS)/.test(h));
  if (k) return k;
  k = keys.find(h => /DIAS/.test(h));
  if (k) return k;
  return keys.find(h => /(UTEIS|ÚTEIS)/.test(h)) ?? null;
}

export async function runDiasUteis() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Arquivo não encontrado: ${FILE}`);
    return;
  }

  let aliasMap: Record<string, string[]> = {};
  if (fs.existsSync(ALIAS_PATH)) {
    try {
      aliasMap = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8'));
    } catch {}
  }

  const competencia = ensureCompetencia();
  let rawRows = readSheet(FILE);

  if (!rawRows.length) {
    console.warn('⚠️ Planilha de dias úteis vazia.');
    return;
  }

  // ⚠️ Remove a primeira linha SEM checar conteúdo
  rawRows = rawRows.slice(1);

  if (!rawRows.length) {
    console.warn('⚠️ Planilha de dias úteis vazia após remover a primeira linha.');
    return;
  }

  const rows = rawRows.map(normalizeHeaders);

  let keySind: string | null = null;
  let keyDias: string | null = null;

  // Tentamos detectar colunas válidas
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const keys = Object.keys(row).filter(k => k && k !== '__EMPTY');

    const ks = findSindicatoKey(keys);
    const kd = findDiasKey(keys);

    if (ks && kd) {
      keySind = ks;
      keyDias = kd;

      // remove todas as linhas até esta (inclusive as zoadas antes)
      rows.splice(0, i + 1); 
      break;
    }
  }

  if (!keySind || !keyDias) {
    console.error(`❌ Não foi possível identificar as colunas. Headers vistos: ${Object.keys(rows[0]).join(' | ')}`);
    return;
  }

  const ds = await getDataSource();
  const repo = ds.getRepository(SindicatoDiasUteis);
  await repo.delete({ competencia });

  let ok = 0, skip = 0;
  const debugSamples: Array<{ sraw: any; sind: string | null; dias: number | null }> = [];

  for (const r of rows) {
    const sindicatoRaw = r[keySind];
    const diasRaw = r[keyDias];

    if (sindicatoRaw == null && diasRaw == null) continue;

    const sindicatoNormTxt = normalizeText(sindicatoRaw);
    const sindicato = normalizeSindicato(sindicatoNormTxt, aliasMap) ?? sindicatoNormTxt;
    const dias = parseDias(diasRaw);

    if (debugSamples.length < 5) {
      debugSamples.push({ sraw: sindicatoRaw, sind: sindicato, dias });
    }

    if (!sindicato || dias == null || dias <= 0) {
      skip++;
      continue;
    }

    await repo.save(repo.create({ competencia, sindicato, dias_uteis: dias }));
    ok++;
  }

  const overrideFile = path.join(OV_DIR, `dias_uteis.${competencia}.json`);
  if (fs.existsSync(overrideFile)) {
    try {
      const overrides: Record<string, number> = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
      let applied = 0;
      for (const [sind, dias] of Object.entries(overrides)) {
        if (typeof dias === 'number' && dias > 0) {
          await repo
            .createQueryBuilder()
            .delete()
            .where('competencia = :c AND TRIM(sindicato) = :s', { c: competencia, s: sind })
            .execute();
          await repo.save(repo.create({ competencia, sindicato: sind, dias_uteis: Math.round(dias) }));
          applied++;
        }
      }
      console.log(`ℹ️ Override de dias úteis aplicado: ${applied} sindicato(s).`);
    } catch (e) {
      console.warn(`⚠️ Override inválido em ${overrideFile}.`, e);
    }
  }

  if (debugSamples.length) {
    console.log('🔎 Amostras DIAS ÚTEIS (primeiras 5 linhas detectadas):');
    for (const s of debugSamples) {
      console.log(`  • sindicatoRaw="${s.sraw}" -> sindicato="${s.sind}" | dias=${s.dias}`);
    }
  }

  console.log(`✅ DIAS ÚTEIS: ${ok} registros; ${skip} ignorados (sindicato/dias inválidos).`);
}