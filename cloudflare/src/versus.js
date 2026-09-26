// ===============================================================
// versus.js
// 対戦モードの共有状態を持つ Durable Object。
//
// GAS 版は CacheService（6時間 TTL）＋ LockService で部屋を管理していた。
// ここでは JukenVersus.gs をそのまま動かし、CacheService の代わりに
// この Durable Object の SQLite を渡す。Durable Object は要求を1件ずつ
// 同期的に処理するので、GAS 版でロックしていた読み書きもそのまま安全になる。
// 部屋は全部この1つのインスタンス（名前 "hub"）に入る。
// ===============================================================

import { DurableObject } from 'cloudflare:workers';
import * as gas from './generated/gas.js';

// 画面から呼べる対戦の関数
export const VS_FUNCTIONS = [
  'vsCreateRoom', 'vsJoinRoom', 'vsFetchQuestions', 'vsSync',
  'vsReportCorrect', 'vsReportTimeout', 'vsLeaveRoom'
];

const SWEEP_MS = 60 * 60 * 1000;   // 期限切れの部屋を掃除する間隔

export class VersusHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)');

    // CacheService.getScriptCache() と同じ形（get / put / remove）
    const sql = this.sql;
    this.cache = {
      get(k) {
        const row = sql.exec('SELECT v FROM cache WHERE k = ? AND exp > ?', k, Date.now()).toArray()[0];
        return row ? row.v : null;
      },
      put(k, v, ttlSec) {
        sql.exec('INSERT OR REPLACE INTO cache (k, v, exp) VALUES (?, ?, ?)',
                 k, String(v), Date.now() + (Number(ttlSec) || 600) * 1000);
      },
      remove(k) { sql.exec('DELETE FROM cache WHERE k = ?', k); }
    };
  }

  // Worker から { fn, args } を受け取って、JukenVersus.gs の関数を呼ぶ
  async run(fn, args) {
    if (!VS_FUNCTIONS.includes(fn)) throw new Error('unknown function: ' + fn);
    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    }
    gas.useCache(this.cache);
    return gas[fn](...args);
  }

  async alarm() {
    this.sql.exec('DELETE FROM cache WHERE exp <= ?', Date.now());
    const left = this.sql.exec('SELECT COUNT(*) AS n FROM cache').one().n;
    if (left) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
  }
}
