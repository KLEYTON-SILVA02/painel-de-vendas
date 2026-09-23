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
import { normalize } from './normalize';
import { normalizeMatricula } from './parsing';

const FOOTER_LINE_PATTERN = /\b(sub)?tota(l|is)\b/i;
const NAO_IDENTIFICADO_PATTERN = /n[ãa]o\s+identificad/i;
const MATRICULA_NAME_LINE = /^(\d{4,10})\s*[-–—]\s*(.+)$/;

export interface DsmImageLineMatch {
  lineRaw: string;
  matriculaRaw: string;
  matricula: string;
  nome: string;
  quantidade: number | null;
  /** Set only by the second-pass name search (parseDsmImageLinesByCollaboratorName)
   * — absent for a line matched the normal way, so the review table can
   * flag these for extra scrutiny (matched by nome, not by the stricter
   * matrícula-dash pattern). */
  matchedBy?: 'nome';
}

// Um token de CONTAGEM ("Vendas" ou "Número de Clientes") é sempre um
// inteiro simples — só dígitos e opcionalmente pontos de milhar ("1.540"),
// nunca vírgula decimal. "Valor" (R$) e "Número de Clientes(%)" sempre
// carregam vírgula decimal, com ou sem o símbolo "%" (o OCR às vezes perde
// o "%" mas quase nunca inventa uma vírgula) — então é essa vírgula que
// distingue de forma confiável uma contagem de um valor monetário/percentual.
const COUNT_TOKEN = /^\d[\d.]*$/;
// Aceita um "%" opcional colado no fim do token só pra não quebrar a
// detecção de onde termina a linha de texto e começa a sequência de números.
const NUMERIC_TOKEN = /^[\d.,]+%?$/;

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
  // sometimes clientes%).
  let numericRunStart = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (NUMERIC_TOKEN.test(tokens[i])) numericRunStart = i;
    else break;
  }
  if (numericRunStart === tokens.length) return { nome: text.trim(), quantidade: null };
  const nome = tokens.slice(0, numericRunStart).join(' ').trim();
  const numericTokens = tokens.slice(numericRunStart);
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
      break;
    }
  }
  return out;
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
    fonte: m.matchedBy,
  }));
}
