const BLAST = 40;
const COMPLEXITY_RAW = 12;
const COMPLEXITY = Math.round(100 * (1 - Math.exp(-COMPLEXITY_RAW / 36)));
const SECURITY = 10;
const PERFORMANCE = 15;

function astroidPath(
  cx: number,
  cy: number,
  maxR: number,
  right: number,
  top: number,
  left: number,
  bottom: number,
) {
  const commands: string[] = [];
  const steps = 128;
  for (let index = 0; index <= steps; index += 1) {
    const turn = (index / steps) * Math.PI * 2;
    const cosine = Math.cos(turn);
    const sine = Math.sin(turn);
    const horizontal = (cosine >= 0 ? right : left) / 100;
    const vertical = (sine >= 0 ? bottom : top) / 100;
    const x =
      cx + Math.sign(cosine) * Math.abs(cosine) ** 3 * horizontal * maxR;
    const y = cy + Math.sign(sine) * Math.abs(sine) ** 3 * vertical * maxR;
    commands.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${commands.join(" ")} Z`;
}

export function ImpactSurface() {
  const guide = astroidPath(160, 156, 108, 100, 100, 100, 100);
  const value = astroidPath(
    160,
    156,
    108,
    BLAST,
    COMPLEXITY,
    SECURITY,
    PERFORMANCE,
  );

  return (
    <svg
      viewBox="0 0 320 312"
      role="img"
      aria-label={`Impact surface. Blast ${BLAST}. Complexity +${COMPLEXITY_RAW}. Security ${SECURITY}. Performance ${PERFORMANCE}.`}
      className="h-auto w-full"
    >
      <defs>
        <radialGradient id="passed-astroid-fill" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#7F00FF" stopOpacity="0.45" />
          <stop offset="78%" stopColor="#00F2FE" stopOpacity="0.16" />
        </radialGradient>
      </defs>
      <path
        d={guide}
        fill="none"
        stroke="rgba(232,238,248,0.2)"
        strokeWidth="1"
      />
      <line
        x1="160"
        y1="48"
        x2="160"
        y2="264"
        stroke="rgba(232,238,248,0.16)"
        strokeWidth="1"
      />
      <line
        x1="52"
        y1="156"
        x2="268"
        y2="156"
        stroke="rgba(232,238,248,0.16)"
        strokeWidth="1"
      />
      <path
        d={value}
        fill="url(#passed-astroid-fill)"
        stroke="#00F2FE"
        strokeWidth="1.75"
      />
      <circle cx={160 + (BLAST / 100) * 108} cy="156" r="3.5" fill="#00F2FE" />
      <circle
        cx="160"
        cy={156 - (COMPLEXITY / 100) * 108}
        r="3.5"
        fill="#D2B4FF"
      />
      <circle
        cx={160 - (SECURITY / 100) * 108}
        cy="156"
        r="3.5"
        fill="#FFB020"
      />
      <circle
        cx="160"
        cy={156 + (PERFORMANCE / 100) * 108}
        r="3.5"
        fill="#9AF7FF"
      />
      <text
        x="160"
        y="22"
        textAnchor="middle"
        fill="#A8B3C7"
        fontSize="11"
        letterSpacing="0.06em"
      >
        Complexity
      </text>
      <text
        x="160"
        y="40"
        textAnchor="middle"
        fill="#D2B4FF"
        fontSize="13"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        fontWeight="500"
      >
        +{COMPLEXITY_RAW}
      </text>
      <text
        x="276"
        y="150"
        textAnchor="start"
        fill="#A8B3C7"
        fontSize="11"
        letterSpacing="0.06em"
      >
        Blast
      </text>
      <text
        x="276"
        y="168"
        textAnchor="start"
        fill="#00F2FE"
        fontSize="13"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        fontWeight="500"
      >
        {BLAST}
      </text>
      <text
        x="44"
        y="150"
        textAnchor="end"
        fill="#A8B3C7"
        fontSize="11"
        letterSpacing="0.06em"
      >
        Security
      </text>
      <text
        x="44"
        y="168"
        textAnchor="end"
        fill="#FFB020"
        fontSize="13"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        fontWeight="500"
      >
        {SECURITY}
      </text>
      <text
        x="160"
        y="286"
        textAnchor="middle"
        fill="#A8B3C7"
        fontSize="11"
        letterSpacing="0.06em"
      >
        Performance
      </text>
      <text
        x="160"
        y="304"
        textAnchor="middle"
        fill="#9AF7FF"
        fontSize="13"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        fontWeight="500"
      >
        {PERFORMANCE}
      </text>
    </svg>
  );
}
