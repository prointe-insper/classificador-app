# Classificador no navegador (versão experimental)

Versão do classificador que roda **inteira no navegador**, sem backend, sem
Docker e sem upload. O modelo é baixado uma vez (1,2 MB) e a inferência acontece
na máquina de quem abre a página.

Publicada em: <https://prointe-insper.github.io/classificador-app/>

> Branch experimental. A entrega oficial para a PGE-SP continua sendo o app
> local com Docker Compose, na `main`.

## Por que existe

O app principal exige Docker e uma máquina com permissão para rodá-lo, o que é
justamente o gargalo levantado na reunião de 02/09: os computadores padrão da
PGE-SP provavelmente não têm capacidade nem permissão para isso. Uma página
estática contorna o problema, e o argumento de LGPD fica ainda mais forte:
nenhum documento sai do computador, porque não há servidor para onde enviar.

## Sobre WebAssembly e WebGPU

A pergunta original era se dava para rodar com WASM/WebGPU. Medindo o modelo, a
resposta é que **não é preciso**: a floresta tem 200 árvores e 14.036 nós ao
todo, cerca de 0,5 MB de parâmetros. A classificação leva poucos milissegundos
em JavaScript puro. Carregar um runtime de inferência (ONNX Runtime Web,
TensorFlow.js) só somaria megabytes de download e uma dependência a mais para
acelerar algo que já é instantâneo. WebGPU seria ainda menos útil: floresta de
decisão é percurso de ponteiros, não multiplicação de matrizes.

WebAssembly entra onde ele de fato paga: o `pdf.js`, que faz a extração de texto
dos PDFs. Se um dia for preciso OCR de digitalização, o `tesseract.js` (também
WASM) é o caminho natural.

## O que roda aqui

O pipeline é o mesmo do backend, reimplementado em TypeScript:

1. `utils/pdf.ts` extrai a camada de texto do PDF (pdf.js) ou lê o `.txt`.
2. `model/tfidf.ts` quebra o texto em chunks de 100 palavras com sobreposição
   de 50, vetoriza cada chunk em TF-IDF e tira a média dos vetores.
3. `model/forest.ts` percorre as 200 árvores e faz a média das distribuições.
4. `model/predict.ts` monta a explicação (peso TF-IDF × importância global).

O modelo vem de `backend/model/export_web.py`, que traduz o bundle do
scikit-learn em arrays tipados dentro de um JSON.

### O detalhe que mais dá errado

O `token_pattern` do scikit-learn é `(?u)\b\w\w+\b`, e o `\w` do Python com
`re.UNICODE` cobre letras acentuadas. O `\w` do JavaScript é ASCII mesmo com a
flag `u`: usá-lo quebraria "execução" em "execu" e "o", e o vetor não bateria
com o do treino. Por isso o tokenizador usa `[\p{L}\p{N}_]{2,}`.

## Paridade com o backend

`src/model/predict.test.ts` compara a saída do TypeScript com a do backend em
casos gravados (`src/model/__fixtures__/backend-outputs.json`, textos sintéticos,
sem dado de processo real). Classe, as 16 probabilidades e os 12 termos
destacados batem até a 12ª casa decimal.

A mesma comparação foi rodada localmente contra 100 petições reais: classe
idêntica em 100/100, termos idênticos em 100/100 e diferença máxima de
probabilidade abaixo de 1e-12. Esses arquivos não entram no repositório.

```bash
npm install
npm test
```

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173/classificador-app/
npm run build
npm run preview
```

Para regenerar o modelo depois de trocar o artefato do backend:

```bash
cd ../backend
uv run python -m model.export_web --out ../webapp/public/model-web.json
```

## Limitações

- **Sem OCR.** PDF que é só imagem digitalizada não é lido; a interface avisa.
- **Sem Excel.** A exportação é CSV (separador `;`, com BOM, abre no Excel).
- **Sem revisão manual na tabela.** As colunas de correto/incorreto existem só
  no app principal.
- **Lote grande cansa a aba.** A classificação é rápida, mas a extração de texto
  de centenas de PDFs no navegador é sequencial e mantém tudo em memória.
