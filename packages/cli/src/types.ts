export type FileStatus = "added" | "modified" | "deleted" | "renamed";
export type Spectral = "text" | "logic" | "contract";
export type RiskTier = "trivial" | "lite" | "full";
export type Severity = "critical" | "high" | "medium";
export type SymbolKind = "function" | "class" | "method" | "type" | "file";
export type LeadCategory =
  | "logic"
  | "state"
  | "contract"
  | "security"
  | "ux"
  | "architecture"
  | "performance";

export interface ParsedFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  patch: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface ChangeUnit {
  id: string;
  label: string;
  pr?: number;
  title?: string;
  url?: string;
  source: "local" | "remote-diff";
  base?: string;
  head?: string;
  headOid?: string;
  files: ParsedFile[];
}

export interface SyntaxSymbol {
  name: string;
  kind: Exclude<SymbolKind, "file">;
  line: number;
  endLine: number;
  signature: string;
  exported: boolean;
  decisions: number;
  calls: string[];
}

export interface SyntaxImport {
  line: number;
  spec: string;
  names: string[];
}

export interface Lead {
  category: LeadCategory;
  path: string;
  line: number;
  units: string[];
  detail: string;
}

export interface GraphUnit {
  id: string;
  label: string;
  pr?: number;
  title?: string;
  url?: string;
  source: "local" | "remote-diff";
  base?: string;
  head?: string;
}

export interface ReviewScore {
  value: number;
  verdict: "passed" | "fix";
  reason: string;
}

export interface ImpactScores {
  blastRadius: number;
  complexityDelta: number;
  securityExposure: number;
  performanceImpact: number;
  blastFiles: number;
  complexityRaw: number;
  securityLeads: number;
  performanceLeads: number;
}

export interface GraphFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  spectral: Spectral;
  units: string[];
  prs: Array<number | string>;
  additions: number;
  deletions: number;
  binary: boolean;
  partial: boolean;
  patch: string;
}

export interface GraphNode {
  id: string;
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  endLine: number;
  signature: string;
  exported: boolean;
  complexity: number;
  complexityDelta: number;
  spectral: Spectral;
  role: "changed" | "neighbor";
  units: string[];
  prs: Array<number | string>;
  calls: string[];
  excerpt: string;
  additions: number;
  deletions: number;
  oldLine?: number;
  oldEndLine?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "call" | "import" | "caller";
}

export interface GraphNeighbor {
  path: string;
  via: string;
  reason: string;
}

export interface ReviewGroup {
  name: string;
  paths: string[];
}

export interface RankedFinding {
  id: string;
  pr: string;
  severity: Severity;
  description: string;
  path: string;
  line: number | null;
  recommendation: string;
  category: string;
}

export interface Graph {
  version: 1;
  generatedAt: string;
  repoName: string;
  notes: string[];
  commands: string[];
  units: GraphUnit[];
  impact: ImpactScores & {
    byUnit: Array<ImpactScores & { unitId: string; label: string }>;
  };
  summary: {
    files: number;
    symbols: number;
    neighbors: number;
    additions: number;
    deletions: number;
    riskTier: RiskTier;
    truncated: boolean;
    reviewed: boolean;
  };
  score: ReviewScore;
  files: GraphFile[];
  neighbors: GraphNeighbor[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  leads: Lead[];
  findings: RankedFinding[];
  groups: ReviewGroup[];
}

export interface BuiltSymbol extends SyntaxSymbol {
  path: string;
  complexity: number;
  complexityDelta: number;
  additions: number;
  deletions: number;
  oldLine?: number;
  oldEndLine?: number;
  units: string[];
  prs: Array<number | string>;
  spectral: Spectral;
}

export interface FileVariant {
  unit: string;
  pr?: number;
  patch: string;
  text: string;
  oldText: string;
  partial: boolean;
}

export interface BuiltFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  spectral: Spectral;
  units: string[];
  prs: Array<number | string>;
  additions: number;
  deletions: number;
  binary: boolean;
  partial: boolean;
  patch: string;
  text: string;
  oldText: string;
  variants: FileVariant[];
  symbols: BuiltSymbol[];
  complexityDelta: number;
}

export interface BuildResult {
  graph: Graph;
  files: BuiltFile[];
}

export interface GraphOptions {
  prs: number[];
  open: boolean;
  authors: string[];
  labels: string[];
  base?: string;
  stack: boolean;
  commit?: string;
  staged: boolean;
  unstaged: boolean;
  limit: number;
}

export interface DroppedFinding {
  description: string;
  path: string;
  reason: string;
}
