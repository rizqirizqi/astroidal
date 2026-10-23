import { basename } from "node:path";
import type { SyntaxImport, SyntaxSymbol } from "./types.js";

export type Language =
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "php"
  | "ruby"
  | "c"
  | "generic";

const EXTENSIONS: Record<string, Language> = {
  ".ts": "javascript",
  ".tsx": "javascript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".vue": "javascript",
  ".svelte": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "java",
  ".scala": "java",
  ".cs": "java",
  ".php": "php",
  ".rb": "ruby",
  ".c": "c",
  ".h": "c",
  ".cc": "c",
  ".cpp": "c",
  ".hpp": "c",
  ".swift": "java",
};

const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSIONS));

const DECISION =
  /\b(if|else if|elif|elsif|for|while|switch|case|catch|except|match|when)\b|&&|\|\||\?(?![=.])/g;

const CALL = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "function",
  "class",
  "new",
  "await",
  "typeof",
  "instanceof",
  "case",
  "elif",
  "except",
  "match",
  "when",
  "def",
  "func",
  "fn",
  "super",
  "throw",
  "import",
  "from",
  "as",
  "with",
  "elif",
  "raise",
  "yield",
  "assert",
  "del",
  "lambda",
  "not",
  "in",
  "is",
  "and",
  "or",
  "print",
  "echo",
  "isset",
  "empty",
]);

export function languageFor(path: string): Language {
  const extension = extensionOf(path);
  return EXTENSIONS[extension] ?? "generic";
}

export function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(path));
}

