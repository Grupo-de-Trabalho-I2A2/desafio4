import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import { getDataSource } from '../db/get-data-source';
import { ResultadoVR } from '../db/entities/resultado-vr';
import { Colaborador } from '../db/entities/colaborador';

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

  const resultados = await repoRes.find({ where: { competencia } });
  const colaboradores = await repoColab.find();

  // Cria mapa de matrícula → colaborador
  const colabMap = new Map(colaboradores.map(c => [c.matricula, c]));

  // Montar linhas do Excel
  const rows: any[] = [];
  for (const r of resultados) {
    const col = colabMap.get(r.matricula);
    const nome = col?.matricula ?? '';
    const cargo = col?.cargo ?? '';
    const empresa = col?.empresa ?? '';
    const tipo = r.justificativas?.origem ?? 'colaborador';

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
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'VR Mensal');

  const outDir = path.resolve(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const [ano, mes] = competencia.split('-');
  const competenciaFormatada = `${mes}.${ano}`;
  const outFile = path.join(outDir, `VR MENSAL ${competenciaFormatada} vfinal.xlsx`);

  XLSX.writeFile(wb, outFile);

  console.log(`✅ Excel oficial gerado: ${outFile} (${rows.length} linhas)`);
}