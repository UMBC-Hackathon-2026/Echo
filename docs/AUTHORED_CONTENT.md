# Phase 1 authored content inventory

This inventory lists the exact authored content for team review. Source documents in `docs/source/` are unchanged. Rubric criteria, probes, question pairs, and criterion prerequisites retain their specified values. Examples are authored prompt material, not measured model outputs or held-out validation results.

## Few-shot evaluator examples

| Example ID | Expected state | Student explanation | Reason |
| --- | --- | --- | --- |
| recursive_call.not_taught | not_taught | The function never calls itself; a for loop does all the repetition. | Explicitly denies the self-call required by this concept. |
| recursive_call.partially_taught | partially_taught | The operation repeats until the task is done. | Describes repetition without identifying a self-call. |
| recursive_call.demonstrated | demonstrated | Inside its own body, solve calls solve again. | Explicitly identifies the function calling itself from its body. |
| smaller_subproblem.not_taught | not_taught | Every new call receives exactly the same input as the previous call. | No smaller instance is described; the input is unchanged. |
| smaller_subproblem.partially_taught | partially_taught | Each call deals with a simpler problem. | Calls the problem simpler without specifying how the input changes. |
| smaller_subproblem.demonstrated | demonstrated | For an integer n above one, the next call receives Math.floor(n / 2). | Specifies a concrete reduction of the input on each call. |
| base_case.not_taught | not_taught | There is no stopping branch; it just keeps calling itself. | Explicitly denies the stopping branch. |
| base_case.partially_taught | partially_taught | It has to stop at some point. | Mentions stopping but supplies no condition or behavior there. |
| base_case.demonstrated | demonstrated | When remaining equals one, return one immediately without another call. | Names a specific stopping condition and what is returned there. |
| progress_toward_base_case.not_taught | not_taught | Starting from a positive n, adding one on every call will eventually reach zero. | The claimed change moves away from the proposed stopping condition. |
| progress_toward_base_case.partially_taught | partially_taught | The input changes, and there is a stopping condition. | States the two ideas without connecting the change to reaching the stop. |
| progress_toward_base_case.demonstrated | demonstrated | Starting with an integer above one, floor-halving makes it smaller each time until it reaches the stopping value one. | Connects a strictly decreasing positive integer input to the stated stopping value. |
| return_path.not_taught | not_taught | Earlier calls never receive any value from later calls. | Denies the return of results to waiting callers. |
| return_path.partially_taught | partially_taught | The calls return something. | Mentions returning without explaining order or how the result is used. |
| return_path.demonstrated | demonstrated | When the inner call returns, the waiting outer call uses that value to finish its own result, then returns that result to its caller. | Explains how returned values let earlier calls finish and propagate their results. |

## Question wording, keys, and fragments

`rec.A.P1` is the fully specified source example and is reproduced unchanged. Every other question follows its shape and the matched-pair table. Each authored fragment is listed with its actual prerequisites. Shared source-derived text is repeated here for complete review. Hedge fragments express uncertainty; they do not supply the stopping condition. Criteria are scored in Phase 2, not in this content scaffold.

### rec.A.P1

Origin: fully specified source example; unchanged.

Prompt: Why does countdown(3) eventually stop?

Assumptions: n is a nonnegative integer

```ts
function countdown(n) {
  if (n === 0) return;
  console.log(n);
  countdown(n - 1);
}
```

Answer key: When n reaches 0 the function returns without recursing. Each call passes n - 1, so starting from a nonnegative integer, n always reaches 0.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Names the stopping condition n === 0 | base_case |
| c2 | Explains that n - 1 on each call must reach 0 | smaller_subproblem, progress_toward_base_case |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| ctx.smaller | context | smaller_subproblem >= demonstrated | Each call uses a smaller n. |
| f.c2 | fact | smaller_subproblem >= demonstrated, progress_toward_base_case >= demonstrated; criterion c2 must be earned | Taking 1 away each time means n has to reach 0 eventually. |
| f.c1 | fact | base_case >= demonstrated; criterion c1 must be earned | When n is 0, the if-check returns without calling again, so it stops. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think it has to stop somewhere, but I am not sure where. |
| m.forever | misconception | none; active recursion_runs_forever | Honestly, I thought a function that calls itself just keeps going forever. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| progress_toward_base_case | Explain why getting smaller guarantees it reaches that stopping condition. |
| smaller_subproblem | Explain what changes about the input on every call. |
| recursion_runs_forever | Your learner still believes self-calling functions never stop. Show it what makes this one stop. |

### rec.A.P2

Origin: authored expansion of the source matched-pair specification.

Prompt: What does factorial(3) return?

Assumptions: n is a nonnegative integer

```ts
function factorial(n) {
  if (n === 0) return 1;
  return n * factorial(n - 1);
}
```