export function extensionOf(path: string): string {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

export function parseSyntax(
  path: string,
  text: string,
): { symbols: SyntaxSymbol[]; imports: SyntaxImport[] } {
  const language = languageFor(path);
  const source = unwrapScript(path, text);
  const imports = parseImports(language, source);
  const symbols =
    language === "python" || language === "ruby"
      ? parseIndented(language, source)
      : parseBraced(language, source);
  return { symbols, imports };
}

function unwrapScript(path: string, text: string): string {
  const extension = extensionOf(path);
  if (extension !== ".vue" && extension !== ".svelte") return text;
  const match = text.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  return match?.[1] ?? text;
}

function parseBraced(language: Language, text: string): SyntaxSymbol[] {
  const lines = text.split(/\r?\n/);
  const symbols: SyntaxSymbol[] = [];
  const stack: Array<{ symbol: SyntaxSymbol; depth: number; start: number }> =
    [];
  let depth = 0;

  function close(symbol: SyntaxSymbol, start: number, end: number): void {
    const body = lines
      .slice(start, end)
      .map((line) => stripLine(line))
      .join("\n");
    symbol.endLine = Math.max(start + 1, end);
    symbol.decisions = countDecisions(body);
    symbol.calls = collectCalls(body);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const code = stripLine(raw).trim();
    const before = depth;
    const insideClass = stack[stack.length - 1]?.symbol.kind === "class";
    if (stack.length === 0 || insideClass) {
      const declared = matchDeclaration(language, code, insideClass);
      const nestedMethod = insideClass && declared?.kind === "method";
      if (declared && (stack.length === 0 || nestedMethod)) {
        const symbol = startSymbol(declared, index);
        symbols.push(symbol);
        if (raw.includes("{") || (lines[index + 1] ?? "").includes("{"))
          stack.push({ symbol, depth: before, start: index });
        else close(symbol, index, index + 1);
      }
    }

    depth += braceDelta(raw);
    while (stack.length > 0) {
      const open = stack[stack.length - 1];
      if (!open) break;
      const closed =
        depth <= open.depth &&
        (index > open.start || (raw.includes("{") && raw.includes("}")));
      if (!closed) break;
      stack.pop();
      close(open.symbol, open.start, index + 1);
    }
  }

  while (stack.length > 0) {
    const open = stack.pop();
    if (open) close(open.symbol, open.start, lines.length);
  }
  return symbols;
}

function parseIndented(language: Language, text: string): SyntaxSymbol[] {
  const lines = text.split(/\r?\n/);
  const symbols: SyntaxSymbol[] = [];
  const stack: Array<{ symbol: SyntaxSymbol; indent: number; start: number }> =
    [];

  function closeTo(indent: number, endLine: number): void {
    while (
      stack.length > 0 &&
      indent <= (stack[stack.length - 1]?.indent ?? 0)
    ) {
      const open = stack.pop();
      if (!open) break;
      const body = lines
        .slice(open.start, endLine)
        .map((line) => stripLine(line))
        .join("\n");
      open.symbol.endLine = Math.max(open.start + 1, endLine);
      open.symbol.decisions = countDecisions(body);
      open.symbol.calls = collectCalls(body);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const code = stripLine(raw).trim();
    if (language === "ruby" && code === "end") {
      closeTo(indent + 1, index + 1);
      continue;
    }
    const declared = matchDeclaration(
      language,
      code,
      stack.some((item) => item.symbol.kind === "class"),
    );
    if (!declared) continue;
    closeTo(indent, index);
    const symbol = startSymbol(declared, index);
    symbols.push(symbol);
    stack.push({ symbol, indent, start: index });
  }
  closeTo(-1, lines.length);
  return symbols;
}

function startSymbol(
  declared: {
    name: string;
    kind: SyntaxSymbol["kind"];
    exported: boolean;
    signature: string;
  },
  index: number,
): SyntaxSymbol {
  return {
    name: declared.name,
    kind: declared.kind,
    line: index + 1,
    endLine: index + 1,
    signature: declared.signature.slice(0, 240),
    exported: declared.exported,
    decisions: 0,
    calls: [],
  };
}

function matchDeclaration(
  language: Language,
  code: string,
  insideClass: boolean,
): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  const line = code.trim();
  if (
    !line ||
    line.startsWith("//") ||
    line.startsWith("#") ||
    line.startsWith("*")
  )
    return null;
  if (language === "javascript") return matchJavaScript(line, insideClass);
  if (language === "python") return matchPython(line);
  if (language === "go") return matchGo(line);
  if (language === "rust") return matchRust(line);
  if (language === "java") return matchJava(line, insideClass);
  if (language === "php") return matchPhp(line);
  if (language === "ruby") return matchRuby(line);
  if (language === "c") return matchC(line);
  return matchGeneric(line);
}

function matchJavaScript(
  line: string,
  insideClass: boolean,
): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  const exported = /\bexport\b/.test(line);
  let match = line.match(
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/,
  );
  if (match?.[1])
    return { name: match[1], kind: "function", exported, signature: line };
  match = line.match(
    /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  );
  if (match?.[1])
    return { name: match[1], kind: "class", exported, signature: line };
  match = line.match(
    /^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  );
  if (match?.[1])
    return {
      name: match[1],
      kind: "type",
      exported: exported || line.startsWith("export"),
      signature: line,
    };
  match = line.match(
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^;]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
  );
  if (match?.[1])
    return { name: match[1], kind: "function", exported, signature: line };
  if (insideClass) {
    match = line.match(
      /^(?:public\s+|private\s+|protected\s+|async\s+|static\s+|readonly\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\(/,
    );
    if (
      match?.[1] &&
      !KEYWORDS.has(match[1]) &&
      !line.startsWith("if") &&
      !line.startsWith("for") &&
      !line.startsWith("while") &&
      !line.startsWith("switch")
    ) {
      return {
        name: match[1],
        kind: "method",
        exported: /\b(public|static)\b/.test(line) || exported,
        signature: line,
      };
    }
  }
  return null;
}

function matchPython(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  let match = line.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)/);
  if (match?.[1])
    return {
      name: match[1],
      kind:
        line.includes("(self") || line.includes("(cls") ? "method" : "function",
      exported: !match[1].startsWith("_"),
      signature: line,
    };
  match = line.match(/^class\s+([A-Za-z_][\w]*)/);
  if (match?.[1])
    return {
      name: match[1],
      kind: "class",
      exported: !match[1].startsWith("_"),
      signature: line,
    };
  return null;
}

function matchGo(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  let match = line.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/);
  if (match?.[1])
    return {
      name: match[1],
      kind: line.startsWith("func (") ? "method" : "function",
      exported: /^[A-Z]/.test(match[1]),
      signature: line,
    };
  match = line.match(/^type\s+([A-Za-z_][\w]*)/);
  if (match?.[1])
    return {
      name: match[1],
      kind: "type",
      exported: /^[A-Z]/.test(match[1]),
      signature: line,
    };
  return null;
}

