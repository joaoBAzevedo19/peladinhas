// Turns database/network errors into short messages for the interface.
import { OVERALL } from '../config.js';

export class AppError extends Error {}

export function friendlyError(error) {
  if (error instanceof AppError) return error;
  const code = error?.code;
  const message = error?.message || '';

  if (code === '23505') {
    return new AppError(/seasons/.test(message) ? 'Já existe uma época com esse nome.' : 'Já existe um jogador com esse nome.');
  }
  // Table or function missing: the app is newer than the database.
  if (code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST202' || code === '42P01' || code === '42703') {
    return new AppError(
      'A base de dados ainda não está atualizada para esta funcionalidade. ' +
        'O administrador tem de correr o supabase/schema.sql no SQL Editor do Supabase.',
    );
  }
  if (code === '42501') {
    // Messages raised by our own SQL functions are already in Portuguese.
    return new AppError(message.startsWith('Sem permissão')
      ? message
      : 'Sem permissão. Entra como administrador em Gerir.');
  }
  if (code === '23514' && /players_overall_check/.test(message)) {
    return new AppError(`O overall tem de estar entre ${OVERALL.min} e ${OVERALL.max}.`);
  }
  if (code === '23514' || code === 'P0002') return new AppError(message);
  if (/invalid login credentials/i.test(message)) return new AppError('Email ou palavra-passe incorretos.');
  if (error?.status === 429 || /rate limit/i.test(message)) {
    return new AppError('Demasiadas tentativas. Espera uns minutos e tenta novamente.');
  }
  if (/email not confirmed/i.test(message)) return new AppError('Este email ainda não foi confirmado no Supabase.');
  if (error instanceof TypeError || /failed to fetch|network|load failed/i.test(message)) {
    return new AppError('Sem ligação ao servidor. Verifica a internet e tenta novamente.');
  }
  return new AppError(message || 'Ocorreu um erro inesperado.');
}
