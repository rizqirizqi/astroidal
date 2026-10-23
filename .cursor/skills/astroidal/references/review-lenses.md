# Review lenses

Use this while searching Added lines. Astroidal still maps the diff, checks quotes, and ranks findings. This file decides what is worth filing.

The gate, the spec pass, and the standards pass apply to every review. Open a language section only when Added lines contain that language.

## Gate

File a finding only when all of these are true:

- You can name the input, caller, or user who hits it.
- You can quote one exact line from an added-lines block, the mapped file, or its one-hop neighbor.
- The failure is concrete: a crash, a wrong result, a lost or partial write, a bypassed check, a leaked secret, a broken contract, or a dead-end flow.
- The recommendation is the specific change that removes the bug.

Severity:

- `critical` — crash, data loss, authz bypass, injection, or secret exposure on a path real traffic hits.
- `high` — wrong result, lost write, race, or broken contract on a realistic path.
- `medium` — a realistic edge fails: empty input, retry, timezone, leaked resource, unbounded query, or a check that fails open.

Do not file formatting, naming, comments, praise, questions, file length, SOLID lectures, speculative abstractions, or refactors that do not name a failure. A high impact score is not a finding. A passing suite is not a reason to skip a block. Do not downgrade a crash or an authz gap because the patch looks small. Do not invent a finding to fill the list.

Write the description as what breaks, in one or two sentences, with the symbol names. For security and architecture, also say why the fix holds. Drop hedging ("might", "consider", "I noticed"). Do not restate what the line already says.

## Spec

Use the pull request title and body, the commit messages, and any spec the change names. Read a missing title or body with one `gh pr view` on GitHub, or one `glab mr view` on GitLab. Do not poll checks.

- The diff contradicts a stated behavior. Quote the line that does the wrong thing. Category `contract` or `logic`.
- A changed function claims to implement a requirement and skips it. Quote that function. Category `logic`.
- The diff adds behavior the spec forbids, and that behavior has a failure mode. Quote the added line.

No spec, no spec findings. Extra behavior with no failure mode is not a finding.

## Standards

Search the repo for `CONTRIBUTING.md`, `CODING_STANDARDS.md`, `AGENTS.md`, and any doc the project treats as a rule. A documented project rule overrides this catalog. Breaking a safety or correctness rule is a finding. Skip a rule a formatter or linter already enforces.

These smells are judgement, not findings, until the gate passes:

- Mysterious name, feature envy, data clumps, divergent change, message chains, middle man: not findings.
- Duplicated code: a finding when the copies can diverge and one path is already wrong.
- Primitive obsession, or a raw string where a union exists: a finding when a typo or unexpected value takes the wrong branch.
- Repeated switch: a finding when one site was updated and a sibling site still has the old case.
- Shotgun surgery: a finding when a one-hop caller the map lists still uses the old contract.
- Speculative generality: a finding when the extra branch skips or hides the real path.
- Refused bequest: a finding when an override drops a check the base type still promises.

When an architecture finding is real, name the move in the recommendation: put the feature branch back on the existing policy, call the canonical helper, delete the wrapper that skips a check, or make the type boundary explicit so the silent fallback goes away. Moving the same branches into a new file is not a finding.

## Every changed block

Check the block against each class, including blocks whose filename suggests a different class.

### Logic

Wrong branch, inverted condition, `==` where identity or type matters, off-by-one, timezone or naive timestamp, `NULL` compared with `=`, empty or zero treated as missing, falsy `""` / `0` / `[]` in a language where those values are valid, float equality, integer overflow in a size, boundary missed (empty, one, max).

Missing `await`. Promise or error ignored. Empty `catch`, bare `except`, `unwrap` / `try!` / force-unwrap on a production path, `@` or `_ =` hiding a failure. Fail-open: the error path continues as success. A lock or status that stays set after a failure and blocks the retry.

### State

Partial write, missing transaction around related updates, check-then-act on a balance, file, or permission. Lost update. Stale cache served after the write. Stored flag that can disagree with its source. External side effect inside a transaction that cannot roll back. Retry of a payment, email, or create without an idempotency key. Bulk update or delete that skips a validation the row still needs. Write that reports success when the value did not change and a later reader depends on the new value.

