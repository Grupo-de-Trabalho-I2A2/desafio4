// arquivo: src/calc/calculo-vr.ts
/**
 * CÁLCULO DO VR (consolidado):
 * - Consolida COLABORADORES + APRENDIZES + ESTAGIÁRIOS (estagiário entra só se elegível=1)
 * - Aplica DIAS ÚTEIS e VALOR por sindicato (da competência do .env)
 * - Aplica FÉRIAS, AFASTAMENTOS e DESLIGAMENTO (somente para COLABORADORES)
 * - Grava resultado em `resultado_vr`
 *
 * ENV (opcional):
 *   COMPETENCIA=AAAA-MM                 (obrigatório)
 *   VR_DESLIG_PROP=ATE_DATA|RESTO_MES  (default: ATE_DATA)
 *   VR_ROUND=FLOOR|ROUND|CEIL          (default: FLOOR)
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { getDataSource } from '../db/get-data-source';

import { Colaborador } from '../db/entities/colaborador';
import { Aprendiz } from '../db/entities/aprendiz';
import { Estagiario } from '../db/entities/estagiario';

import { EventoFerias } from '../db/entities/evento-ferias';
import { EventoDesligamento } from '../db/entities/evento-desligamento';
import { EventoAfastamento } from '../db/entities/evento-afastamento';

import { SindicatoDiasUteis } from '../db/entities/sindicato-dias-uteis';
import { SindicatoValor } from '../db/entities/sindicato-valor';

import { ResultadoVR } from '../db/entities/resultado-vr';

dotenv.config();

/** Valida COMPETENCIA no formato AAAA-MM */
function ensureCompetencia(): string {
  const c = process.env.COMPETENCIA?.trim();
  if (!c || !/^\d{4}-\d{2}$/.test(c)) {
    throw new Error('COMPETENCIA inválida (use AAAA-MM no .env)');
  }
  return c;
}

