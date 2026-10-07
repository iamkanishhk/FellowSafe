export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(code: string, message: string) {
    return new HttpError(400, code, message);
  }

  static unauthorized(code: string, message: string) {
    return new HttpError(401, code, message);
  }

  static forbidden(code: string, message: string) {
    return new HttpError(403, code, message);
  }

  /**
   * 404 rather than 403 for anything session-scoped: a 403 confirms the SOS
   * session exists, which is itself information the caller is not entitled to.
   */
  static notFound(code: string, message: string) {
    return new HttpError(404, code, message);
  }
}
