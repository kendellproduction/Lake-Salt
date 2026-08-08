'use strict';

class FakeTimestamp {
  constructor(date) { this.date = new Date(date); }
  toDate() { return new Date(this.date); }
  toMillis() { return this.date.getTime(); }
  static fromDate(date) { return new FakeTimestamp(date); }
}

const DELETE = Symbol('delete');
const SERVER_TIME = Symbol('server-time');
const increment = amount => ({ __increment: amount });

function clone(value) {
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.toDate());
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

function materialize(value, previous) {
  if (value === SERVER_TIME) return FakeTimestamp.fromDate(new Date());
  if (value === DELETE) return DELETE;
  if (value && typeof value === 'object' && '__increment' in value) return Number(previous || 0) + value.__increment;
  if (Array.isArray(value)) return value.map(v => materialize(v));
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof FakeTimestamp)) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const resolved = materialize(child, previous && previous[key]);
      if (resolved !== DELETE) out[key] = resolved;
    }
    return out;
  }
  return clone(value);
}

class FakeDocumentSnapshot {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.exists = value !== undefined; this.value = value; }
  data() { return this.exists ? clone(this.value) : undefined; }
}

class FakeDocumentReference {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  async get() { return new FakeDocumentSnapshot(this, this.db.store.get(this.path)); }
  async set(data, options) { this.db.write(this.path, data, options); }
  async update(data) {
    if (!this.db.store.has(this.path)) throw new Error('not-found');
    this.db.write(this.path, data, { merge: true });
  }
  collection(name) { return new FakeCollectionReference(this.db, `${this.path}/${name}`); }
}

class FakeQuery {
  constructor(collection, filters = []) { this.collectionRef = collection; this.filters = filters; }
  where(field, operator, value) { return new FakeQuery(this.collectionRef, [...this.filters, { field, operator, value }]); }
  async get() {
    const docs = [];
    const prefix = `${this.collectionRef.path}/`;
    for (const [path, data] of this.collectionRef.db.store.entries()) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      const matches = this.filters.every(filter => filter.operator === '==' ? data[filter.field] === filter.value
        : filter.operator === 'in' ? filter.value.includes(data[filter.field]) : false);
      if (matches) docs.push(new FakeDocumentSnapshot(new FakeDocumentReference(this.collectionRef.db, path), data));
    }
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class FakeCollectionReference extends FakeQuery {
  constructor(db, path) { super(null); this.db = db; this.path = path; this.collectionRef = this; }
  doc(id = `auto_${this.db.nextId++}`) { return new FakeDocumentReference(this.db, `${this.path}/${id}`); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}

class FakeFirestore {
  constructor() { this.store = new Map(); this.nextId = 1; }
  collection(name) { return new FakeCollectionReference(this, name); }
  write(path, data, options = {}) {
    const prior = this.store.get(path);
    const resolved = materialize(data, prior);
    this.store.set(path, options.merge && prior ? { ...prior, ...resolved } : resolved);
  }
  async runTransaction(callback) {
    const transaction = {
      get: ref => ref.get(),
      set: (ref, data, options) => { this.write(ref.path, data, options); return transaction; },
      create: (ref, data) => { if (this.store.has(ref.path)) throw new Error('already-exists'); this.write(ref.path, data); return transaction; },
      update: (ref, data) => { if (!this.store.has(ref.path)) throw new Error('not-found'); this.write(ref.path, data, { merge: true }); return transaction; }
    };
    return callback(transaction);
  }
}

const fakeAdmin = {
  firestore: {
    Timestamp: FakeTimestamp,
    FieldValue: {
      serverTimestamp: () => SERVER_TIME,
      delete: () => DELETE,
      increment
    }
  }
};

module.exports = { FakeFirestore, FakeTimestamp, fakeAdmin };
