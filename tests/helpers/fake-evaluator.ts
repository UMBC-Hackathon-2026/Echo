import type { Evaluator, EvaluateArgs, EvaluationResult } from "@/lib/evaluator/evaluator";

/**
 * TEST-ONLY scriptable evaluator. Lives under tests/ so no production module can
 * import it (enforced by tests/evaluator/fake-isolation.test.ts). Each evaluate()
 * returns the next scripted result and counts the call.
 */
export class FakeEvaluator implements Evaluator {
  calls = 0;
  lastArgs: EvaluateArgs | null = null;
  /** Runs inside evaluate() before returning — used to simulate a concurrent change. */
  onEvaluate?: (args: EvaluateArgs) => Promise<void> | void;
  private readonly queue: EvaluationResult[];
  private readonly fallback?: EvaluationResult;

  constructor(script: EvaluationResult[] = [], fallback?: EvaluationResult) {
    this.queue = [...script];
    this.fallback = fallback;
  }

  push(result: EvaluationResult): this {
    this.queue.push(result);
    return this;
  }

  async evaluate(args: EvaluateArgs): Promise<EvaluationResult> {
    this.calls++;
    this.lastArgs = args;
    if (this.onEvaluate) await this.onEvaluate(args);
    const next = this.queue.shift() ?? this.fallback;
    if (!next) throw new Error("FakeEvaluator: no scripted result for this call");
    return next;
  }
}
