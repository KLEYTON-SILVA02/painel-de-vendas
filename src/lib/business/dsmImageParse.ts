// DSM ("Desconto Só Meu") — Fase 3: extrai linhas de colaborador a partir
// de texto solto (o resultado do OCR sobre um print do relatório, ou texto
// colado manualmente pelo ADM quando o OCR falha — mesmo caminho "colar
// texto" já usado pelo Super Troco do sistema antigo). Diferente da
// planilha (dsmImport.ts), aqui não há colunas reais — só linhas de texto,
// então a extração é por padrão de linha, não por índice de coluna.
//
// Formato de cada linha esperado (mesmo do relatório usado na Fase 2):
// "<matrícula>-<NOME>  <número de vendas>  <valor R$>  <número de clientes>"
// — a quantidade salva é sempre a coluna com o título "Número de Clientes"
// no relatório original, não simplesmente "o último número da linha": o
// mesmo relatório às vezes também mostra "Número de Clientes(%)" logo em
// seguida (mesma ressalva já documentada em dsmImport.ts/QUANTIDADE_TERMS
// pro caminho de planilha), e se a extração pegasse cegamente o último
// número, uma % que aparecesse depois do total de clientes viraria a
// quantidade salva por engano. Como o texto de OCR não tem coluna de
// verdade, splitNameAndTrailingNumber distingue pelo FORMATO: "Número de
// Clientes" é sempre um inteiro simples (sem vírgula decimal, sem "%"),
// enquanto "Valor" e qualquer "Clientes(%)" sempre carregam vírgula
// decimal (e a % pode ou não sobreviver ao OCR) — então pega o último
// token, da direita pra esquerda, com cara de inteiro, pulando qualquer
// vírgula/"%" que venha depois dele.
import type { DsmReviewRow } from './dsmImport';
import { levenshteinDistance } from './levenshtein';
import { normalize } from './normalize';
import { normalizeMatricula } from './parsing';

const FOOTER_LINE_PATTERN = /\b(sub)?tota(l|is)\b/i;
const NAO_IDENTIFICADO_PATTERN = /n[ãa]o\s+identificad/i;
// Exportado — dsmImageColumns.ts (2ª análise, por posição/coluna) reusa
// exatamente o mesmo reconhecimento de "início de linha de colaborador"
// desta 1ª análise (por texto/regex), pra nunca haver duas definições do
// que é uma linha de colaborador divergindo entre si.
//
// Deliberadamente SEM âncora `^` no início (só `$` no fim) — o relatório
// real tem uma coluna "Loja" à esquerda da de Matrícula/Nome, e quando essa
// célula é mesclada verticalmente (um valor só, cobrindo várias linhas da
// tabela), o OCR às vezes gruda o texto dela na primeira linha da tabela
// ("567152 70209751-FULANO..." em vez de só "70209751-FULANO...") — com a
// âncora `^`, essa linha inteira falhava em casar e o colaborador sumia do
// resultado sem nenhum aviso. Sem a âncora, o regex encontra o padrão
// "dígitos-traço-nome" onde quer que ele comece na linha, ignorando
// qualquer prefixo espúrio antes dele (bug visto em produção, 2026-10-24).
export const MATRICULA_NAME_LINE = /(\d{4,10})\s*[-–—]\s*(.+)$/;

export interface DsmImageLineMatch {
  lineRaw: string;
  matriculaRaw: string;
  matricula: string;
  nome: string;
  quantidade: number | null;
  /** 'nome': set by the second-pass name search (parseDsmImageLinesByCollaboratorName)
   * when the registered name matched the OCR text as an exact substring.
   * 'nome-aproximado': same second pass, but the name only matched by edit
   * distance (findBestFuzzyNameMatch) — the OCR swapped/dropped a letter in
   * the registered name (e.g. "CRHYSTINA" instead of "CHRYSTINA") — flagged
   * separately because the review table needs to warn the ADM to double
   * check the PERSON, not just the quantidade. 'coluna': set whenever the
   * column/position-based 2nd/3rd analysis (dsmImageColumns.ts, anchored on
   * the real "Número de Clientes" header's position in the image) found a
   * value for this matrícula that DIFFERS from what the line/text reading
   * got — the column reading always wins in that case (see
   * computeDsmImageMatches below), since it's anchored on the actual header
   * instead of guessing by token shape/order. Absent when the line reading
   * already agreed with the column reading (or the column reading found
   * nothing for this row), so the review table only flags rows that were
   * actually corrected. */
  matchedBy?: 'nome' | 'nome-aproximado' | 'coluna';
}

