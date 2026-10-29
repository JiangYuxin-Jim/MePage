const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, "site.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS documents (kind TEXT,id TEXT,value TEXT NOT NULL,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY,visitor TEXT,ip TEXT,day TEXT,status TEXT,tokens INTEGER DEFAULT 0,created INTEGER);
 CREATE INDEX IF NOT EXISTS calls_day ON calls(day);
 CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY,count INTEGER,expires INTEGER);
 CREATE TABLE IF NOT EXISTS media (name TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL);
 PRAGMA user_version=2;`);
  db.prepare(
    "UPDATE calls SET status='interrupted' WHERE status='pending'",
  ).run();
  const s = {
    db,
    close: () => db.close(),
    transaction(fn) {
      if (db.isTransaction) return fn();
      db.exec("BEGIN IMMEDIATE");
      try { const result = fn(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    saveImage(name, mime, data) {
      db.prepare("INSERT INTO media VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET mime=excluded.mime,data=excluded.data").run(name,mime,data);
    },
    image(name) { return db.prepare("SELECT mime,data FROM media WHERE name=?").get(name) || null; },
    images() { return db.prepare("SELECT name,mime,data FROM media ORDER BY name").all(); },
    meta(k, v) {
      if (v === undefined)
        return db.prepare("SELECT value FROM meta WHERE key=?").get(k)?.value;
      db.prepare(
        "INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(k, v);
    },
    list(kind) {
      return db
        .prepare("SELECT id,value FROM documents WHERE kind=? ORDER BY rowid")
        .all(kind)
        .map((r) => ({ id: r.id, ...JSON.parse(r.value) }));
    },
    get(kind, id) {
      const r = db
        .prepare("SELECT value FROM documents WHERE kind=? AND id=?")
        .get(kind, id);
      return r ? { id, ...JSON.parse(r.value) } : null;
    },
    put(kind, id, value) {
      db.prepare(
        "INSERT INTO documents VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      ).run(kind, id, JSON.stringify(value));
    },
    remove(kind, id) {
      db.prepare("DELETE FROM documents WHERE kind=? AND id=?").run(kind, id);
    },
    session(id, value, expires) {
      db.prepare("INSERT OR REPLACE INTO sessions VALUES(?,?,?)").run(
        id,
        JSON.stringify(value),
        expires,
      );
    },
    getSession(id) {
      const r = db
        .prepare("SELECT value FROM sessions WHERE id=? AND expires>?")
        .get(id, Date.now());
      return r ? JSON.parse(r.value) : null;
    },
    deleteSession(id) {
      db.prepare("DELETE FROM sessions WHERE id=?").run(id);
    },
    rate(key, max, ms) {
      const now = Date.now();
      const r = db
        .prepare("SELECT count,expires FROM rates WHERE key=?")
        .get(key);
      if (!r || r.expires <= now) {
        db.prepare("INSERT OR REPLACE INTO rates VALUES(?,1,?)").run(
          key,
          now + ms,
        );
        return true;
      }
      if (r.count >= max) return false;
      db.prepare("UPDATE rates SET count=count+1 WHERE key=?").run(key);
      return true;
    },
    usage(day, visitor, ip) {
      return {
        site: Number(
          db.prepare("SELECT count(*) n FROM calls WHERE day=?").get(day).n,
        ),
        visitor: visitor
          ? Number(
              db
                .prepare(
                  "SELECT count(*) n FROM calls WHERE day=? AND visitor=?",
                )
                .get(day, visitor).n,
            )
          : 0,
        ip: ip
          ? Number(
              db
                .prepare("SELECT count(*) n FROM calls WHERE day=? AND ip=?")
                .get(day, ip).n,
            )
          : 0,
        tokens: Number(
          db
            .prepare("SELECT coalesce(sum(tokens),0) n FROM calls WHERE day=?")
            .get(day).n,
        ),
      };
    },
    reserve(visitor, ip, day, limits) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const u = s.usage(day, visitor, ip);
        const pending = db
          .prepare("SELECT visitor FROM calls WHERE status='pending'")
          .all();
        if (
          u.site >= limits.siteDaily ||
          u.visitor >= limits.visitorDaily ||
          u.ip >= limits.ipDaily ||
          pending.length >= limits.concurrent ||
          pending.some((r) => r.visitor === visitor)
        )
          throw Object.assign(
            new Error("今日额度已用完，或已有问题正在回答，请稍后再试。"),
            { status: 429 },
          );
        const id = randomUUID();
        db.prepare(
          "INSERT INTO calls(id,visitor,ip,day,status,created) VALUES(?,?,?,?,'pending',?)",
        ).run(id, visitor, ip, day, Date.now());
        db.exec("COMMIT");
        return {
          id,
          remaining: Math.max(
            0,
            Math.min(
              limits.visitorDaily - u.visitor - 1,
              limits.ipDaily - u.ip - 1,
              limits.siteDaily - u.site - 1,
            ),
          ),
        };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    finish(id, { status = "ok", tokens = 0 } = {}) {
      db.prepare("UPDATE calls SET status=?,tokens=? WHERE id=?").run(
        status,
        Number.isSafeInteger(tokens) && tokens > 0 ? tokens : 0,
        id,
      );
    },
    cleanup() {
      const now = Date.now();
      db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
      db.prepare("DELETE FROM rates WHERE expires<?").run(now);
      db.prepare("DELETE FROM calls WHERE created<?").run(now - 30 * 86400000);
    },
  };
  return s;
}
function siteDay(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
module.exports = { createStore, siteDay };
