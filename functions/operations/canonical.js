'use strict';

const crypto = require('node:crypto');

function canonicalize(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('cannot canonicalize invalid Date');
    return JSON.stringify({ $date: value.toISOString() });
  }
  if (value && typeof value.toMillis === 'function') {
    if (Number.isSafeInteger(value.seconds) && Number.isSafeInteger(value.nanoseconds)) {
      return JSON.stringify({ $timestamp: { nanoseconds: value.nanoseconds, seconds: value.seconds } });
    }
    const millis = value.toMillis(); if (!Number.isFinite(millis)) throw new TypeError('cannot canonicalize invalid Timestamp');
    return JSON.stringify({ $timestampMillis: millis });
  }
  if (value && typeof value.toDate === 'function') return canonicalize(value.toDate());
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') throw new TypeError('cannot canonicalize unsupported value');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('cannot canonicalize non-finite number');
  if (Object.is(value, -0)) return '0';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('cannot canonicalize non-plain object');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : canonicalize(value));
  return crypto.createHash('sha256').update(input).digest('hex');
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

module.exports = { canonicalize, deepFreeze, sha256 };