function matchRust(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  const exported = /\bpub\b/.test(line);
  let match = line.match(
    /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][\w]*)/,
  );
  if (match?.[1])
    return { name: match[1], kind: "function", exported, signature: line };
  match = line.match(
    /^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|type)\s+([A-Za-z_][\w]*)/,
  );
  if (match?.[1])
    return {
      name: match[1],
      kind:
        line.includes("struct") ||
        line.includes("enum") ||
        line.includes("trait")
          ? "class"
          : "type",
      exported,
      signature: line,
    };
  return null;
}

function matchJava(
  line: string,
  insideClass: boolean,
): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  const exported = /\bpublic\b/.test(line);
  let match = line.match(
    /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|sealed\s+|static\s+|data\s+|open\s+)*(class|interface|enum|record|object)\s+([A-Za-z_][\w]*)/,
  );
  if (match?.[2])
    return {
      name: match[2],
      kind: match[1] === "interface" ? "type" : "class",
      exported,
      signature: line,
    };
  if (insideClass) {
    match = line.match(
      /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|async\s+|override\s+|fun\s+)*([A-Za-z_][\w]*)\s*\(/,
    );
    if (
      match?.[1] &&
      !KEYWORDS.has(match[1]) &&
      !/^(if|for|while|switch|catch)\b/.test(line)
    ) {
      return { name: match[1], kind: "method", exported, signature: line };
    }
  }
  return null;
}

function matchPhp(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  let match = line.match(/function\s+([A-Za-z_][\w]*)\s*\(/);
  if (match?.[1])
    return {
      name: match[1],
      kind: "function",
      exported:
        /\b(public|protected)\b/.test(line) || !line.includes("private"),
      signature: line,
    };
  match = line.match(/\bclass\s+([A-Za-z_][\w]*)/);
  if (match?.[1])
    return { name: match[1], kind: "class", exported: true, signature: line };
  return null;
}

function matchRuby(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  let match = line.match(/^def\s+(?:self\.)?([A-Za-z_][\w?!]*)/);
  if (match?.[1])
    return {
      name: match[1],
      kind: "function",
      exported: !match[1].startsWith("_") && !line.includes("private"),
      signature: line,
    };
  match = line.match(/^(?:class|module)\s+([A-Za-z_][\w:]*)/);
  if (match?.[1])
    return { name: match[1], kind: "class", exported: true, signature: line };
  return null;
}

function matchC(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  if (/^(if|for|while|switch|return|else)\b/.test(line)) return null;
  const match = line.match(
    /^(?:static\s+|inline\s+|extern\s+|virtual\s+|public\s+|private\s+)*([A-Za-z_][\w:\s*<&]*)\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*\{?$/,
  );
  if (!match?.[2] || KEYWORDS.has(match[2])) return null;
  return {
    name: match[2],
    kind: "function",
    exported: !/\bstatic\b/.test(line),
    signature: line,
  };
}

function matchGeneric(line: string): {
  name: string;
  kind: SyntaxSymbol["kind"];
  exported: boolean;
  signature: string;
} | null {
  return matchJavaScript(line, false) ?? matchPython(line) ?? matchGo(line);
}

export function parseImports(language: Language, text: string): SyntaxImport[] {
  const lines = text.split(/\r?\n/);
  const imports: SyntaxImport[] = [];
  let goBlock = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripLine(lines[index] ?? "").trim();
    if (language === "go" && line.startsWith("import (")) {
      goBlock = true;
      continue;
    }
    if (goBlock) {
      if (line.startsWith(")")) {
        goBlock = false;
        continue;
      }
      const spec = line.match(/"([^"]+)"/)?.[1];
      if (spec) imports.push({ line: index + 1, spec, names: [] });
      continue;
    }
    const found = matchImport(language, line);
    if (found) imports.push({ line: index + 1, ...found });
  }
  return imports;
}

