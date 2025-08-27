// src/etl/sincronizar-colaboradores.etl.ts
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
const ARQUIVOS = [
  { nome: 'APRENDIZ.xlsx', tipo: 'APRENDIZ' },
  { nome: 'ESTÁGIO.xlsx', tipo: 'ESTAGIARIO' }
];

type Row = Record<string, any>;

function normalizeHeaders(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim().toUpperCase()] = v;
  }
  return out;
}

export async function runSincronizarColaboradores() {
  const ds = await getDataSource();
  const repo = ds.getRepository(Colaborador);

  let inseridos = 0, ignorados = 0;

  for (const { nome, tipo } of ARQUIVOS) {
    console.log(`🔄 Processando ${tipo}s do arquivo ${nome}...`);
    const file = path.join(XLS_DIR, nome);
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ Arquivo não encontrado: ${file}`);
      continue;
    }

    const rows = readSheet(file).map(normalizeHeaders);
    for (const r of rows) {
      const matricula = trimMatricula(r['MATRICULA'] ?? r['ID'] ?? r['CADASTRO']);
      if (!matricula) continue;
      console.log(`  - ${matricula} (${tipo})`);
      const exists = await repo.findOne({ where: { matricula } });
      if (exists) {
        ignorados++;
        continue;
      }
      console.log(r);
      console.log(ignorados)
      console.log(`    -> inserindo...`);
        const novo = repo.create({
        matricula,
        cargo: tipo, // "estagiario" ou "aprendiz"
        empresa: null,
        sindicato: null,
        data_admissao: null,
        data_desligamento: null,
        situacao: null,
        elegivel_beneficio: tipo !== 'estagiario', // false para estagiário, true para aprendiz
        motivo_inelegibilidade: null
        });

      await repo.save(novo);
      inseridos++;
    }
  }

  console.log(`✅ Colaboradores sincronizados: ${inseridos} inseridos, ${ignorados} já existiam.`);
}