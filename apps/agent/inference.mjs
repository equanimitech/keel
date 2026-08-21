// @ts-check
// The inference port — the one place this surface says what it needs from a
// model, and the one seam where a provider kind becomes an implementation.
//
// Why a port at all: keel's only inference call was ollama's request body,
// written inline at the call site. `endpoint`, `model` and `fetchImpl` looked
// like adapters but were test seams — nothing could be swapped, because the
// body itself was ollama-shaped. Harvest has to run on a machine with no 35B
// model on it, so the shape has to come out of the call site first.
//
// The constraint that gives the port its form: `apps/agent` is plain
// `// @ts-check` JS with **no imports outside this directory**. It deploys
// standalone and ships as a dependency-free Claude Code plugin. So the port is
// a JSDoc typedef and a factory function — no interface keyword, no class, no
// package. Dependency inversion with nothing but a closure.
//
// Prior art for the shape (read, not imported — another repo, another
// language): penceive's `InferenceProvider` trait and `provider_factory.rs`.

/** What a caller asks for. Provider-neutral by construction: every field here
 * has a meaning in any inference API, and anything that does not is the
 * adapter's business.
 *
 * @typedef {object} InferenceRequest
 * @property {string} prompt — the whole instruction; the port has no notion of
 *   system/user turns, because the caller does not need one yet.
 * @property {object} schema — JSON Schema the answer must satisfy. Constrained
 *   decoding is what makes a small answer reliable; a prompt asking for "JSON
 *   only" was measured to be ignored.
 * @property {number} [temperature] - sampling spread. Must be non-zero when the
 *   caller is voting, or the vote is theatre.
 * @property {number} [maxContextTokens] - cap on the context the provider sizes
 *   for this call. Load-bearing locally (uncapped, ollama sizes at the model's
 *   full window — measured at 41 GB and 47s for one call); a hosted provider
 *   may ignore it.
 */

/** The port. Four members, no more: anything wider would be one provider's
 * habits leaking back in.
 *
 * @typedef {object} InferenceProvider
 * @property {string} modelId — what answered, for the record written to the log.
 * @property {(req: InferenceRequest) => Promise<any>} complete — resolves with
 *   the **decoded answer**, already parsed and matching `schema`. No envelope,
 *   no wire format. Rejects with `Error("<provider> <status>")` when the
 *   provider refuses, and rejects when the answer will not parse.
 * @property {() => Promise<boolean>} available — can this provider answer right
 *   now? Never throws; a provider that cannot be reached is `false`, not an
 *   exception, because callers use this to decide whether to run at all.
 * @property {() => Promise<void>} release — give back whatever the call held.
 *   A local runtime unloads weights; a hosted one does nothing.
 */

// ── the ollama adapter ────────────────────────────────────────

/** Two hosts, deliberately as they were found: generation has always gone to
 * `localhost` and the reachability probe to `127.0.0.1`. Unifying them is a
 * behaviour change on a path that currently works, so it is a separate decision
 * from moving the shape behind a port. */
export const OLLAMA_GENERATE = "http://localhost:11434/api/generate";
export const OLLAMA_TAGS = "http://127.0.0.1:11434/api/tags";

/** The local adapter. Everything ollama-specific in this repo lives inside this
 * function: `stream`, `think`, `keep_alive`, `options.num_ctx`, `format`, and
 * the `{ response: "<json>" }` envelope.
 *
 * @param {{model?: string, endpoint?: string, tagsEndpoint?: string,
 *   keepAlive?: string | number, fetchImpl?: typeof fetch}} [opts]
 * @returns {InferenceProvider} */
export function ollamaProvider(opts = {}) {
  const {
    model, endpoint = OLLAMA_GENERATE, tagsEndpoint = OLLAMA_TAGS,
    keepAlive = "5m", fetchImpl = fetch,
  } = opts;
  // No default. Which model answers is the composition root's call, and an
  // unnamed model is a request a server would accept and answer wrongly.
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("ollamaProvider needs a model id");
  }

  /** @param {any} body */
  const post = (body) => fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    modelId: model,

    async complete({ prompt, schema, temperature, maxContextTokens }) {
      const res = await post({
        model,
        prompt,
        stream: false,
        think: false,
        keep_alive: keepAlive,
        options: { num_ctx: maxContextTokens, temperature },
        format: schema,
      });
      if (!res.ok) {
        throw new Error(`ollama ${res.status}`);
      }
      const body = await res.json();
      return JSON.parse(body.response);
    },

    async available() {
      try {
        const res = await fetchImpl(tagsEndpoint);
        return res.ok;
      } catch {
        return false;
      }
    },

    async release() {
      await post({ model, keep_alive: 0 });
    },
  };
}

// ── the seam ──────────────────────────────────────────────────

/** Build the provider a spec names. This is the single place a kind maps to an
 * implementation; call sites depend on the port, never on a concrete provider.
 * Adding one means a new branch here plus a new adapter above, and nothing
 * downstream changes.
 *
 * Only `ollama` is written. A kind nobody has implemented fails loudly at
 * construction rather than silently falling back to the local model, which on a
 * machine without one would look like "the server is down".
 *
 * @param {{kind?: string} & Record<string, any>} [spec]
 * @returns {InferenceProvider} */
export function createProvider(spec = {}) {
  const { kind = "ollama", ...options } = spec;
  if (kind === "ollama") {
    return ollamaProvider(options);
  }
  throw new Error(`inference provider "${kind}" is not implemented`);
}
