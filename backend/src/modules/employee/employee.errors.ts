// Only controlled errors in this class may expose their message to HTTP clients.
export class EmployeeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EmployeeApiError";
  }
}
