export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'Anda tidak berhak melakukan aksi ini') =>
  new AppError(403, 'FORBIDDEN', message);
