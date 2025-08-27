// arquivo: src/integrations/payload-agente.ts
/**
 * Monta o payload JSON para o agente Python (QA):
 * - Coleta amostra de linhas do resultado_vr
 * - Agregados por sindicato e geral
 * - Bases auxiliares (dias_uteis, valores, férias, afastamentos, desligamentos)
 */


import { ResultadoVR } from '../db/entities/resultado-vr';
import { SindicatoDiasUteis } from '../db/entities/sindicato-dias-uteis';
import { SindicatoValor } from '../db/entities/sindicato-valor';
import { EventoFerias } from '../db/entities/evento-ferias';
import { EventoAfastamento } from '../db/entities/evento-afastamento';
import { EventoDesligamento } from '../db/entities/evento-desligamento';
import { getDataSource } from '../db/get-data-source';

export async function montarPayloadAgente(execId: string, competencia: string) {
  const ds = await getDataSource();
  const resRepo = ds.getRepository(ResultadoVR);
  
  const diasRepo = ds.getRepository(SindicatoDiasUteis);
  const valRepo = ds.getRepository(SindicatoValor);
  const ferRepo = ds.getRepository(EventoFerias);
  const afaRepo = ds.getRepository(EventoAfastamento);
  const desRepo = ds.getRepository(EventoDesligamento);

  const [linhasAll, dias, valores, ferias, afast, deslig] = await Promise.all([
    resRepo.find({ where: { competencia } }),
    diasRepo.find({ where: { competencia } }),
    valRepo.find({ where: { competencia } }),
    ferRepo.find({ where: { competencia } }),
    afaRepo.find({ where: { competencia } }),
    desRepo.find()
  ]);

  // Amostra (até 200 linhas)
  const linhas = linhasAll.slice(0, 200).map(l => ({
    matricula: l.matricula,
    sindicato: l.sindicato,
    competencia: l.competencia,
    dias_comprar: l.dias_comprar,
    valor_diario: Number(l.valor_diario),
    valor_total: Number(l.valor_total),
    custeio_empresa: Number(l.custeio_empresa),
    desconto_colaborador: Number(l.desconto_colaborador),
    justificativas: l.justificativas ?? {}
  }));

  // Agregados por sindicato
  const aggMap = new Map<string, { qtd: number; dias: number; total: number }>();
  for (const l of linhasAll) {
    const a = aggMap.get(l.sindicato) ?? { qtd: 0, dias: 0, total: 0 };
    a.qtd += 1;
    a.dias += l.dias_comprar;
    a.total += Number(l.valor_total);
    aggMap.set(l.sindicato, a);
  }
  const por_sindicato = [...aggMap.entries()].map(([sindicato, a]) => ({
    sindicato, qtd_colaboradores: a.qtd, dias_total: a.dias, valor_total: Number(a.total.toFixed(2))
  }));
  const geral = por_sindicato.reduce((acc, x) => {
    acc.qtd_colaboradores += x.qtd_colaboradores;
    acc.dias_total += x.dias_total;
    acc.valor_total += x.valor_total;
    return acc;
  }, { qtd_colaboradores: 0, dias_total: 0, valor_total: 0 });

  return {
    exec_id: execId,
    competencia,
    politica_rateio: { empresa: 0.8, colaborador: 0.2 },
    regras: {
      desligamento: { dia_corte: 15, comunicado_ok_nao_paga: true, apos_corte_proporcional: true },
      exclusoes: ['Diretor', 'Estagiario', 'Aprendiz', 'Afastado', 'Exterior'],
      fonte_dias: 'sindicato'
    },
    bases: {
      sindicatos_dias_uteis: dias.map(d => ({ sindicato: d.sindicato, dias_uteis: d.dias_uteis })),
      sindicatos_valores: valores.map(v => ({ sindicato: v.sindicato, valor_diario: Number(v.valor_diario) })),
      ferias: ferias.map(f => ({ matricula: f.matricula, dias_ferias_mes: f.dias_ferias_mes })),
      afastamentos: afast.map(a => ({ matricula: a.matricula, tipo: a.tipo_afastamento })),
      desligamentos: deslig.map(d => ({
        matricula: d.matricula, data_desligamento: d.data_desligamento, data_comunicado: d.data_comunicado, comunicado_ok: !!d.comunicado_ok
      })),
      exterior: [], estagio: [], aprendiz: [] // se você quiser, pode popular a partir do campo motivo_inelegibilidade dos colaboradores
    },
    resultado: {
      linhas,
      agregados: { por_sindicato, geral }
    }
  };
}