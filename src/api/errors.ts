/** Mirrors the Android error string resources and the live backend contract:
 *  403 for a missing/expired token (not 401), 422 for field validation. */
export type ApiErrorKind =
  | "unauthenticated"
  | "validation"
  | "notFound"
  | "server"
  | "network"
  | "timeout"
  | "decoding"
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly fields: Record<string, string[]>;
  readonly status: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status = 0,
    fields: Record<string, string[]> = {},
  ) {
    super(message || defaultMessage(kind));
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.fields = fields;
  }

  /** True when the server's message is an implementation detail (a PHP notice, a
   *  missing route, a stack frame) rather than something written for people. */
  get isTechnical(): boolean {
    return /undefined (array key|index|offset|variable|property)|array key|exception|sqlstate|stack trace|call to (a )?(member|undefined)|route .* could not be found|method is not supported|\.php|symfony|laravel|syntax error|null given/i.test(this.message);
  }

  /** The server could not perform the action at all (missing route, crash), as
   *  opposed to rejecting what the user entered. */
  get isServiceFault(): boolean {
    return this.kind === "server" || this.kind === "notFound" || this.isTechnical;
  }

  /** First validation message for a field, for inline form errors. */
  fieldError(field: string): string | undefined {
    return this.fields[field]?.[0];
  }
}

function defaultMessage(kind: ApiErrorKind): string {
  switch (kind) {
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    case "notFound":
      return "Not found.";
    case "server":
      return "Something went wrong on our end.";
    case "network":
      return "No internet connection. Please try again.";
    case "timeout":
      return "The server is taking too long to respond. Please try again.";
    case "decoding":
      return "Unexpected response from the server.";
    default:
      return "Something went wrong.";
  }
}