// Um token de CONTAGEM ("Vendas" ou "Número de Clientes") é sempre um
// inteiro simples — só dígitos e opcionalmente pontos de milhar ("1.540"),
// nunca vírgula decimal. "Valor" (R$) e "Número de Clientes(%)" sempre
// carregam vírgula decimal, com ou sem o símbolo "%" (o OCR às vezes perde
// o "%" mas quase nunca inventa uma vírgula) — então é essa vírgula que
// distingue de forma confiável uma contagem de um valor monetário/percentual.
// Exportado — dsmImageColumns.ts reusa exatamente a mesma definição de "cara
// de contagem inteira" pra escolher candidatos numéricos numa linha.
export const COUNT_TOKEN = /^\d[\d.]*$/;
// Aceita um "%" opcional colado no fim do token só pra não quebrar a
// detecção de onde termina a linha de texto e começa a sequência de números.
const NUMERIC_TOKEN = /^[\d.,]+%?$/;

// Letras que o Tesseract mais confunde com um dígito parecido (bug visto em
// produção, 2026-10-28: "74" lido como "7a" — a colaboradora tinha 74
// clientes, mas o último caractere virou a letra "a" em vez do dígito "4").
// Mapeamento conservador, só dos pares visualmente mais próximos nesse tipo
// de relatório (fonte de planilha/sistema de ponto).
const OCR_DIGIT_CONFUSIONS: Record<string, string> = {
  o: '0',
  O: '0',
  l: '1',
  I: '1',
  i: '1',
  z: '2',
  Z: '2',
  a: '4',
  A: '4',
  s: '5',
  S: '5',
  b: '8',
  B: '8',
  g: '9',
  G: '9',
  q: '9',
};

/** Tenta corrigir, letra a letra, as confusões de OCR acima num token que já
 * tem pelo menos um dígito de verdade — "7a" vira "74", "l.455" vira "1.455"
 * etc. Só mexe em tokens com ALGUM dígito (nunca força uma palavra qualquer
 * a virar número); devolve o token sem alteração quando não há nada pra
 * corrigir, o que faz chamar esta função sempre ser seguro mesmo fora do
 * trecho numérico de uma linha. Exportado — dsmImageColumns.ts (2ª análise,
 * por posição/coluna) reusa a mesma correção ao ler o token mais próximo em
 * X do cabeçalho "Número de Clientes". */
export function correctOcrDigitConfusions(token: string): string {
  if (!/\d/.test(token)) return token;
  return token.replace(/[a-zA-Z]/g, (ch) => OCR_DIGIT_CONFUSIONS[ch] ?? ch);
}

/** Splits the trailing run of whitespace-separated numeric tokens off the
 * end of `text` (a name possibly followed by "vendas  valor  clientes" and
 * sometimes a trailing "clientes(%)" too) — returns the leading non-numeric
 * part (the name) and the quantidade, picked as the rightmost token in that
 * run that looks like "Número de Clientes" specifically (a plain integer),
 * skipping over any decimal/percentage column that comes after it. Returns
 * quantidade: null when no trailing token looks like a plausible count at
 * all (still shown in the review table, just excluded from saving until
 * the ADM fills it in manually — same "don't guess" rule as everywhere else
 * in DSM). */
