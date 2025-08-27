// arquivo: src/export/excel-oficial.ts
/**
 * Geração do Excel oficial:
 * - Lê tabela resultado_vr
 * - Exporta planilha final no formato esperado pelo fornecedor
 * - Cálculo de custo empresa (80%) e desconto colaborador (20%)
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import { getDataSource } from '../db/get-data-source';
import { ResultadoVR } from '../db/entities/resultado-vr';
import { Colaborador } from '../db/entities/colaborador';
import { Aprendiz } from '../db/entities/aprendiz';

dotenv.config();

function ensureCompetencia(): string {
  const c = process.env.COMPETENCIA?.trim();
  if (!c || !/^\d{4}-\d{2}$/.test(c)) {
    throw new Error('COMPETENCIA inválida (AAAA-MM no .env)');
  }
  return c;
}

export async function runExcelOficial() {
  const competencia = ensureCompetencia();
  const ds = await getDataSource();

  const repoRes = ds.getRepository(ResultadoVR);
  const repoColab = ds.getRepository(Colaborador);
  const repoApr = ds.getRepository(Aprendiz);

  // Buscar todos os resultados
  const resultados = await repoRes.find({ where: { competencia } });

  // Montar linhas do Excel
  const rows: any[] = [];
  for (const r of resultados) {
    // Buscar dados extras de colaborador/aprendiz
    let nome = '';
    let cargo = '';
    let empresa = '';
    let tipo = 'colaborador';

    const col = await repoColab.findOne({ where: { matricula: r.matricula } });
    if (col) {
      nome = col.matricula; // se não tiver nome, usamos matricula
      cargo = col.cargo ?? '';
      empresa = col.empresa ?? '';
      tipo = 'colaborador';
    } else {
      const apr = await repoApr.findOne({ where: { matricula: r.matricula } });
      if (apr) {
        nome = apr.matricula;
        cargo = apr.cargo ?? '';
        empresa = apr.empresa ?? '';
        tipo = 'aprendiz';
      }
    }

    rows.push({
      'Matrícula': r.matricula,
      'Nome': nome,
      'Empresa': empresa,
      'Cargo': cargo,
      'Sindicato do Colaborador': r.sindicato,
      'Competência': r.competencia,
      'Dias': r.dias_comprar,
      'VALOR DIÁRIO VR': Number(r.valor_diario),
      'TOTAL': Number(r.valor_total),
      'Custo empresa': Number(r.custeio_empresa),
      'Desconto profissional': Number(r.desconto_colaborador),
      'Origem': tipo
    });
  }

  if (rows.length === 0) {
    console.warn('⚠️ Nenhum dado em resultado_vr para exportar.');
    return;
  }

  // Gerar planilha
  const ws = XLSX.utils.json_to_sheet(rows); // sem { origin }, para evitar erro TS
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'VR Mensal');

  // Nome do arquivo
  const outDir = path.resolve(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, `VR-Mensal-${competencia}.xlsx`);

  XLSX.writeFile(wb, outFile);

  console.log(`✅ Excel oficial gerado: ${outFile} (${rows.length} linhas)`);
}