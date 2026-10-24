export const GITHUB_URL = "https://github.com/rizqirizqi/astroidal";
export const ISSUES_URL = "https://github.com/rizqirizqi/astroidal/issues";
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const INSTALL_COMMAND = "npx --yes astroidal";

export const SETUP_PROMPT = `Set up Astroidal and review this change. Do not add it as a dependency. Run:

npx --yes astroidal init
npx --yes astroidal graph

Follow the installed Astroidal skill: search the bug map and write .astroidal/findings.json. Then run:

npx --yes astroidal rank

Reply with the score, Passed, Review, or Fix first, and the paths to .astroidal/review.md and .astroidal/constellation.html.`;

export const NAV_ITEMS = [
  { href: "#review", label: "Review" },
  { href: "#sky", label: "Map" },
  { href: "#score", label: "Score" },
  { href: "#setup", label: "Setup" },
  { href: "#questions", label: "Questions" },
] as const;

export const WORKFLOW = [
  {
    index: "01",
    who: "Astroidal",
    tone: "tool",
    title: "Maps the change",
    text: "Directories become clouds. Imports and calls become lines. The stars are the symbols the diff actually touched.",
  },
  {
    index: "02",
    who: "Your agent",
    tone: "agent",
    title: "Looks for bugs",
    text: "It searches that map and writes findings. A finding has to name the symbol and quote a line that is in the change.",
  },
  {
    index: "03",
    who: "Astroidal",
    tone: "tool",
    title: "Scores the review",
    text: "The verdict is Passed, Review, or Fix first. Passed means the detail can be skipped. Review means a person still reads the change. Fix first means a quoted bug remains.",
  },
] as const;

export const SCOPES = [
  "Dirty worktree",
  "Clean branch",
  "Pull requests",
  "Stack",
  "One commit",
  "Staged",
] as const;

export const QUESTIONS = [
  {
    question: "Does Astroidal get added to the project?",
    answer:
      "No. Run it with npx. init installs the skill into .agents/skills and gitignores .astroidal. Pass --agent cursor, claude, codex, or copilot to copy that same skill for one agent. It does not edit package.json, a lockfile, or a module manifest.",
  },
  {
    question: "Who looks for the bugs?",
    answer:
      "Your agent. Astroidal maps the change and writes the packets. The agent searches those packets and writes .astroidal/findings.json. rank scores what still quotes a real line.",
  },
  {
    question: "What does Passed, Review, or Fix first mean?",
    answer:
      "Passed means rank found no cusp, every added block was checked, and the score is at least 80, so a person can skip the detail. Review means there is no cusp and a person still reads the change, because the impact is high or a block was not checked. Fix first means rank kept a finding that quotes a real line.",
  },
  {
    question: "What can one map cover?",
    answer:
      "A dirty worktree, including untracked files. A clean branch against its default base. A batch of pull requests, the stack under the current one, a single commit, or staged changes. A batch is one merged map.",
  },
  {
    question: "What do the shapes mean?",
    answer:
      "A cyan circle is logic. A violet diamond is a contract. A square is text. A ring is an orbit neighbor. A cloud is a directory. A violet dashed cloud is a group named in the review. A line is an import or a call.",
  },
  {
    question: "What does a pull request show?",
    answer:
      "comment writes one pull request comment with the score, the verdict, and the cusp paths. It does not approve, merge, or request reviewers. The map stays at .astroidal/constellation.html.",
  },
  {
    question: "Where is the source, and what license is it?",
    answer:
      "The source is on GitHub and the license is MIT. Questions and bugs go to the issue tracker. This page is the map’s front door, not a second manual.",
  },
] as const;