function splitNameAndTrailingNumber(text: string): { nome: string; quantidade: number | null } {
  const tokens = text.trim().split(/\s+/);
  // Walks backward to find where the trailing run of numeric-looking
  // tokens *starts* (there can be several — vendas, valor, clientes, and
  // sometimes clientes%). Testa a versão corrigida de confusões de OCR
  // (correctOcrDigitConfusions) em vez do token bruto — sem isso, um único
  // caractere mal lido (ex.: "7a" em vez de "74") derrubava a detecção do
  // trecho numérico inteiro, e os números todos (vendas/valor/clientes)
  // acabavam grudados no nome em vez de virarem a quantidade (bug visto em
  // produção, 2026-10-28).
  let numericRunStart = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (NUMERIC_TOKEN.test(correctOcrDigitConfusions(tokens[i]))) numericRunStart = i;
    else break;
  }
  if (numericRunStart === tokens.length) return { nome: text.trim(), quantidade: null };
  const nome = tokens.slice(0, numericRunStart).join(' ').trim();
  const numericTokens = tokens.slice(numericRunStart).map(correctOcrDigitConfusions);
  const countToken = [...numericTokens].reverse().find((t) => COUNT_TOKEN.test(t));
  const quantidade = countToken ? parseInt(countToken.replace(/\D/g, ''), 10) : null;
  return { nome, quantidade };
}

/** Parses every line of OCR (or manually pasted) text into candidate DSM
 * rows — one line at a time, independent of any table structure (there
 * isn't one once it's plain text). Lines that don't look like a
 * colaborador row (headers, "TOTAL...", blank lines, OCR noise) are
 * silently skipped rather than guessed at. */
export function parseDsmImageLines(text: string): DsmImageLineMatch[] {
  const out: DsmImageLineMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || FOOTER_LINE_PATTERN.test(line)) continue;

    const m = line.match(MATRICULA_NAME_LINE);
    if (m) {
      const matriculaRaw = m[1];
      const { nome, quantidade } = splitNameAndTrailingNumber(m[2]);
      if (!nome) continue;
      out.push({ lineRaw: line, matriculaRaw, matricula: normalizeMatricula(matriculaRaw), nome, quantidade });
      continue;
    }

    if (NAO_IDENTIFICADO_PATTERN.test(line)) {
      const { quantidade } = splitNameAndTrailingNumber(line);
      out.push({ lineRaw: line, matriculaRaw: '', matricula: '', nome: 'NÃO IDENTIFICADO', quantidade });
    }
  }
  return out;
}

/** Segunda leitura/verificação do mesmo texto de OCR — em vez de exigir o
 * formato rígido "<matrícula>-<NOME>" da primeira leitura, procura por cada
 * colaborador já cadastrado (pelo nome) em qualquer lugar do texto, e lê a
 * quantidade de clientes atendidos da mesma linha com a mesma regra de
 * splitNameAndTrailingNumber (a coluna "Número de Clientes", nunca "Valor"
 * nem um eventual "Número de Clientes(%)" que apareça depois dela).
 * Existe porque os dígitos da matrícula são a parte que o OCR mais erra
 * (um dígito trocado, o traço sumindo, a linha quebrada em duas) — quando
 * isso acontece, a primeira leitura descarta a linha inteira mesmo com o
 * nome perfeitamente legível, que é exatamente o bug relatado de
 * colaborador "ficando de fora" mesmo estando no texto extraído. Só
 * retorna colaboradores cuja matrícula ainda não está em `alreadyMatched`
 * (a primeira leitura), então nunca duplica uma linha que já deu certo. */
