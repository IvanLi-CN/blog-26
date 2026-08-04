export const SEARCH_COLUMNS = ["slug", "title", "excerpt", "body", "tags"] as const;

export type SearchColumn = (typeof SEARCH_COLUMNS)[number];

export type SearchQueryMode = "simple" | "advanced-valid" | "advanced-invalid";

export type SearchQueryAst =
  | { kind: "term"; value: string }
  | { kind: "phrase"; value: string }
  | { kind: "prefix"; value: string; phrase: boolean }
  | { kind: "column"; column: SearchColumn; child: SearchQueryAst }
  | { kind: "near"; atoms: SearchQueryAst[]; distance: number }
  | { kind: "and"; children: SearchQueryAst[] }
  | { kind: "or"; children: SearchQueryAst[] }
  | { kind: "not"; include: SearchQueryAst; exclude: SearchQueryAst };

export type SearchQueryPlan = {
  query: string;
  mode: SearchQueryMode;
  ast: SearchQueryAst | null;
  literalTerms: string[];
  ftsQuery: string | null;
  hasShortLeaf: boolean;
  error?: string;
};

type Token =
  | { kind: "word"; value: string }
  | { kind: "phrase"; value: string }
  | { kind: "operator"; value: "AND" | "OR" | "NOT" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "colon" }
  | { kind: "star" }
  | { kind: "comma" }
  | { kind: "unsupported"; value: string };

type ScanResult = {
  tokens: Token[];
  hasAdvancedMarker: boolean;
  error?: string;
};

const MAX_NEAR_DISTANCE = 64;
const RESERVED_OPERATORS = new Set(["AND", "OR", "NOT"]);

function normalizeQuery(query: string) {
  return query.normalize("NFKC").trim();
}

function isWhitespace(value: string) {
  return /\s/u.test(value);
}

function isStructuralCharacter(value: string) {
  return (
    value === '"' ||
    value === "(" ||
    value === ")" ||
    value === ":" ||
    value === "*" ||
    value === ","
  );
}

function isUnsupportedSyntaxCharacter(value: string) {
  return value === "^" || value === "{" || value === "}";
}

function scanQuery(query: string): ScanResult {
  const tokens: Token[] = [];
  let hasAdvancedMarker = false;
  let index = 0;

  while (index < query.length) {
    const value = query[index] ?? "";

    if (isWhitespace(value)) {
      index += 1;
      continue;
    }

    if (value === '"') {
      hasAdvancedMarker = true;
      index += 1;
      const start = index;
      let phrase = "";
      let closed = false;

      while (index < query.length) {
        const current = query[index] ?? "";
        if (current === '"') {
          closed = true;
          break;
        }
        if (current === "\\" && query[index + 1] === '"') {
          phrase += '"';
          index += 2;
          continue;
        }
        phrase += current;
        index += 1;
      }

      if (!closed) {
        return {
          tokens,
          hasAdvancedMarker,
          error: `Unterminated phrase at ${start}`,
        };
      }

      tokens.push({ kind: "phrase", value: phrase });
      index += 1;
      continue;
    }

    if (value === "(") {
      hasAdvancedMarker = true;
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }

    if (value === ")") {
      hasAdvancedMarker = true;
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }

    if (value === ":") {
      hasAdvancedMarker = true;
      tokens.push({ kind: "colon" });
      index += 1;
      continue;
    }

    if (value === "*") {
      hasAdvancedMarker = true;
      const next = query[index + 1] ?? "";
      if (next && !isWhitespace(next) && next !== ")" && next !== ",") {
        tokens.push({ kind: "unsupported", value });
        index += 1;
        continue;
      }
      tokens.push({ kind: "star" });
      index += 1;
      continue;
    }

    if (value === ",") {
      hasAdvancedMarker = true;
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }

    if (isUnsupportedSyntaxCharacter(value)) {
      hasAdvancedMarker = true;
      tokens.push({ kind: "unsupported", value });
      index += 1;
      continue;
    }

    const start = index;
    while (
      index < query.length &&
      !isWhitespace(query[index] ?? "") &&
      !isStructuralCharacter(query[index] ?? "") &&
      !isUnsupportedSyntaxCharacter(query[index] ?? "")
    ) {
      index += 1;
    }

    const word = query.slice(start, index);
    const upper = word.toUpperCase();
    if (RESERVED_OPERATORS.has(upper)) {
      hasAdvancedMarker = true;
      tokens.push({ kind: "operator", value: upper as "AND" | "OR" | "NOT" });
    } else {
      tokens.push({ kind: "word", value: word });
    }
  }

  return { tokens, hasAdvancedMarker };
}

