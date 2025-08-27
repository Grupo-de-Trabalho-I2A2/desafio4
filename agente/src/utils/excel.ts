// arquivo: src/utils/excel.ts
import XLSX from 'xlsx';

export function listSheets(filePath: string): string[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  return wb.SheetNames;
}

/**
 * Lê uma aba e retorna um array de objetos, com cabeçalhos inferidos da primeira linha.
 * defval:'' evita undefined; raw:false força normalização de datas para strings legíveis.
 */
export function readSheet(filePath: string, sheetName?: string): Record<string, any>[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, {
    defval: '',
    raw: false,
    dateNF: 'dd/mm/yyyy'
  });
  return rows as Record<string, any>[];
}
