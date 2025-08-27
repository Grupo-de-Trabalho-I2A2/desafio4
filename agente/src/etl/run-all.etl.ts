// arquivo: src/etl/run-all.etl.ts
/**
 * Orquestrador de ETL:
 * - Executa todos os ETLs na ordem correta
 * - Útil para rodar tudo de uma vez
 */

async function main() {
  console.log('🚀 Iniciando ETL completo...');

  await import('./ativos.etl');
  await import('./ferias.etl');
  await import('./afastamentos.etl');
  await import('./desligados.etl');
  await import('./exterior.etl');
  await import('./estagio.etl');
  await import('./aprendiz.etl');
  await import('./diasuteis.etl');
  await import('./valores.etl');

  console.log('✅ ETL completo finalizado.');
}

main().catch(err => {
  console.error('❌ Erro no ETL geral:', err);
  process.exit(1);
});