class QueryParser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): SearchQueryAst {
    const ast = this.parseOr();
    if (this.position !== this.tokens.length) {
      throw new Error("Unexpected token at end of query");
    }
    return ast;
  }

  private peek() {
    return this.tokens[this.position];
  }

  private consume() {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  private parseOr(): SearchQueryAst {
    let left = this.parseAnd();

    while (true) {
      const token = this.peek();
      if (token?.kind !== "operator" || token.value !== "OR") break;
      this.consume();
      left = { kind: "or", children: [left, this.parseAnd()] };
    }

    return left;
  }

  private parseAnd(): SearchQueryAst {
    let left = this.parsePrimary();

    while (true) {
      const token = this.peek();
      if (token?.kind === "operator" && token.value === "AND") {
        this.consume();
        left = { kind: "and", children: [left, this.parsePrimary()] };
        continue;
      }

      if (token?.kind === "operator" && token.value === "NOT") {
        this.consume();
        left = { kind: "not", include: left, exclude: this.parsePrimary() };
        continue;
      }

      if (this.startsPrimary(token)) {
        left = { kind: "and", children: [left, this.parsePrimary()] };
        continue;
      }

      return left;
    }
  }

  private parsePrimary(): SearchQueryAst {
    const token = this.peek();
    if (!token) throw new Error("Expected a search term");

    if (token.kind === "lparen") {
      this.consume();
      const child = this.parseOr();
      if (this.peek()?.kind !== "rparen") throw new Error("Unclosed parenthesis");
      this.consume();
      return child;
    }

    if (token.kind === "phrase") {
      this.consume();
      if (!token.value.trim()) throw new Error("Empty phrase");
      return this.applyPrefix({ kind: "phrase", value: token.value });
    }

    if (token.kind === "word") {
      this.consume();
      if (token.value.toUpperCase() === "NEAR" && this.peek()?.kind === "lparen") {
        return this.parseNear();
      }

      if (this.peek()?.kind === "colon") {
        const column = token.value.toLowerCase();
        if (!SEARCH_COLUMNS.includes(column as SearchColumn)) {
          throw new Error(`Unknown search column: ${token.value}`);
        }
        this.consume();
        return {
          kind: "column",
          column: column as SearchColumn,
          child: this.parsePrimary(),
        };
      }

      return this.applyPrefix({ kind: "term", value: token.value });
    }

    throw new Error("Expected a search term");
  }

  private parseNear(): SearchQueryAst {
    this.consume();
    const atoms: SearchQueryAst[] = [];

    while (this.peek() && this.peek()?.kind !== "comma") {
      const token = this.peek();
      if (token.kind === "rparen") throw new Error("NEAR requires at least two atoms");
      if (token.kind === "operator" || token.kind === "lparen") {
        throw new Error("NEAR only accepts terms or phrases");
      }
      atoms.push(this.parseNearAtom());
    }

    if (atoms.length < 2 || this.peek()?.kind !== "comma") {
      throw new Error("NEAR requires atoms and a distance");
    }
    this.consume();

    const distanceToken = this.consume();
    if (distanceToken?.kind !== "word" || !/^\d+$/u.test(distanceToken.value)) {
      throw new Error("NEAR distance must be a non-negative integer");
    }
    const distance = Number(distanceToken.value);
    if (distance > MAX_NEAR_DISTANCE) {
      throw new Error(`NEAR distance exceeds ${MAX_NEAR_DISTANCE}`);
    }

    if (this.peek()?.kind !== "rparen") throw new Error("Unclosed NEAR expression");
    this.consume();
    return { kind: "near", atoms, distance };
  }

  private parseNearAtom(): SearchQueryAst {
    const token = this.peek();
    if (!token || (token.kind !== "word" && token.kind !== "phrase")) {
      throw new Error("NEAR only accepts terms or phrases");
    }
    this.consume();
    const atom =
      token.kind === "phrase"
        ? ({ kind: "phrase", value: token.value } as const)
        : ({ kind: "term", value: token.value } as const);
    if (!atom.value.trim()) throw new Error("NEAR atom cannot be empty");
    return this.applyPrefix(atom);
  }

  private applyPrefix(ast: SearchQueryAst): SearchQueryAst {
    if (this.peek()?.kind !== "star") return ast;
    this.consume();
    if (ast.kind !== "term" && ast.kind !== "phrase") {
      throw new Error("Prefix can only apply to a term or phrase");
    }
    return { kind: "prefix", value: ast.value, phrase: ast.kind === "phrase" };
  }

  private startsPrimary(token: Token | undefined) {
    return token?.kind === "word" || token?.kind === "phrase" || token?.kind === "lparen";
  }
}

function escapeFtsValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function renderFts5Query(ast: SearchQueryAst | null): string {
  if (!ast) return "";

  switch (ast.kind) {
    case "term":
    case "phrase":
      return escapeFtsValue(ast.value);
    case "prefix":
      return `${escapeFtsValue(ast.value)}*`;
    case "column":
      return `${ast.column} : ${renderFts5Query(ast.child)}`;
    case "near":
      return `NEAR(${ast.atoms.map((atom) => renderFts5Query(atom)).join(" ")}, ${ast.distance})`;
    case "and":
      return `(${ast.children.map((child) => renderFts5Query(child)).join(" AND ")})`;
    case "or":
      return `(${ast.children.map((child) => renderFts5Query(child)).join(" OR ")})`;
    case "not":
      return `(${renderFts5Query(ast.include)} NOT ${renderFts5Query(ast.exclude)})`;
  }
}

