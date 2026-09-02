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

WebAssembly entra onde ele de fato paga, e aí paga muito: o `pdf.js` extrai o
texto dos PDFs e o `tesseract.js` faz o **OCR** das digitalizações. Esse é o
trabalho pesado de verdade nesta aplicação, e ele é WASM de ponta a ponta.

## O que roda aqui

O pipeline é o mesmo do backend, reimplementado em TypeScript:

1. `utils/pdf.ts` extrai a camada de texto do PDF (pdf.js); quando ela não
   existe ou é curta demais (< 200 caracteres, ou seja, carimbo em vez de
   petição), renderiza cada página num canvas e passa o `tesseract.js`. Imagens
   soltas vão direto para o OCR.
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

Comparada ao app principal (Docker), esta versão **não tem**:

- **Seletor de modelo.** Serve um modelo só, o da v0.3.0. Não é uma perda em
  relação ao app principal: lá o seletor existe na tela mas também tem uma
  opção só, e fica desabilitado. Servir dois modelos aqui seria até mais fácil
  (é outro JSON), mas o modelo antigo é XGBoost, cuja árvore tem estrutura e
  agregação diferentes das do Random Forest; `forest.ts` teria que ganhar um
  segundo interpretador.
- **Marcação de correto/incorreto na tabela.** As colunas de revisão e o campo
  de rótulo correto existem só no app principal. Sem elas, esta versão não
  serve para coletar o gabarito humano do experimento.
- **Exportação em Excel.** A saída é CSV (separador `;`, com BOM, abre no Excel
  sem passo intermediário), não `.xlsx`.

E tem estas restrições próprias:

- **OCR é lento.** Alguns segundos por página, contra milissegundos de um PDF
  com camada de texto. A interface mostra o andamento página a página.
- **O runtime do OCR vem da rede.** O `tesseract.js` baixa o runtime e o modelo
  de português na primeira digitalização (alguns MB, de CDN). O documento
  continua sem sair da máquina, mas essa parte específica não funciona offline
  no primeiro uso. O resto (modelo do classificador, pdf.js e seus WASM) é
  servido pelo próprio site e fica em cache.
- **Lote grande cansa a aba.** A classificação em si é instantânea, mas a
  extração de texto é sequencial e os arquivos ficam em memória. Dezenas a
  poucas centenas de peças, sim; milhares, não.
- **Sem persistência.** Fechou a aba, perdeu os resultados. Baixe o CSV antes.
- **Depende de navegador atual.** Usa WebAssembly e `File.stream()`; Chrome,
  Edge ou Firefox recentes. Não foi testada em navegador antigo de rede
  corporativa, que é justamente o cenário da PGE-SP.

## Aviso

Branch experimental, publicada para avaliação. A entrega oficial para a PGE-SP
é o app local com Docker Compose, na `main`, que é o que está descrito nas
releases e no e-mail à Procuradoria.
