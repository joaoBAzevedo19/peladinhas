// Turns database/network errors into short messages for the interface.
export class AppError extends Error {}

export function friendlyError(error) {
  if (error instanceof AppError) return error;
  const code = error?.code;
  const message = error?.message || '';

  if (code === '23505') return new AppError('Já existe um jogador com esse nome.');
  if (code === '42501') {
    // Messages raised by our own SQL functions are already in Portuguese.
    return new AppError(message.startsWith('Sem permissão')
      ? message
      : 'Sem permissão. Entra como administrador em Gerir.');
  }
  if (code === '23514' || code === 'P0002') return new AppError(message);
  if (/invalid login credentials/i.test(message)) return new AppError('Email ou palavra-passe incorretos.');
  if (/email not confirmed/i.test(message)) return new AppError('Este email ainda não foi confirmado no Supabase.');
  if (error instanceof TypeError || /failed to fetch|network|load failed/i.test(message)) {
    return new AppError('Sem ligação ao servidor. Verifica a internet e tenta novamente.');
  }
  return new AppError(message || 'Ocorreu um erro inesperado.');
}