function appendLiteralTerms(ast: SearchQueryAst, target: string[]) {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix":
      if (ast.value.trim()) target.push(ast.value.trim());
      return;
    case "column":
      appendLiteralTerms(ast.child, target);
      return;
    case "near":
      for (const atom of ast.atoms) appendLiteralTerms(atom, target);
      return;
    case "and":
    case "or":
      for (const child of ast.children) appendLiteralTerms(child, target);
      return;
    case "not":
      appendLiteralTerms(ast.include, target);
      appendLiteralTerms(ast.exclude, target);
  }
}

export function getSearchLiteralTerms(ast: SearchQueryAst | null) {
  if (!ast) return [];
  const terms: string[] = [];
  appendLiteralTerms(ast, terms);
  return Array.from(new Set(terms));
}

function collectLiteralTerms(query: string) {
  const terms: string[] = [];
  let index = 0;

  while (index < query.length) {
    const value = query[index] ?? "";
    if (
      isWhitespace(value) ||
      value === "(" ||
      value === ")" ||
      value === ":" ||
      value === "*" ||
      value === "," ||
      isUnsupportedSyntaxCharacter(value)
    ) {
      index += 1;
      continue;
    }

    if (value === '"') {
      index += 1;
      let phrase = "";
      while (index < query.length && query[index] !== '"') {
        phrase += query[index] ?? "";
        index += 1;
      }
      if (query[index] === '"') index += 1;
      if (phrase.trim()) terms.push(phrase.trim());
      continue;
    }

    const start = index;
    while (
      index < query.length &&
      !isWhitespace(query[index] ?? "") &&
      !isStructuralCharacter(query[index] ?? "") &&
      !isUnsupportedSyntaxCharacter(query[index] ?? "")
    ) {
      index += 1;
    }
    const word = query.slice(start, index).trim();
    if (word) terms.push(word);
  }

  return Array.from(new Set(terms));
}

function buildAndAst(terms: string[]): SearchQueryAst | null {
  const nodes = terms.map((value) => ({ kind: "term", value }) as const);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return { kind: "and", children: nodes };
}

function hasShortSearchLeaf(ast: SearchQueryAst): boolean {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix":
      return Array.from(ast.value.replace(/\s+/gu, "")).length < 3;
    case "column":
      return hasShortSearchLeaf(ast.child);
    case "near":
      return ast.atoms.some((atom) => hasShortSearchLeaf(atom));
    case "and":
    case "or":
      return ast.children.some((child) => hasShortSearchLeaf(child));
    case "not":
      return hasShortSearchLeaf(ast.include) || hasShortSearchLeaf(ast.exclude);
  }
}

function hasShortNearOperand(ast: SearchQueryAst): boolean {
  switch (ast.kind) {
    case "near":
      return ast.atoms.some((atom) => hasShortSearchLeaf(atom));
    case "column":
      return hasShortNearOperand(ast.child);
    case "and":
    case "or":
      return ast.children.some((child) => hasShortNearOperand(child));
    case "not":
      return hasShortNearOperand(ast.include) || hasShortNearOperand(ast.exclude);
    default:
      return false;
  }
}

function invalidPlan(query: string, error: string): SearchQueryPlan {
  const literalTerms = collectLiteralTerms(query);
  const ast = buildAndAst(literalTerms);
  return {
    query,
    mode: "advanced-invalid",
    ast,
    literalTerms,
    ftsQuery: renderFts5Query(ast),
    hasShortLeaf: ast ? hasShortSearchLeaf(ast) : false,
    error,
  };
}

export function parseSearchQuery(input: string): SearchQueryPlan {
  const query = normalizeQuery(input);
  if (!query) {
    return {
      query,
      mode: "simple",
      ast: null,
      literalTerms: [],
      ftsQuery: null,
      hasShortLeaf: false,
    };
  }

  const scan = scanQuery(query);
  if (scan.error || scan.tokens.some((token) => token.kind === "unsupported")) {
    return invalidPlan(query, scan.error ?? "Unsupported advanced syntax");
  }

  try {
    const ast = new QueryParser(scan.tokens).parse();
    if (hasShortNearOperand(ast)) {
      return invalidPlan(query, "NEAR operands must contain at least three Unicode code points");
    }
    const literalTerms = getSearchLiteralTerms(ast);
    const mode: SearchQueryMode = scan.hasAdvancedMarker ? "advanced-valid" : "simple";
    return {
      query,
      mode,
      ast,
      literalTerms,
      ftsQuery: renderFts5Query(ast),
      hasShortLeaf: hasShortSearchLeaf(ast),
    };
  } catch (error) {
    return invalidPlan(query, error instanceof Error ? error.message : "Invalid search syntax");
  }
}
