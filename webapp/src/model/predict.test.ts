import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseModel } from './loader';
import { predict } from './predict';
import { cleanForModel, normalizeText } from './preprocess';
import { chunkText, ngrams, tokenize } from './tfidf';

interface Caso {
  nome: string;
  texto: string;
  label: string;
  confidence: number;
  probabilities: { label: string; probability: number }[];
  explanation: { token: string; weight: number }[];
}

function carregar(arquivo: string) {
  const caminho = fileURLToPath(new URL(`../../public/${arquivo}`, import.meta.url));
  return parseModel(JSON.parse(readFileSync(caminho, 'utf-8')));
}

const modelos = {
  v2: carregar('model-web.json'),
  v1: carregar('model-web-v1.json'),
};

const fixtures: Record<string, Caso[]> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./__fixtures__/backend-outputs.json', import.meta.url)),
    'utf-8',
  ),
);

describe('tokenize', () => {
  it('preserva palavras acentuadas inteiras', () => {
    // O \w do JavaScript é ASCII: sem \p{L} isto viraria ["execu", "o"].
    expect(tokenize('Execução da dívida')).toEqual(['execução', 'da', 'dívida']);
  });

  it('descarta tokens de um caractere só, como o \\b\\w\\w+\\b do sklearn', () => {
    expect(tokenize('a ab abc 1 12')).toEqual(['ab', 'abc', '12']);
  });

  it('separa por pontuação e coloca em caixa baixa', () => {
    expect(tokenize('IPTU, imposto-predial.')).toEqual(['iptu', 'imposto', 'predial']);
  });
});

describe('ngrams', () => {
  it('devolve só os unigramas quando ngramMax é 1', () => {
    expect(ngrams(['a', 'b', 'c'], 1)).toEqual(['a', 'b', 'c']);
  });

  it('acrescenta os bigramas adjacentes quando ngramMax é 2', () => {
    expect(ngrams(['icms', 'declarado', 'nao'], 2)).toEqual([
      'icms',
      'declarado',
      'nao',
      'icms declarado',
      'declarado nao',
    ]);
  });
});

describe('preprocess', () => {
  it('remove o marcador de página do OCR', () => {
    // Sem isso, "PAGINA" e os números entrariam no vetor TF-IDF.
    expect(normalizeText('antes # PAGINA 001 de 003 --- depois')).toBe('antes depois');
  });

  it('colapsa régua de underscores', () => {
    expect(normalizeText('a ________ b')).toBe('a b');
  });

  it('cleanForModel também minúscula', () => {
    expect(cleanForModel('ICMS Declarado')).toBe('icms declarado');
  });
});

describe('chunkText', () => {
  it('devolve um chunk vazio para texto vazio', () => {
    expect(chunkText('', 100, 50)).toEqual(['']);
  });

  it('mantém a janela deslizante do juriclass', () => {
    const palavras = Array.from({ length: 250 }, (_, i) => String(i));
    const chunks = chunkText(palavras.join(' '), 100, 50);
    expect(chunks).toHaveLength(4);
    expect(chunks[0].split(' ')).toEqual(palavras.slice(0, 100));
    expect(chunks[1].split(' ')).toEqual(palavras.slice(50, 150));
    expect(chunks[3].split(' ')).toEqual(palavras.slice(150, 250));
  });
});

describe('modelos carregados', () => {
  it('v2 é a floresta do sklearn, com chunks e texto cru', () => {
    expect(modelos.v2.forest.kind).toBe('sklearn_forest');
    expect(modelos.v2.labels).toHaveLength(16);
    expect(modelos.v2.chunking).toEqual({ chunkWords: 100, overlap: 50 });
    expect(modelos.v2.preprocess).toBe('raw');
    expect(modelos.v2.ngramMax).toBe(1);
  });

  it('v1 é o XGBoost, documento inteiro, texto limpo e bigramas', () => {
    expect(modelos.v1.forest.kind).toBe('xgboost');
    expect(modelos.v1.labels).toHaveLength(12);
    expect(modelos.v1.chunking).toBeNull();
    expect(modelos.v1.preprocess).toBe('clean');
    expect(modelos.v1.ngramMax).toBe(2);
  });

  it('as taxonomias não têm interseção', () => {
    const v2 = new Set(modelos.v2.labels);
    expect(modelos.v1.labels.some((l) => v2.has(l))).toBe(false);
  });
});

/**
 * Casas decimais exigidas na comparação de probabilidades.
 *
 * O Random Forest do sklearn calcula em float64, igual ao JavaScript, e bate na
 * 10ª casa. O XGBoost calcula em float32 do começo ao fim (valores de folha,
 * soma das margens e o próprio softmax), e o JavaScript não tem aritmética de
 * 32 bits: a diferença fica na casa de 1e-7, que é o épsilon do float32. Emular
 * float32 com Math.fround não resolveria, porque Math.exp continuaria em 64
 * bits. A classe prevista, a ordem das classes e os termos destacados são
 * idênticos nos dois casos, que é o que muda alguma decisão.
 */
const CASAS = { v2: 10, v1: 6 } as const;

describe.each(['v2', 'v1'] as const)('paridade com o backend (%s)', (chave) => {
  const model = modelos[chave];
  const casas = CASAS[chave];
  for (const caso of fixtures[chave]) {
    it(`reproduz a saída do backend: ${caso.nome}`, () => {
      const resultado = predict(caso.texto, model, 12);

      expect(resultado.label).toBe(caso.label);
      expect(resultado.confidence).toBeCloseTo(caso.confidence, casas);

      expect(resultado.probabilities.map((p) => p.label)).toEqual(
        caso.probabilities.map((p) => p.label),
      );
      resultado.probabilities.forEach((p, i) => {
        expect(p.probability).toBeCloseTo(caso.probabilities[i].probability, casas);
      });

      expect(resultado.explanation.map((e) => e.token)).toEqual(
        caso.explanation.map((e) => e.token),
      );
      resultado.explanation.forEach((e, i) => {
        expect(e.weight).toBeCloseTo(caso.explanation[i].weight, 10);
      });
    });
  }
});
