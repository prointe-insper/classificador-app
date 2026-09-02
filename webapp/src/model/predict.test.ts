import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseModel } from './loader';
import { predict } from './predict';
import { chunkText, tokenize } from './tfidf';

const modelPath = fileURLToPath(new URL('../../public/model-web.json', import.meta.url));
const model = parseModel(JSON.parse(readFileSync(modelPath, 'utf-8')));

const fixturePath = fileURLToPath(new URL('./__fixtures__/backend-outputs.json', import.meta.url));
const casos: {
  nome: string;
  texto: string;
  label: string;
  confidence: number;
  probabilities: { label: string; probability: number }[];
  explanation: { token: string; weight: number }[];
}[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('tokenize', () => {
  it('preserva palavras acentuadas inteiras', () => {
    // O \w do JavaScript é ASCII: sem \p{L} isto viraria ["execu", "o"].
    expect(tokenize('Execução da dívida')).toEqual(['execução', 'da', 'dívida']);
  });

  it('descarta tokens de um caractere só, como o \b\w\w+\b do sklearn', () => {
    expect(tokenize('a ab abc 1 12')).toEqual(['ab', 'abc', '12']);
  });

  it('separa por pontuação e coloca em caixa baixa', () => {
    expect(tokenize('IPTU, imposto-predial.')).toEqual(['iptu', 'imposto', 'predial']);
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

describe('paridade com o backend', () => {
  it('carrega o modelo exportado', () => {
    expect(model.labels).toHaveLength(16);
    expect(model.terms).toHaveLength(5000);
    expect(model.forest.nTrees).toBe(200);
  });

  for (const caso of casos) {
    it(`reproduz a saída do backend: ${caso.nome}`, () => {
      const resultado = predict(caso.texto, model, 12);

      expect(resultado.label).toBe(caso.label);
      expect(resultado.confidence).toBeCloseTo(caso.confidence, 12);

      expect(resultado.probabilities.map((p) => p.label)).toEqual(
        caso.probabilities.map((p) => p.label),
      );
      resultado.probabilities.forEach((p, i) => {
        expect(p.probability).toBeCloseTo(caso.probabilities[i].probability, 12);
      });

      expect(resultado.explanation.map((e) => e.token)).toEqual(
        caso.explanation.map((e) => e.token),
      );
      resultado.explanation.forEach((e, i) => {
        expect(e.weight).toBeCloseTo(caso.explanation[i].weight, 12);
      });
    });
  }
});
