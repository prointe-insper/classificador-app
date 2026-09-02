# Classificador no navegador (versão experimental)

Versão do classificador que roda **inteira no navegador**, sem backend, sem
Docker e sem upload. O modelo escolhido é baixado uma vez (1,2 MB o v2, 2,2 MB o
v1) e a inferência acontece na máquina de quem abre a página.

Serve os **dois modelos** do catálogo, com os mesmos ids do app principal: o v2
(16 assuntos da cauda, chunks + TF-IDF + Random Forest) e o v1 (dez assuntos de
massa mais `Outros`, TF-IDF 1-2 gramas + XGBoost). Cada um é baixado sob demanda
e fica em memória.

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
3. `model/forest.ts` percorre as árvores do Random Forest e faz a média das
   distribuições; `model/xgboost.ts` percorre o booster do XGBoost, soma as
   margens por classe e aplica softmax.
4. `model/predict.ts` monta a explicação (peso TF-IDF × importância global).

O modelo vem de `backend/model/export_web.py`, que traduz o bundle do
scikit-learn em arrays tipados dentro de um JSON.

### Os detalhes que mais dão errado

**Tokenização.** O `token_pattern` do scikit-learn usa o `\w` do Python com
`re.UNICODE`, que cobre letras acentuadas. O `\w` do JavaScript é ASCII mesmo
com a flag `u`: usá-lo quebraria "execução" em "execu" e "o", e o vetor não
bateria com o do treino. Por isso o tokenizador usa classes unicode explícitas
(ver `model/tfidf.ts`).

**Ausente não é zero no XGBoost.** O backend prediz sobre a matriz esparsa do
TF-IDF, e o XGBoost trata entrada ausente como valor faltante, seguindo o ramo
`missing` do nó. Por isso o documento trafega como mapa esparso, e não como
vetor denso: um vetor de zeros desceria pelo ramo errado na maioria dos nós e
daria outra classe. O Random Forest, ao contrário, lê ausente como zero.

## Paridade com o backend

`src/model/predict.test.ts` compara a saída do TypeScript com a do backend nos
dois modelos, em casos gravados (`src/model/__fixtures__/backend-outputs.json`,
textos sintéticos, sem dado de processo real): classe prevista, todas as
probabilidades e os 12 termos destacados.

A mesma comparação foi rodada localmente contra 80 petições reais, nos dois
modelos: classe idêntica em 80/80 para ambos, com diferença máxima de
probabilidade de 0 no v2 e 2,1e-7 no v1. Esses arquivos não entram no
repositório.

A diferença do v1 é esperada e não some: o XGBoost calcula em float32 do começo
ao fim (folhas, soma das margens e o softmax) e o JavaScript não tem aritmética
de 32 bits. 1e-7 é o épsilon do float32.

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
- **Em PDF, o resultado pode diferir do app principal.** A inferência é
  equivalente, mas o texto vem de extratores diferentes: `pdf.js` aqui,
  `pdfplumber` lá. Medido sobre 60 PDFs reais com camada de texto (o `pdf.js`
  extrai 5,7% mais caracteres):

  | | mesma classe | mesma decisão (limiar 50%) | maior diferença de confiança |
  | --- | --- | --- | --- |
  | v2 | 58/60 (96,7%) | **60/60** | 0,020 |
  | v1 | 60/60 (100%) | **60/60** | 0,049 |

  Os dois casos em que a classe divergiu no v2 tinham confiança de 0,155 e 0,30,
  ou seja, empate técnico entre classes que os dois lados mandam para revisão
  manual de qualquer forma. Alimentados com o **mesmo texto**, os dois chegam à
  mesma classe em 80/80, com diferença de probabilidade de 0 no v2 e 2,1e-7 no
  v1: a divergência acima é do extrator, não do classificador.

  Um PDF que aqui cai no OCR pode ter camada de texto aproveitável lá, e
  vice-versa.

## Aviso

Branch experimental, publicada para avaliação. A entrega oficial para a PGE-SP
é o app local com Docker Compose, na `main`, que é o que está descrito nas
releases e no e-mail à Procuradoria.
