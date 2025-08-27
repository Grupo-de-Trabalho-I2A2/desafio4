// arquivo: src/integrations/enviar-agente.ts
/**
 * Envia o payload para sua API Python (agente).
 * Config: definir FLASH_URL no .env (ex.: http://localhost:8000/qa/vr)
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { AppDataSource } from '../db/data-source';
import { montarPayloadAgente } from './payload-agente';

dotenv.config();

function ensureCompetencia(): string {
  const c = process.env.COMPETENCIA?.trim();
  if (!c || !/^\\d{4}-\\d{2}$/.test(c)) throw new Error('COMPETENCIA inválida (AAAA-MM)');
  return c;
}

async function main() {
  const competencia = ensureCompetencia();
  const execId = `run-${competencia}-${Date.now()}`;
  const url = process.env.FLASH_URL;
  if (!url) throw new Error('Defina FLASH_URL no .env');

  await AppDataSource.initialize();
  const payload = await montarPayloadAgente(execId, competencia);
  await AppDataSource.destroy();

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Agente retornou ${resp.status}: ${txt}`);
  }

  const data = await resp.json().catch(() => ({}));
  console.log('✅ Enviado ao agente com sucesso.', data);
}

main().catch(err => {
  console.error('❌ Erro ao enviar para o agente:', err);
  process.exit(1);
});