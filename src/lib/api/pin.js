// PIN format check shared by both backends, so they give the same message.
import { PIN_LENGTH } from '../config.js';
import { AppError } from './errors.js';

export function isValidPin(pin) {
  return typeof pin === 'string' && pin.length === PIN_LENGTH && /^[0-9]+$/.test(pin);
}

export function checkPin(pin) {
  if (!isValidPin(pin)) throw new AppError(`O PIN tem de ter ${PIN_LENGTH} algarismos.`);
}
