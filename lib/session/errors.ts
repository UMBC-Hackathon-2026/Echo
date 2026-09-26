import "server-only";
import type { SessionPhase } from "@/lib/contracts";

/** Owner token missing/wrong, or session/attempt not found. Maps to 404. */
export class NotFoundError extends Error {
  readonly kind = "not_found" as const;
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Disallowed transition or revision mismatch. Maps to 409; carries current state. */
export class ConflictError extends Error {
  readonly kind = "conflict" as const;
  constructor(
    public readonly phase: SessionPhase,
    public readonly revision: number,
    message = "conflict",
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Same idempotency key with a different request body. Maps to 422. */
export class IdempotencyMismatchError extends Error {
  readonly kind = "idempotency_mismatch" as const;
  constructor(message = "idempotency key reused with a different body") {
    super(message);
    this.name = "IdempotencyMismatchError";
  }
}

/** Input outside the allowed limits (length, turn cap). Maps to 422. */
export class InvalidInputError extends Error {
  readonly kind = "invalid_input" as const;
  constructor(message = "invalid input") {
    super(message);
    this.name = "InvalidInputError";
  }
}