function matchImport(
  language: Language,
  line: string,
): { spec: string; names: string[] } | null {
  if (language === "javascript") {
    const from = line.match(/from\s+['"]([^'"]+)['"]/);
    if (from?.[1]) return { spec: from[1], names: namedImports(line) };
    const require = line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    if (require?.[1]) return { spec: require[1], names: [] };
    const dynamic = line.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamic?.[1]) return { spec: dynamic[1], names: [] };
  }
  if (language === "python") {
    const from = line.match(/^from\s+(\.+[\w.]*)\s+import\s+(.+)/);
    if (from?.[1])
      return {
        spec: from[1],
        names: from[2]
          .split(",")
          .map((part) => part.trim().split(" as ")[0]?.trim() ?? "")
          .filter(Boolean),
      };
    const imported = line.match(/^import\s+(.+)/);
    if (imported?.[1])
      return {
        spec:
          imported[1].split(",")[0]?.trim().split(" as ")[0]?.trim() ??
          imported[1],
        names: [],
      };
  }
  if (language === "go") {
    const spec = line.match(/^import\s+(?:\w+\s+)?"([^"]+)"/)?.[1];
    if (spec) return { spec, names: [] };
  }
  if (language === "rust") {
    const spec = line.match(/^use\s+([^;]+)/)?.[1];
    if (spec) return { spec: spec.trim(), names: [] };
  }
  if (language === "java") {
    const spec = line.match(/^import\s+(?:static\s+)?([\w.]+)/)?.[1];
    if (spec) return { spec, names: [] };
  }
  if (language === "php") {
    const spec = line.match(
      /^(?:use|require|require_once|include|include_once)\s+['"]?([^'";]+)/,
    )?.[1];
    if (spec) return { spec: spec.trim(), names: [] };
  }
  if (language === "ruby") {
    const spec = line.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/)?.[1];
    if (spec) return { spec, names: [] };
  }
  if (language === "c") {
    const spec = line.match(/^#include\s+[<"]([^>"]+)[>"]/)?.[1];
    if (spec) return { spec, names: [] };
  }
  return null;
}

function namedImports(line: string): string[] {
  const match = line.match(/\{([^}]+)\}/);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim().split(" as ").pop()?.trim() ?? "")
    .filter(Boolean);
}

export function resolveRelative(
  fromFile: string,
  spec: string,
  known: Set<string>,
): string | null {
  if (!spec.startsWith(".")) return null;
  const base = normalizeRelative(dirnamePosix(fromFile), spec);
  const extensions = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".php",
    ".rb",
    ".vue",
    ".svelte",
  ];
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py"].map(
      (name) => joinPosix(base, name),
    ),
  ];
  for (const candidate of candidates) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

export function resolveInclude(
  spec: string,
  known: Set<string>,
): string | null {
  if (known.has(spec)) return spec;
  let match: string | null = null;
  for (const path of known) {
    if (path.endsWith(`/${spec}`) || path === spec) {
      if (!match || path.length < match.length) match = path;
    }
  }
  return match;
}

function normalizeRelative(fromDir: string, spec: string): string {
  const parts = fromDir.split("/").filter((part) => part && part !== ".");
  for (const part of spec.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function joinPosix(left: string, right: string): string {
  return `${left.replace(/\/$/, "")}/${right}`;
}

export function countDecisions(code: string): number {
  return [...code.matchAll(DECISION)].length;
}

function collectCalls(code: string): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(CALL)) {
    const name = match[1];
    if (!name || KEYWORDS.has(name) || name.length < 2) continue;
    names.add(name);
    if (names.size >= 15) break;
  }
  return [...names];
}

function stripLine(line: string): string {
  let quote: string | null = null;
  let output = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") break;
    if (char === "#") break;
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    output += char;
  }
  return output;
}

function braceDelta(line: string): number {
  let quote: string | null = null;
  let delta = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") break;
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

export function excerpt(
  text: string,
  start: number,
  end: number,
  limit = 40,
): string {
  const lines = text
    .split(/\r?\n/)
    .slice(start - 1, Math.min(end, start - 1 + limit));
  return lines.join("\n");
}

export function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function resolveImport(
  language: Language,
  fromFile: string,
  spec: string,
  known: Set<string>,
): string | null {
  if (language === "python" && spec.startsWith("."))
    return resolvePython(fromFile, spec, known);
  if (language === "c") return resolveInclude(spec, known);
  if (language === "ruby") {
    const relative = spec.startsWith(".") ? spec : `./${spec}`;
    return resolveRelative(fromFile, relative, known);
  }
  return resolveRelative(fromFile, spec, known);
}

function resolvePython(
  fromFile: string,
  spec: string,
  known: Set<string>,
): string | null {
  const dots = spec.match(/^\.+/)?.[0].length ?? 1;
  const rest = spec.slice(dots);
  const parts = dirnamePosix(fromFile).split("/").filter(Boolean);
  const baseParts = parts.slice(0, Math.max(0, parts.length - (dots - 1)));
  if (rest) baseParts.push(...rest.split(".").filter(Boolean));
  const base = baseParts.join("/");
  for (const candidate of [`${base}.py`, `${base}/__init__.py`, base]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

function dirnamePosix(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}
