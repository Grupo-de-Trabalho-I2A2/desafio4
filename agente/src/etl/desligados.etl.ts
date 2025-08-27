import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';
import { EventoDesligamento } from '../db/entities/evento-desligamento';
import { Colaborador } from '../db/entities/colaborador';
import { Aprendiz } from '../db/entities/aprendiz';
import { readSheet } from '../utils/excel';
import { trimMatricula, parseDateBR, parseBoolOK } from '../utils/normalize';

dotenv.config();

const XLS_DIR = path.resolve(process.cwd(), 'xls');
const FILE = path.join(XLS_DIR, 'DESLIGADOS.xlsx');

type Row = Record<string, any>;

function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim().toUpperCase()] = v;
  }
  return out;
}

/**
 * Converte string `dd/mm/aaaa`, `mm/dd/aa`, ISO ou serial Excel para `aaaa-mm-dd`.
 */
function parseAnyDateToISO(v: any): string | null {
  if (v == null || v === '') return null;

  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 86400000;
    const d = new Date(epoch.getTime() + ms);
    return d.toISOString().split('T')[0];
  }

  const s = String(v).trim();
  if (!s) return null;

  // ISO direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/yyyy
  const br = parseDateBR(s);
  if (br) return br;

  // mm/dd/yy fallback
  const parts = s.split('/');
  if (parts.length === 3 && parts[0].length === 1 || parts[1].length === 1) {
    const [mm, dd, yy] = parts.map(x => x.padStart(2, '0'));
    const yyyy = +yy > 50 ? `19${yy}` : `20${yy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

export async function runDesligados() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Arquivo não encontrado: ${FILE}`);
    return;
  }

  const rows = readSheet(FILE).map(normalizeHeaders);

  const ds = await getDataSource();
  const repo = ds.getRepository(EventoDesligamento);
  const colRepo = ds.getRepository(Colaborador);
  const aprRepo = ds.getRepository(Aprendiz);

  let ok = 0, skipSemMatricula = 0, skipDataInvalida = 0, skipColabNaoEncontrado = 0;

  for (const r of rows) {
    const matricula = trimMatricula(
      r['MATRICULA'] ?? r['CADASTRO'] ?? r['ID'] ?? r['COLABORADOR']
    );
    if (!matricula) {
      skipSemMatricula++;
      continue;
    }

    const rawDesl =
      r['DATA DEMISSÃO'] ?? r['DATA DEMISSAO'] ??
      r['DATA DESLIGAMENTO'] ?? r['DESLIGAMENTO'] ?? r['DT DESLIGAMENTO'];

    const data_desligamento = parseAnyDateToISO(rawDesl);
    if (!data_desligamento) {
      console.warn(`⚠️ Data de desligamento inválida para matrícula ${matricula}: ${rawDesl}`);
      skipDataInvalida++;
      continue;
    }

    const rawCom =
      r['DATA COMUNICADO'] ?? r['COMUNICADO EM'] ??
      r['DT COMUNICADO'] ?? r['COMUNICADO'];

    const data_comunicado = parseAnyDateToISO(rawCom);

    const comunicado_ok = parseBoolOK(
      r['COMUNICADO DE DESLIGAMENTO'] ??
      r['COMUNICADO OK'] ??
      r['COMUNICADO'] ?? ''
    );

    // Verifica se existe em colaboradores ou aprendizes
    const colab = await colRepo.findOne({ where: { matricula } });

    if (!colab) {
      skipColabNaoEncontrado++;
      continue;
    }

    await repo.save(repo.create({
      matricula,
      data_desligamento,
      data_comunicado,
      comunicado_ok
    }));

    ok++;
  }

  console.log(
    `✅ DESLIGADOS processado: ${ok} eventos; ` +
    `${skipSemMatricula} ignorados (sem matrícula); ` +
    `${skipDataInvalida} ignorados (data inválida); ` +
    `${skipColabNaoEncontrado} ignorados (colaborador não encontrado).`
  );
}