// arquivo: src/index.ts
/**
 * Pipeline completo:
 * 1) ETLs (todas as planilhas)
 * 2) Cálculo do VR (resultado_vr)
 * 3) Geração da planilha oficial
 *
 * Execute com: npx ts-node src/index.ts
 */
import 'reflect-metadata';
import { getDataSource } from './db/get-data-source';

async function main() {
  console.log('🚀 Iniciando pipeline VR...');

  // DataSource único para toda a execução
  const ds = await getDataSource();

  // Import dinâmico das etapas (não auto-executam)
  const { runAtivos }            = await import('./etl/ativos.etl');
  const { runFerias }            = await import('./etl/ferias.etl');
  const { runAfastamentos }      = await import('./etl/afastamentos.etl');
  const { runDesligados }        = await import('./etl/desligados.etl');
  const { runExterior }          = await import('./etl/exterior.etl');
  // ⚠️ Estagiário agora é tabela própria:
  const { runEstagiarioTabela }  = await import('./etl/estagiario.etl');
  const { runAprendiz }          = await import('./etl/aprendiz.etl');
  const { runSincronizarColaboradores } = await import('./etl/sincronizar-colaboradores.etl');
  const { runDiasUteis }         = await import('./etl/diasuteis.etl');
  const { runValores }           = await import('./etl/valores.etl');
  const { runCalculoVR }         = await import('./calc/calculo-vr');
  const { runExcelOficial }      = await import('./export/excel-oficial');

  // ETLs em ordem (ativos primeiro; depois filtros/eventos; bases auxiliares; por fim cálculo/export)
     
  await runAtivos();
  await runSincronizarColaboradores();
  await runFerias();
  await runAfastamentos();

  await runDesligados();
  await runExterior();
  await runEstagiarioTabela(); // <- substitui o antigo runEstagio()
  await runAprendiz();
  //await runDiasUteis();
  // await runValores();

  // Cálculo
  await runCalculoVR();

  // Excel oficial
  await runExcelOficial();

  console.log('✅ Pipeline completo finalizado.');

  // Encerra o pool aqui (apenas no final)
  await ds.destroy();
}

main().catch(async (err) => {
  console.error('❌ Falha no pipeline:', err);
  try {
    // tentativa de fechar conexão se algo deu errado no meio
    const ds = await getDataSource();
    if (ds.isInitialized) await ds.destroy();
  } catch {}
  process.exit(1);
});