Answer key: factorial(3) returns 6: it computes 3 * 2 * 1 * 1, where factorial(0) returns 1 as the base value and each call multiplies by the smaller result.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Names the base value returned at n === 0 (1) | base_case |
| c2 | Explains results combine on the way back up | return_path, recursive_call |
| c3 | Concludes the final value is 6 | base_case, return_path, recursive_call |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | base_case >= demonstrated; criterion c1 must be earned | At n = 0 it returns 1 without calling again. |
| f.c2 | fact | return_path >= demonstrated, recursive_call >= demonstrated; criterion c2 must be earned | Each call multiplies n by the value the smaller call returns. |
| f.c3 | fact | base_case >= demonstrated, return_path >= demonstrated, recursive_call >= demonstrated; criterion c3 must be earned | So factorial(3) is 3 * 2 * 1 * 1 = 6. |
| h.return | hedge | return_path >= partially_taught; exact state partially_taught | The calls return something, but I am not sure how they combine. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| return_path | Explain how each call's result comes back and is combined by the earlier call. |
| recursive_call | Point out where the function calls itself. |

### rec.A.P3

Origin: authored expansion of the source matched-pair specification.

Prompt: What happens when countdown(3) calls countdown(n + 1) instead?

Assumptions: n is a nonnegative integer

```ts
function countdown(n) {
  if (n === 0) return;
  console.log(n);
  countdown(n + 1);
}
```

Answer key: It never stops: n + 1 moves away from 0, so n === 0 is never true and the calls pile up until the stack overflows.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Explains n + 1 moves the input away from 0 | smaller_subproblem, progress_toward_base_case |
| c2 | Concludes the base case is never reached and the stack overflows | base_case, progress_toward_base_case |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | smaller_subproblem >= demonstrated, progress_toward_base_case >= demonstrated; criterion c1 must be earned | Adding 1 each time moves n away from 0, not toward it. |
| f.c2 | fact | base_case >= demonstrated, progress_toward_base_case >= demonstrated; criterion c2 must be earned | Since n never becomes 0, the stop condition is never hit and the stack overflows. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think there is meant to be a stopping point, but I am not sure it is reached. |
| m.forever | misconception | none; active recursion_runs_forever | Honestly, I thought a function that calls itself just keeps going forever. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| smaller_subproblem | Explain what changes about the input on every call. |
| progress_toward_base_case | Explain why getting smaller guarantees it reaches that stopping condition. |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| recursion_runs_forever | Your learner still believes self-calling functions never stop. Show it what makes this one stop. |

### rec.A.P4

Origin: authored expansion of the source matched-pair specification.

Prompt: How could listLength(xs) be written to count items recursively?

Assumptions: xs is a finite list

```ts
function listLength(xs) {
  if (xs.length === 0) return 0;
  return 1 + listLength(xs.slice(1));
}
```

Answer key: Return 0 for an empty list; otherwise return 1 + listLength(rest), so each call handles one fewer item until the list is empty.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Calls itself on the rest of the input | recursive_call, smaller_subproblem |
| c2 | Returns 0 for the empty input | base_case |
| c3 | Adds 1 to the count the smaller call returns | return_path |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | recursive_call >= demonstrated, smaller_subproblem >= demonstrated; criterion c1 must be earned | It calls itself on the list without the first item. |
| f.c2 | fact | base_case >= demonstrated; criterion c2 must be earned | An empty list returns 0. |
| f.c3 | fact | return_path >= demonstrated; criterion c3 must be earned | It adds 1 to whatever the shorter list returns. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think it has to stop somewhere, but I am not sure where. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| recursive_call | Point out where the function calls itself. |
| smaller_subproblem | Explain what changes about the input on every call. |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| return_path | Explain how each call's result comes back and is combined by the earlier call. |

### rec.B.P1

Origin: authored expansion of the source matched-pair specification.

Prompt: Why does printStars(3) eventually stop?

Assumptions: n is a nonnegative integer

```ts
function printStars(n) {
  if (n === 0) return;
  console.log('*');
  printStars(n - 1);
}
```

Answer key: When n reaches 0 the function returns without recursing. Each call passes n - 1, so starting from a nonnegative integer, n always reaches 0.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Names the stopping condition n === 0 | base_case |
| c2 | Explains that n - 1 on each call must reach 0 | smaller_subproblem, progress_toward_base_case |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| ctx.smaller | context | smaller_subproblem >= demonstrated | Each call uses a smaller n. |
| f.c2 | fact | smaller_subproblem >= demonstrated, progress_toward_base_case >= demonstrated; criterion c2 must be earned | Taking 1 away each time means n has to reach 0 eventually. |
| f.c1 | fact | base_case >= demonstrated; criterion c1 must be earned | When n is 0, the if-check returns without calling again, so it stops. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think it has to stop somewhere, but I am not sure where. |
| m.forever | misconception | none; active recursion_runs_forever | Honestly, I thought a function that calls itself just keeps going forever. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| progress_toward_base_case | Explain why getting smaller guarantees it reaches that stopping condition. |
| smaller_subproblem | Explain what changes about the input on every call. |
| recursion_runs_forever | Your learner still believes self-calling functions never stop. Show it what makes this one stop. |

### rec.B.P2

Origin: authored expansion of the source matched-pair specification.

Prompt: What does sumTo(3) return?