export function parseDsmImageLinesByCollaboratorName(
  text: string,
  colaboradores: { nome: string; matricula: string }[],
  alreadyMatched: Set<string>,
): DsmImageLineMatch[] {
  const out: DsmImageLineMatch[] = [];
  const foundThisPass = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || FOOTER_LINE_PATTERN.test(line)) continue;
    const normalizedLine = normalize(line);

    // 1ª tentativa: substring idêntico (como sempre foi) — zero risco de
    // confundir duas pessoas, sempre prioritário sobre a aproximação abaixo.
    let matchedExact = false;
    for (const colaborador of colaboradores) {
      const nomeTrim = colaborador.nome.trim();
      const matricula = normalizeMatricula(colaborador.matricula);
      if (!nomeTrim || !matricula || alreadyMatched.has(matricula) || foundThisPass.has(matricula)) continue;
      const normalizedNome = normalize(nomeTrim);
      const idx = normalizedLine.indexOf(normalizedNome);
      if (idx === -1) continue;
      const remainder = normalizedLine.slice(idx + normalizedNome.length).replace(/^[\s\-–—]+/, '');
      const { quantidade } = splitNameAndTrailingNumber(remainder);
      out.push({ lineRaw: line, matriculaRaw: colaborador.matricula, matricula, nome: nomeTrim, quantidade, matchedBy: 'nome' });
      foundThisPass.add(matricula);
      matchedExact = true;
      break;
    }
    if (matchedExact) continue;

    // 2ª tentativa (pedido explícito do usuário, 2026-10-28: "o vendedor
    // sendo identificado com o nome completo [na imagem]... não está sendo
    // reconhecido" — matrícula E nome com substring idêntico já falharam,
    // mas o nome continua visível na imagem, só com uma letra trocada/
    // perdida pelo OCR, ex.: "CRHYSTINA" em vez de "CHRYSTINA") — casamento
    // por aproximação, nunca arriscando confundir duas pessoas (ver
    // findBestFuzzyNameMatch).
    const fuzzy = findBestFuzzyNameMatch(normalizedLine, colaboradores, alreadyMatched, foundThisPass);
    if (fuzzy) {
      const matricula = normalizeMatricula(fuzzy.colaborador.matricula);
      const remainder = normalizedLine.slice(fuzzy.span.end).replace(/^[\s\-–—]+/, '');
      const { quantidade } = splitNameAndTrailingNumber(remainder);
      out.push({
        lineRaw: line,
        matriculaRaw: fuzzy.colaborador.matricula,
        matricula,
        nome: fuzzy.colaborador.nome.trim(),
        quantidade,
        matchedBy: 'nome-aproximado',
      });
      foundThisPass.add(matricula);
    }
  }
  return out;
}

// Nomes de 1 palavra só não entram na busca por aproximação — risco alto
// demais de "aproximar" um sobrenome comum da pessoa errada sem o resto do
// nome como contexto.
const NOME_FUZZY_MIN_WORDS = 2;
// ~1 erro de OCR a cada 5-6 caracteres do nome — generoso o bastante pra
// cobrir uma letra trocada/perdida (ex.: "CRHYSTINA" vs "CHRYSTINA",
// distância 2, num nome de ~29 caracteres), sem abrir pra nomes realmente
// diferentes.
const NOME_FUZZY_MAX_DISTANCE_RATIO = 0.18;
// Quando o segundo melhor candidato fica a menos de 2 de distância do
// melhor, os dois estão perto demais um do outro pra arriscar escolher —
// melhor deixar os dois de fora (viram "Não cadastrado" na conferência, sem
// nenhum dado salvo errado) do que atribuir a venda à pessoa errada.
const NOME_FUZZY_AMBIGUITY_MARGIN = 2;

interface WordSpan {
  text: string;
  start: number;
  end: number;
}

function splitWordsWithOffsets(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    spans.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/** Desliza uma janela do mesmo número de palavras do nome cadastrado pela
 * linha (em vez de indexOf, que exige substring idêntico) e devolve a
 * posição da janela com menor distância de edição até o nome, desde que
 * dentro do limite tolerado — null quando a linha não tem palavras
 * suficientes ou nenhuma janela chegou perto o bastante. */
function findNameFuzzyMatch(normalizedLine: string, normalizedNome: string): { start: number; end: number; distance: number } | null {
  const nomeWordCount = normalizedNome.split(/\s+/).filter(Boolean).length;
  if (nomeWordCount < NOME_FUZZY_MIN_WORDS) return null;
  const lineSpans = splitWordsWithOffsets(normalizedLine);
  if (lineSpans.length < nomeWordCount) return null;
  const maxDistance = Math.max(1, Math.round(normalizedNome.length * NOME_FUZZY_MAX_DISTANCE_RATIO));
  let best: { start: number; end: number; distance: number } | null = null;
  for (let i = 0; i + nomeWordCount <= lineSpans.length; i++) {
    const windowSpans = lineSpans.slice(i, i + nomeWordCount);
    const windowText = windowSpans.map((w) => w.text).join(' ');
    const distance = levenshteinDistance(windowText, normalizedNome);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { start: windowSpans[0].start, end: windowSpans[windowSpans.length - 1].end, distance };
    }
  }
  return best;
}

