// src/send-to-api.ts
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { getDataSource } from './db/get-data-source';
import { ResultadoVR } from './db/entities/resultado-vr';
import fetch from 'node-fetch';

dotenv.config();

const API_URL = process.env.API_PYTHON_URL || 'http://localhost:8000/validar';

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
    return arr.reduce((acc, item) => {
        const k = key(item);
        acc[k] = acc[k] || [];
        acc[k].push(item);
        return acc;
    }, {} as Record<string, T[]>);
}

function toObject(item: ResultadoVR) {
    return {
        matricula: item.matricula,
        sindicato: item.sindicato,
        dias_comprar: item.dias_comprar,
        valor_diario: item.valor_diario,
        valor_total: item.valor_total,
        custeio_empresa: item.custeio_empresa,
        desconto_colaborador: item.desconto_colaborador,
        fonte_dias: item.fonte_dias,
        justificativas: item.justificativas || null,
    };
}

export async function runSendToApi() {
    const ds = await getDataSource();
    const repo = ds.getRepository(ResultadoVR);

    const resultados = await repo.find();

    const sindicatosSet = new Set<string>();
    resultados.forEach(r => {
        if (typeof r.sindicato === 'string') {
            sindicatosSet.add(r.sindicato.trim());
        }
    });

    const sindicatos = Array.from(sindicatosSet).filter(s => typeof s === 'string');

    const grupos = groupBy(resultados, r => {
        if (r.matricula.startsWith('APR')) return 'aprendiz';
        if (r.matricula.startsWith('EST')) return 'estagiario';
        if (r.matricula.startsWith('EXT')) return 'exterior';
        return 'empregados';
    });

    const empregadosLimitado = (grupos['empregados'] || []).slice(0, 10);

    const payload = {
        competencia: resultados[0]?.competencia ?? 'N/A',
        sindicatos, // agora garantido como array de strings
        aprendiz: (grupos['aprendiz'] || []),
        estagiario: (grupos['estagiario'] || []),
        exterior: (grupos['exterior'] || []),
        empregados: (grupos['empregados'] || [])
    };

    console.log('📤 Enviando dados para API Python...');

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Erro da API Python: ${response.status} - ${text}`);
    }

    const data = await response.json() as { resposta: any };
    console.log('✅ Resposta da API:');
    console.log(data.resposta);
}

if (require.main === module) {
    runSendToApi().catch((err) => {
        console.error('❌ Erro ao enviar para a API:', err);
        process.exit(1);
    });
}