/** Último dia do mês da competência */
function lastDayOfMonth(competencia: string): number {
  const [y, m] = competencia.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Retorna dia do mês (1..31) a partir de 'AAAA-MM-DD' */
function dayOfMonth(iso: string): number {
  return new Date(iso + 'T00:00:00').getDate();
}

/** Formata para string com 2 casas, sem “artefatos” de binário */
function fix2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

type Pessoa = {
  tipo: 'colaborador' | 'aprendiz' | 'estagiario';
  matricula: string;
  sindicato: string | null;
  elegivel: boolean;
};

export async function runCalculoVR() {
  const competencia = ensureCompetencia();
  const ds = await getDataSource();

  // === Repositórios ===
  const colabRepo   = ds.getRepository(Colaborador);
  const aprRepo     = ds.getRepository(Aprendiz);
  const estRepo     = ds.getRepository(Estagiario);

  const feriasRepo  = ds.getRepository(EventoFerias);
  const desligRepo  = ds.getRepository(EventoDesligamento);
  const afastRepo   = ds.getRepository(EventoAfastamento);

  const diasRepo    = ds.getRepository(SindicatoDiasUteis);
  const valorRepo   = ds.getRepository(SindicatoValor);

  const resRepo     = ds.getRepository(ResultadoVR);

  // Limpa os resultados da competência (idempotência)
  await resRepo.delete({ competencia });

  // === Carregamentos auxiliares (competência quando aplicável) ===
  const [
    diasRows,
    valorRows,
    feriasRows,
    desligRows,
    afastRows,
    colaboradores,
    aprendizes,
    estagiarios
  ] = await Promise.all([
    diasRepo.find({ where: { competencia } }),
    valorRepo.find({ where: { competencia } }),
    feriasRepo.find({ where: { competencia } }),
    desligRepo.find(),
    afastRepo.find({ where: { competencia } }),
    colabRepo.find(),
    aprRepo.find(),
    estRepo.find()
  ]);

  // === Mapas de lookup ===
  const diasMap = new Map<string, number>();
  for (const r of diasRows) {
    const k = (r.sindicato || '').trim();
    if (k) diasMap.set(k, r.dias_uteis);
  }

  const valorMap = new Map<string, number>();
  for (const r of valorRows) {
    const k = (r.sindicato || '').trim();
    if (!k) continue;
    // TypeORM pode devolver DECIMAL como string — normalizamos para number
    const v = typeof (r as any).valor_diario === 'string'
      ? Number((r as any).valor_diario)
      : (r as any).valor_diario;
    if (Number.isFinite(v)) valorMap.set(k, Number(v));
  }

  const feriasMap = new Map<string, number>(); // apenas colaboradores
  for (const f of feriasRows) feriasMap.set(f.matricula, f.dias_ferias_mes);

  const afastSet = new Set<string>(afastRows.map(a => a.matricula)); // apenas colaboradores

  const desligMap = new Map<string, { data_desligamento: string; data_comunicado: string | null; comunicado_ok: boolean }>();
  for (const d of desligRows) {
    desligMap.set(d.matricula, {
      data_desligamento: d.data_desligamento,
      data_comunicado: d.data_comunicado,
      comunicado_ok: !!d.comunicado_ok
    });
  }

  // === Consolida pessoas (3 fontes) ===
  const pessoas: Pessoa[] = [
    ...colaboradores.map<Pessoa>(c => ({
      tipo: 'colaborador',
      matricula: c.matricula,
      sindicato: c.sindicato,
      elegivel: c.elegivel_beneficio !== false
    })),
    ...aprendizes.map<Pessoa>(a => ({
      tipo: 'aprendiz',
      matricula: a.matricula,
      sindicato: a.sindicato,
      elegivel: a.elegivel_beneficio !== false
    })),
    ...estagiarios.map<Pessoa>(e => ({
      tipo: 'estagiario',
      matricula: e.matricula,
      sindicato: e.sindicato,
      // por padrão, estagiário = 0 (não recebe VR); pode ser habilitado por regra futura
      elegivel: e.elegivel_beneficio !== false
    }))
  ];

  // === Parâmetros de regra ===
  const CORTE = 15;
  const totalDiasMes = lastDayOfMonth(competencia);

  const PROP = (process.env.VR_DESLIG_PROP || 'ATE_DATA').toUpperCase(); // 'ATE_DATA' | 'RESTO_MES'
  const ROUND = (process.env.VR_ROUND || 'FLOOR').toUpperCase();         // 'FLOOR' | 'ROUND' | 'CEIL'
  const roundFn = ROUND === 'CEIL' ? Math.ceil : (ROUND === 'ROUND' ? Math.round : Math.floor);

  // === Loop principal ===
  let gravados = 0;

  for (const p of pessoas) {
    const sindicato = (p.sindicato || '').trim();
    if (!sindicato) continue;

    const diasUteisSind = diasMap.get(sindicato) ?? 0;
    const valorDia = valorMap.get(sindicato) ?? 0;
    if (diasUteisSind <= 0 || valorDia <= 0) continue;

    // Exclusões gerais (inelegível ou afastado)
    if (!p.elegivel || (p.tipo === 'colaborador' && afastSet.has(p.matricula))) {
      const total = 0;
      await resRepo.save(resRepo.create({
        competencia,
        matricula: p.matricula,
        sindicato,
        dias_comprar: 0,
        valor_diario: fix2(valorDia),
        valor_total: fix2(total),
        custeio_empresa: fix2(total * 0.8),
        desconto_colaborador: fix2(total * 0.2),
        justificativas: {
          origem: p.tipo,
          fonte_dias: 'sindicato',
          ferias_subtraidas: 0,
          desligamento_regra: 'nao_aplica',
          exclusoes_aplicadas: ['inelegivel_ou_afastado']
        },
        fonte_dias: 'sindicato'
      }));
      gravados++;
      continue;
    }

    // Base de dias: sindicato - férias (férias só p/ colaboradores)
    const ferias = (p.tipo === 'colaborador') ? (feriasMap.get(p.matricula) ?? 0) : 0;
    let diasBase = Math.max(diasUteisSind - ferias, 0);
    let desligRegra: 'ate_dia_15' | 'apos_dia_15' | 'nao_aplica' = 'nao_aplica';

    // Regra de desligamento (apenas para colaboradores)
    if (p.tipo === 'colaborador') {
      const d = desligMap.get(p.matricula);
      if (d && d.comunicado_ok) {
        const ref = d.data_comunicado || d.data_desligamento;
        const diaCom = dayOfMonth(ref);
        if (diaCom <= CORTE) {
          // Comunicado OK até dia 15 → não paga
          desligRegra = 'ate_dia_15';
          diasBase = 0;
        } else {
          // Comunicado após dia 15 → proporcional
          desligRegra = 'apos_dia_15';
          let fator = 0;
          if (PROP === 'ATE_DATA') {
            // proporcional até o dia comunicado (ex.: dia 20 de um mês com 31 → 20/31)
            fator = diaCom / totalDiasMes;
          } else {
            // proporcional somente ao restante do mês após o corte (ex.: dias restantes a partir do dia 16)
            fator = (totalDiasMes - CORTE) / totalDiasMes;
          }
          fator = Math.min(Math.max(fator, 0), 1);
          diasBase = roundFn(diasBase * fator);
        }
      }
    }

    const total = diasBase * valorDia;

    await resRepo.save(resRepo.create({
      competencia,
      matricula: p.matricula,
      sindicato,
      dias_comprar: diasBase,
      valor_diario: fix2(valorDia),
      valor_total: fix2(total),
      custeio_empresa: fix2(total * 0.8),
      desconto_colaborador: fix2(total * 0.2),
      justificativas: {
        origem: p.tipo,
        fonte_dias: 'sindicato',
        ferias_subtraidas: ferias,
        desligamento_regra: desligRegra,
        exclusoes_aplicadas: []
      },
      fonte_dias: 'sindicato'
    }));
    gravados++;
  }

  console.log(`✅ Cálculo VR concluído: ${gravados} registros salvos em resultado_vr.`);
}