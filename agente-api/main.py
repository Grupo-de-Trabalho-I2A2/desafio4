from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class ResultadoVRItem(BaseModel):
    matricula: str
    sindicato: str
    dias_comprar: int
    valor_diario: str
    valor_total: str
    custeio_empresa: str
    desconto_colaborador: str
    fonte_dias: Literal["sindicato", "folha_ponto"]
    justificativas: Optional[dict] = None


class ValidarRequest(BaseModel):
    competencia: str
    sindicatos: List[str]
    aprendiz: List[ResultadoVRItem]
    estagiario: List[ResultadoVRItem]
    exterior: List[ResultadoVRItem]
    empregados: List[ResultadoVRItem]


def gerar_prompt(payload: ValidarRequest) -> str:
    def format_lista(nome: str, lista: List[ResultadoVRItem]) -> str:
        if not lista:
            return f"- {nome}: (vazio)\n"
        return f"- {nome}:\n" + "\n".join([
            f"  • Matrícula: {item.matricula}, Sindicato: {item.sindicato}, Dias: {item.dias_comprar}, "
            f"Valor Total: {item.valor_total}, Fonte: {item.fonte_dias}"
            for item in lista
        ]) + "\n"

    prompt = f"""Estamos analisando os dados da folha de pagamento da competência {payload.competencia}.
Aqui estão os dados extraídos:

- Sindicatos únicos: {", ".join(payload.sindicatos)}

{format_lista("Aprendizes", payload.aprendiz)}
{format_lista("Estagiários", payload.estagiario)}
{format_lista("Trabalhadores no Exterior", payload.exterior)}
{format_lista("Empregados", payload.empregados)}

Analise os dados acima e responda:
1. Há alguma inconsistência nos dados (valores fora do esperado, categorias sem dias úteis, etc.)?
2. Existe algum sindicato com valores estranhos ou zerados?
3. Há diferenças gritantes entre aprendizes, estagiários e empregados?
4. Há dados em branco ou incompletos que podem afetar o cálculo do VR?

Responda como se estivesse escrevendo um parecer técnico para um time de analistas de folha de pagamento.
"""
    return prompt


@app.post("/validar")
async def validar_dados(payload: ValidarRequest):
    try:
        prompt = gerar_prompt(payload)

        response = client.chat.completions.create(
            model="gpt-4.1-mini",  # ou "gpt-4.1-mini" se quiser
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Você é um assistente que valida dados de folha de pagamento. "
                        "Receberá dados agrupados por categoria (aprendizes, estagiários, empregados, etc.) "
                        "e deve apontar possíveis erros ou inconsistências nos valores fornecidos."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.2,
            max_tokens=1500
        )

        return {"resposta": response.choices[0].message.content}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))