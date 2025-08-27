// arquivo: src/utils/normalize.ts

/**
 * Remove espaços e garante que a matrícula seja sempre string.
 */
export function trimMatricula(v: any): string {
  return String(v ?? '').trim();
}

/**
 * Normaliza textos gerais:
 * - trim()
 * - colapsa espaços múltiplos em um só
 * - retorna null se vazio
 */
export function normalizeText(v: any): string | null {
  const s = String(v ?? '').trim();
  return s.length ? s.replace(/\s+/g, ' ') : null;
}

/**
 * Converte valores vindos do Excel em booleano:
 * - aceita "OK", "Sim", "True", "1", "Yes"
 * - tudo em lower case
 */
export function parseBoolOK(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').toLowerCase();
  return ['ok', 'sim', 'true', '1', 'y', 'yes'].includes(s);
}

/**
 * Tenta converter em inteiro. 
 * Remove caracteres não numéricos antes do parse.
 * Retorna fallback (0 por padrão) se não for válido.
 */
export function parseIntSafe(v: any, fallback = 0): number {
  const n = Number.parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Converte data em formato brasileiro (dd/mm/aaaa) ou ISO (aaaa-mm-dd) 
 * para string ISO (aaaa-mm-dd).
 */
/*
export function parseDateBR(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  // já está em ISO (aaaa-mm-dd)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/aaaa  ← ATENÇÃO: apenas uma barra invertida no TS
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm);
  return `${yyyy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}*/

export function parseDateBR(s: string): string | null {
  if (!s) return null;

  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return null;

  let [_, dd, mm, yyyy] = match;

  // Corrige ano com 2 dígitos
  if (yyyy.length === 2) {
    yyyy = Number(yyyy) < 50 ? '20' + yyyy : '19' + yyyy;
  }

  // ⚠️ Garanta que 'mm' seja MÊS e 'dd' seja DIA
  dd = dd.padStart(2, '0');
  mm = mm.padStart(2, '0');

  if (Number(mm) > 12 || Number(dd) > 31) return null;

  return `${yyyy}-${mm}-${dd}`;
}


/**
 * Recupera a competência configurada no .env (AAAA-MM).
 * Valida o formato.
 */
export function ensureCompetencia(): string {
  const c = process.env.COMPETENCIA?.trim();
  if (!c || !/^\d{4}-\d{2}$/.test(c)) {
    throw new Error('COMPETENCIA inválida. Use AAAA-MM no .env');
  }
  return c;
}

/**
 * Normaliza sindicato usando alias map:
 * - Recebe o nome vindo da planilha
 * - Procura no dicionário (aliasMap)
 * - Se encontrar, retorna a chave canônica
 * - Se não, retorna o valor original
 */
export function normalizeSindicato(raw: string | null, aliasMap: Record<string, string[]>): string | null {
  if (!raw) return null;
  const val = raw.trim();

  for (const [canon, variants] of Object.entries(aliasMap)) {
    if (canon === val) return canon;
    for (const vv of variants) {
      if (vv.trim() === val) return canon;
    }
  }
  return val; // mantém como veio, se não achar no mapa
}