/** Roda findNameFuzzyMatch pra cada colaborador ainda não casado e devolve
 * o melhor — só quando ele não está "empatado" (dentro de
 * NOME_FUZZY_AMBIGUITY_MARGIN) com o segundo melhor, pra nunca adivinhar
 * entre duas pessoas de nome parecido. */
function findBestFuzzyNameMatch(
  normalizedLine: string,
  colaboradores: { nome: string; matricula: string }[],
  alreadyMatched: Set<string>,
  foundThisPass: Set<string>,
): { colaborador: { nome: string; matricula: string }; span: { start: number; end: number } } | null {
  const candidates: { colaborador: { nome: string; matricula: string }; span: { start: number; end: number }; distance: number }[] = [];
  for (const colaborador of colaboradores) {
    const nomeTrim = colaborador.nome.trim();
    const matricula = normalizeMatricula(colaborador.matricula);
    if (!nomeTrim || !matricula || alreadyMatched.has(matricula) || foundThisPass.has(matricula)) continue;
    const match = findNameFuzzyMatch(normalizedLine, normalize(nomeTrim));
    if (!match) continue;
    candidates.push({ colaborador, span: { start: match.start, end: match.end }, distance: match.distance });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const [bestC, secondC] = candidates;
  if (secondC && secondC.distance - bestC.distance < NOME_FUZZY_AMBIGUITY_MARGIN) return null;
  return bestC;
}

const DATE_IN_TEXT = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

/** Best-effort search for a DD/MM/AAAA-shaped date anywhere in OCR text —
 * used only to pre-fill the date field when the image happens to show one;
 * the field always stays editable, and the ADM must fill it in themselves
 * when nothing is found (see the file comment in DsmImageImportSection). */
export function detectDateInText(text: string): string | null {
  const m = text.match(DATE_IN_TEXT);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const day = parseInt(d, 10);
  const month = parseInt(mo, 10);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True when `line` is plausibly a header/furniture line worth hiding from
 * the raw-text preview noise count, e.g. "Loja Matrícula Nome..." — not
 * used for filtering (parseDsmImageLines already only accepts matching
 * lines), just exported for a nicer "N linhas reconhecidas" summary. */
export function countRecognizedLines(text: string): number {
  return parseDsmImageLines(text).length;
}

/** Builds the same DsmReviewRow[] the planilha path produces
 * (buildDsmReviewRows in dsmImport.ts), from OCR/pasted-text matches
 * instead — every row shares the one date chosen for the whole image
 * (there's no per-row date in a single print, unlike a planilha spanning
 * several days), and a line with no trailing number reads as
 * quantidade: 0 here (still shown for the ADM to fill in during review,
 * same as any other value they might need to correct). */
export function buildDsmReviewRowsFromImage(
  matches: DsmImageLineMatch[],
  dataISO: string,
  collaboratorByMatricula: Map<string, { id: string }>,
): DsmReviewRow[] {
  return matches.map((m, i) => ({
    key: `${i}-${m.matriculaRaw || m.nome}`,
    matriculaRaw: m.matriculaRaw ? `${m.matriculaRaw}-${m.nome}` : m.nome,
    matricula: m.matricula,
    nomeFonte: m.nome,
    collaboratorId: m.matricula ? (collaboratorByMatricula.get(m.matricula)?.id ?? null) : null,
    dataISO,
    quantidade: m.quantidade ?? 0,
    quantidadeIncerta: m.quantidade === null,
    fonte: m.matchedBy,
  }));
}

/** Roda as duas leituras por linha/texto (matrícula-traço, depois por nome
 * — ver as duas funções acima) e, por cima, aplica a 2ª análise por coluna
 * (dsmImageColumns.ts, já calculada à parte a partir dos bounding boxes do
 * mesmo OCR). A leitura por coluna é a ÚLTIMA palavra: sempre que ela achou
 * um valor pra uma matrícula, esse valor é usado, mesmo substituindo um que
 * a leitura por texto já tinha encontrado — pedido explícito do usuário
 * (2026-10-28): os três cabeçalhos do relatório (Matrícula, Nome do
 * funcionário, Número de Clientes) são o parâmetro de busca, e a leitura
 * por coluna é a única das duas que de fato procura pela POSIÇÃO do
 * cabeçalho "Número de Clientes" na imagem — a leitura por texto só
 * adivinha pela ordem/formato dos números da linha (vendas, valor, clientes,
 * clientes%), o que falha sempre que o OCR perde, gruda ou reordena um
 * token nessa sequência (o próprio bug relatado: números de "Número de
 * Vendas"/"Valor das Vendas" sendo salvos em vez do de "Número de
 * Clientes"). Um único ponto de verdade pra essa junção, reaproveitado
 * tanto na primeira vez (handleScan, pra montar o texto limpo mostrado na
 * tela) quanto se o ADM reprocessar depois de editar/colar texto à mão
 * (DsmImageImportSection.tsx). */
export function computeDsmImageMatches(
  text: string,
  colaboradores: { nome: string; matricula: string }[],
  columnMatches: Map<string, number> | null,
): DsmImageLineMatch[] {
  const primaryMatches = parseDsmImageLines(text);
  const alreadyMatched = new Set(primaryMatches.map((m) => m.matricula).filter(Boolean));
  const secondPassMatches = parseDsmImageLinesByCollaboratorName(text, colaboradores, alreadyMatched);
  let matches = [...primaryMatches, ...secondPassMatches];
  if (columnMatches && columnMatches.size > 0) {
    matches = matches.map((m) => {
      if (!m.matricula) return m;
      const columnValue = columnMatches.get(m.matricula);
      if (columnValue === undefined || columnValue === m.quantidade) return m;
      return { ...m, quantidade: columnValue, matchedBy: 'coluna' as const };
    });
  }
  return matches;
}

/** Reconstrói um texto limpo — uma linha "<matrícula>-<NOME>  <quantidade>"
 * por colaborador já reconhecido (quantidade omitida quando ainda null) —
 * pra substituir, na caixa "Texto extraído", o despejo bruto do OCR (com
 * Loja/Data/Vendas/Valor/Clientes(%) e qualquer outro texto/cabeçalho da
 * imagem ainda visíveis). Até agora essas colunas só eram ignoradas
 * internamente (dentro de parseDsmImageLines, ao montar as linhas da
 * conferência) — o texto mostrado na tela continuava sendo o bruto, o que
 * era exatamente o pedido do usuário (2026-10-24) que não tinha sido
 * atendido: "as outras colunas... devem ser ignoradas" também no texto
 * capturado, não só no resultado final. Cada linha que esta função escreve
 * casa de novo com MATRICULA_NAME_LINE (ou NAO_IDENTIFICADO_PATTERN) sem
 * perdas — round-trip sem perdas pra quando o ADM reprocessa sem editar
 * nada. */
export function buildCleanDsmImageText(matches: DsmImageLineMatch[]): string {
  return matches
    .map((m) => {
      const label = m.matriculaRaw ? `${m.matriculaRaw}-${m.nome}` : m.nome;
      return m.quantidade !== null ? `${label}  ${m.quantidade}` : label;
    })
    .join('\n');
}

// Padrão bem mais solto que MATRICULA_NAME_LINE — só pra contar quantas
// linhas do texto PARECEM o início de um registro de colaborador (uma
// sequência de 4+ dígitos logo no começo da linha), mesmo que o resto da
// linha não tenha dado pra interpretar depois. Serve só pra comparar contra
// quantas linhas realmente viraram uma linha reconhecida — nunca pra
// extrair dado nenhum (correndo o risco de contar falso-positivo é aceitável
// aqui, já que o resultado é só um alerta pro ADM conferir, nunca algo
// salvo automaticamente).
const APPARENT_COLLABORATOR_LINE = /^\d{4,10}\b/;

/** Segunda análise: conta quantas linhas do texto parecem o início de um
 * registro de colaborador, pra comparar contra `matches.length` depois das
 * duas leituras (matrícula-traço + nome) — se o texto aparenta ter mais
 * linhas de colaborador do que o número de linhas reconhecidas, é sinal de
 * que alguém pode ter ficado de fora (matrícula E nome ilegíveis pro OCR,
 * o único caso que nenhuma das duas leituras consegue recuperar sozinha). */
export function countApparentCollaboratorLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !FOOTER_LINE_PATTERN.test(l) && APPARENT_COLLABORATOR_LINE.test(l)).length;
}
