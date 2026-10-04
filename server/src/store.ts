// Accounts and rank points, in SQLite (node:sqlite, built into Node 22).
// Accounts are guest accounts for now: the client keeps a random token.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Account {
  token: string;
  name: string;
  points: number;
  games: number;
}

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        token TEXT PRIMARY KEY, name TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL, seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, format TEXT NOT NULL, started INTEGER NOT NULL,
        finished INTEGER, result TEXT);`);
  }

  /** The account for a token (a new one when the token is unknown or missing). */
  login(token: string | undefined, name: string): Account {
    const now = Date.now();
    if (token && /^[a-f0-9]{32}$/.test(token)) {
      const row = this.db.prepare('SELECT token, name, points, games FROM players WHERE token = ?').get(token) as Account | undefined;
      if (row) {
        this.db.prepare('UPDATE players SET name = ?, seen = ? WHERE token = ?').run(name, now, token);
        return { ...row, name };
      }
    }
    const fresh = randomBytes(16).toString('hex');
    this.db.prepare('INSERT INTO players (token, name, created, seen) VALUES (?, ?, ?, ?)').run(fresh, name, now, now);
    return { token: fresh, name, points: 0, games: 0 };
  }

  /** Adds a game's rank points (never below zero); returns the new totals. */
  addResult(token: string, delta: number): Account {
    this.db.prepare('UPDATE players SET points = MAX(0, points + ?), games = games + 1 WHERE token = ?').run(Math.round(delta), token);
    return this.db.prepare('SELECT token, name, points, games FROM players WHERE token = ?').get(token) as unknown as Account;
  }

  gameStarted(id: string, format: string) {
    this.db.prepare('INSERT INTO games (id, format, started) VALUES (?, ?, ?)').run(id, format, Date.now());
  }

  gameFinished(id: string, result: unknown) {
    this.db.prepare('UPDATE games SET finished = ?, result = ? WHERE id = ?').run(Date.now(), JSON.stringify(result), id);
  }
}