### Contract

Caller still on the old signature, route, status code, or field. Silent `any`, cast, or fallback that hides a broken invariant. Stringly-typed status or event name that a typo will miss. Schema and code disagree. Dynamic SQL identifier not taken from a whitelist. Client-only validation on a write the server accepts.

### Security

Authz uses the wrong identity, or an object id is trusted without an ownership check. Query, command, HTML, path, or redirect built by concatenation or interpolation. Sinks include `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `bypassSecurityTrust*`, `mark_safe`, and a shell string. `eval`, `pickle`, `Marshal.load`, `unserialize`, or `yaml.load` on untrusted data. `jwt.decode` without verify, the algorithm taken from the token, or a hardcoded secret. Password hashed with MD5 or SHA-1. Token from `Math.random` or another non-crypto generator. Secret, token, or password in source, logs, or an error response. CORS `*` with credentials. CSRF disabled on a cookie-authenticated state change. User-controlled URL fetched with no allowlist. Open redirect. Upload path taken from the client filename. `permit!` or an empty allowlist. Internal stack or SQL returned to the client.

### Performance

File only when the cost is realistic for this endpoint: a query per row, an unbounded list with no limit, a nested loop over a collection that grows with users, a blocked event loop or UI thread, an unbounded cache, or a connection, listener, timer, or task with no release. Skip micro-optimizations, bundle opinions, and Web Vitals with no broken behavior in the diff.

### UX

Dead end, missing error, empty, or loading state, navigation to the wrong place, submit that double-fires, optimistic update with no rollback. An optimistic update of a payment or delete is `high`. A form that fails with no message is `medium`.

### Tests

The finding is the wrong branch, not the absence of a test. When the changed condition is untested, name the input the test should pin in the recommendation. A test that asserts the buggy behavior is a finding. A new test that depends on the clock, order, or shared mutable state and will flake is a finding. Do not mutate the worktree to check coverage.

### Dependencies

A new or upgraded dependency is a finding when a changed call site breaks under the new behavior, or the change replaces a safe API with string execution, eval, or an unpinned install that will not reproduce. A lockfile that no longer matches its manifest and will fail install is a finding. A bulk bump or a new package that overlaps a helper is not a finding on its own.

## Languages

### TypeScript and JavaScript

`==` against null or mixed types. `any` that lets an invalid payload through. Stale closure over a loop variable. Mutating a prop or an array during iteration. `this` lost in a callback. `parseInt` without a radix where the base changes the value. Server component using client state, or a client boundary that pulls a secret into the browser bundle.

React: hook after a conditional, effect missing a dependency and reading a stale prop, effect without cleanup for a subscription or timer, component defined inside a component, index used as the key when the list reorders, `useActionState` calling `setState` instead of returning state, `useFormStatus` in the same component as the form, optimistic update with no `onError` rollback, query key missing the parameter that selects the data, mutation that does not invalidate the query it changes.

Vue: destructuring `reactive()` and losing updates, async watcher with no cleanup, `computed` that writes, `v-if` and `v-for` on the same element, mutating a prop, object default in `withDefaults` shared across instances.

Angular: subscription with no teardown, route guard that fails open, `bypassSecurityTrust*` on user content, HTTP write with the error path treated as success.

Svelte and SvelteKit: destructuring `$state` and losing reactivity, `$derived` or `$effect` that writes tracked state, `$effect` with no cleanup, server `load` returning a private env var or a non-serializable value, form `fail()` returning a secret, browser global read during SSR, `{#each}` without a stable key when items reorder, CSRF disabled.

NestJS: `@Body() body: any`, `@ValidateNested()` without `@Type()`, `ValidationPipe` without `whitelist`, guard that fails open, `catch` that returns null on a write, scoped provider injected into a singleton so one request's data leaks into the next.

### Python, Django, FastAPI

Mutable default argument. Bare `except:`. Shared mutable class attribute. `is` used for value equality. File or session left open. Django `extra()` or `RawSQL` with interpolation, `mark_safe` on user text, `autoescape off`, relation accessed in a loop, serializer that writes fields the client should not set. FastAPI dependency that shares a session across requests, `async` route that calls blocking I/O, model that ignores extra input the handler then trusts.

### PHP

`==` in auth, token, or payment logic. `in_array` without strict compare. SQL concatenation. User input echoed into HTML. `md5` or `sha1` password. `unserialize` of untrusted data. `@` hiding an error. Upload path taken from the client filename.

### Ruby and Rails

`0`, `""`, or `[]` treated as missing. `Hash.new([])` shared default. Bang-method return used as the new value. Broad `rescue`. `send`, `constantize`, `eval`, or a SQL fragment from user input. `permit!`. `find(params[:id])` before the policy scope. `redirect_to` with `allow_other_host: true`. Job retry that repeats a payment or email. Transaction that performs an external call.

### Go

Ignored error. Goroutine with no way to stop. `context` not passed or not canceled. Loop variable captured by a goroutine on Go before 1.22. `defer` inside a loop holding a resource until the function returns. Write to a nil map. Error wrapped with `%v` where the caller uses `errors.Is` or `errors.As`.

### Rust

`unwrap` or `expect` on a production path. `unsafe` whose invariant does not hold for the caller's input. Blocking call in an async context. Mutex held across `.await`. Dropped future whose work was required. `map_err` that discards an error the caller matches on.

### Java and Kotlin

`Optional.get()` without a present check. N+1 from a lazy relation. `@Transactional` on a private or self-invoked method, so the boundary never runs. `SimpleDateFormat` shared across threads. `parallelStream` mutating a shared accumulator. HTTP client with no timeout on a call that can hang. Kotlin `GlobalScope`, a swallowed `CancellationException`, or a blocking call on the main dispatcher.

### C# and .NET

`async void` outside an event handler. `.Result` or `.Wait` on a context that can deadlock. Query inside a loop. String-interpolated SQL. Cancellation token dropped on a call the caller can cancel.

### Swift and Dart

Force-unwrap or `try!` on a value that can be nil. Closure that retains `self` and is stored by the owner. `@ObservedObject` for a model the view itself owns, so it resets. `Task` that is never cancelled. Flutter `!` or `as` silencing null safety, heavy work on the UI isolate, `Future` created in `build`, `setState` after `await` without `mounted`, controller not disposed, `ref.watch` inside a callback, provider `value` constructed in `build`.

### C and C++

Buffer overflow, user-controlled format string, signed overflow in a size, use-after-free, double free, missing null check after allocation, unbounded `strcpy` or `sprintf`. C++ object slicing, dangling reference or view, lock not tied to a scope, exception leaving a destructor, `shared_ptr` cycle.

### Zig

Allocation not freed on the error path, pointer to stack data returned to the caller, `unreachable` on input the caller can produce, unchecked cast of an external length, C pointer used without the length that was allocated.

### SQL

String-built query, missing `LIMIT` on a user-facing list, `NULL` compared with `=`, join that drops or duplicates rows, related writes with no transaction.

### CSS

File a finding when a rule hides content, matches the wrong control, or animates layout (`width`, `height`, `top`, `left`) on a screen this change owns and locks the main thread. `!important` and naming are not findings.

### Qt

Object deleted while a signal is still connected, lambda connection with no context so it outlives the receiver, GUI call off the GUI thread, model that does not notify the view after a change the user can see.

## Sources

- [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill) — language bug patterns, injection and authz, concurrency, and the universal failure modes (check-then-act, no-op writes, leaked resources).
- [addyosmani/agent-skills, code-review-and-quality](https://github.com/addyosmani/agent-skills/blob/main/skills/code-review-and-quality/SKILL.md) — correctness, readability, architecture, security, and performance searched together; structural remedies; test and dependency discipline.
- [mattpocock/skills, code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) — spec and standards as separate passes, with project rules overriding a smell baseline.
- [juliusbrussee/caveman, caveman-review](https://github.com/juliusbrussee/caveman/blob/main/skills/caveman-review/SKILL.md) — one concrete failure and one concrete fix, with a full explanation on security and architecture.
