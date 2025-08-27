// arquivo: src/db/get-data-source.ts
import { AppDataSource } from './data-source';

/**
 * Retorna um DataSource inicializado. Se já estiver aberto, só reutiliza.
 * Evita múltiplos initialize()/destroy() pelos ETLs.
 */
export async function getDataSource() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}