Assumptions: n is a nonnegative integer

```ts
function sumTo(n) {
  if (n === 0) return 0;
  return n + sumTo(n - 1);
}
```

Answer key: sumTo(3) returns 6: it computes 3 + 2 + 1 + 0, where sumTo(0) returns 0 as the base value and each call adds n to the smaller result.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Names the base value returned at n === 0 (0) | base_case |
| c2 | Explains results combine on the way back up | return_path, recursive_call |
| c3 | Concludes the final value is 6 | base_case, return_path, recursive_call |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | base_case >= demonstrated; criterion c1 must be earned | At n = 0 it returns 0 without calling again. |
| f.c2 | fact | return_path >= demonstrated, recursive_call >= demonstrated; criterion c2 must be earned | Each call adds n to the value the smaller call returns. |
| f.c3 | fact | base_case >= demonstrated, return_path >= demonstrated, recursive_call >= demonstrated; criterion c3 must be earned | So sumTo(3) is 3 + 2 + 1 + 0 = 6. |
| h.return | hedge | return_path >= partially_taught; exact state partially_taught | The calls return something, but I am not sure how they combine. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| return_path | Explain how each call's result comes back and is combined by the earlier call. |
| recursive_call | Point out where the function calls itself. |

### rec.B.P3

Origin: authored expansion of the source matched-pair specification.

Prompt: What happens when sumTo(3) calls sumTo(n + 1) instead?

Assumptions: n is a nonnegative integer

```ts
function sumTo(n) {
  if (n === 0) return 0;
  return n + sumTo(n + 1);
}
```

Answer key: It never stops: n + 1 moves away from 0, so n === 0 is never true and the calls pile up until the stack overflows.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Explains n + 1 moves the input away from 0 | smaller_subproblem, progress_toward_base_case |
| c2 | Concludes the base case is never reached and the stack overflows | base_case, progress_toward_base_case |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | smaller_subproblem >= demonstrated, progress_toward_base_case >= demonstrated; criterion c1 must be earned | Adding 1 each time moves n away from 0, not toward it. |
| f.c2 | fact | base_case >= demonstrated, progress_toward_base_case >= demonstrated; criterion c2 must be earned | Since n never becomes 0, the stop condition is never hit and the stack overflows. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think there is meant to be a stopping point, but I am not sure it is reached. |
| m.forever | misconception | none; active recursion_runs_forever | Honestly, I thought a function that calls itself just keeps going forever. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| smaller_subproblem | Explain what changes about the input on every call. |
| progress_toward_base_case | Explain why getting smaller guarantees it reaches that stopping condition. |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| recursion_runs_forever | Your learner still believes self-calling functions never stop. Show it what makes this one stop. |

### rec.B.P4

Origin: authored expansion of the source matched-pair specification.

Prompt: How could countChars(s) be written to count characters recursively?

Assumptions: s is a finite string

```ts
function countChars(s) {
  if (s.length === 0) return 0;
  return 1 + countChars(s.slice(1));
}
```

Answer key: Return 0 for an empty string; otherwise return 1 + countChars(rest), so each call handles one fewer character until the string is empty.

| Criterion | Text | Requires |
| --- | --- | --- |
| c1 | Calls itself on the rest of the input | recursive_call, smaller_subproblem |
| c2 | Returns 0 for the empty input | base_case |
| c3 | Adds 1 to the count the smaller call returns | return_path |

| Fragment | Kind | Prerequisites / trigger | Text |
| --- | --- | --- | --- |
| f.c1 | fact | recursive_call >= demonstrated, smaller_subproblem >= demonstrated; criterion c1 must be earned | It calls itself on the string without the first character. |
| f.c2 | fact | base_case >= demonstrated; criterion c2 must be earned | An empty string returns 0. |
| f.c3 | fact | return_path >= demonstrated; criterion c3 must be earned | It adds 1 to whatever the shorter string returns. |
| h.base | hedge | base_case >= partially_taught; exact state partially_taught | I think it has to stop somewhere, but I am not sure where. |
| u | uncertain | none; only if no other fragment selected | I am not sure. I do not think you have told me about that yet. |

| Remediation key | Next step |
| --- | --- |
| recursive_call | Point out where the function calls itself. |
| smaller_subproblem | Explain what changes about the input on every call. |
| base_case | Tell your learner the exact condition where the function stops calling itself. |
| return_path | Explain how each call's result comes back and is combined by the earlier call. |

## Version and review notes

- Rubric version: `1.0.1`.
- Form version: `1.0.1+fd846dc9f057`.
- Full SHA-256: `fd846dc9f057890331e98b0774f095457c263c7ca7bc18c7f0c42c59cb098c26`.
- The hash now includes rubric text/examples and complete seeded-misconception metadata, in addition to both question banks.
- P4 h.base in both forms now uses the source P1 generic uncertainty wording; the previous authored wording disclosed the empty-input condition.
- No source-file content or required concept/criterion set was changed.
- No Gemini evaluation, provenance validator, assessment gate, or persistence wiring was implemented in this phase.
