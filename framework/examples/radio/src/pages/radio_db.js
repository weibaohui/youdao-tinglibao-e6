import process from 'process';

const DB_PATH = '/userdisk/radio.db';

function escapeSql(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''");
}

// 串行队列：确保在 QuickJS 嵌入式环境中同一时刻只有一个 sqlite3 子进程在读写，
// 彻底杜绝 stdout 管道截断与 SyntaxError: unexpected end of string 问题
let queryQueue = Promise.resolve();
function enqueue(fn) {
  const next = queryQueue.then(fn, fn);
  queryQueue = next;
  return next;
}

export default {
  dbPath: DB_PATH,

  async queryJson(sql, timeout = 3000) {
    return enqueue(async () => {
      try {
        const res = await process.exec('sqlite3', ['-json', DB_PATH, sql], { timeout });
        if (res && res.code === 0 && res.stdout) {
          const out = res.stdout.trim();
          if (out) return JSON.parse(out);
        }
      } catch (e) {
        console.warn('[radio_db] queryJson error:', sql, e);
      }
      return [];
    });
  },

  async queryScalar(sql, timeout = 3000) {
    return enqueue(async () => {
      try {
        const res = await process.exec('sqlite3', [DB_PATH, sql], { timeout });
        if (res && res.code === 0 && res.stdout) {
          return res.stdout.trim();
        }
      } catch (e) {
        console.warn('[radio_db] queryScalar error:', sql, e);
      }
      return '';
    });
  },

  async execSql(sql, timeout = 3000) {
    return enqueue(async () => {
      try {
        const res = await process.exec('sqlite3', [DB_PATH, sql], { timeout });
        return res && res.code === 0;
      } catch (e) {
        console.warn('[radio_db] execSql error:', sql, e);
        return false;
      }
    });
  },

  async ensureDatabase() {
    try {
      const check = await process.exec('test', ['-f', DB_PATH]);
      if (check && check.code === 0) return true;
      await process.exec('sh', [
        '-c',
        'find /userdata/miniapp /userdisk -name "radio.db" 2>/dev/null | grep -v "' + DB_PATH + '" | head -1 | xargs -I {} cp {} ' + DB_PATH
      ]);
      const check2 = await process.exec('test', ['-f', DB_PATH]);
      return check2 && check2.code === 0;
    } catch (e) {
      return false;
    }
  },

  async getCategories() {
    const provSql = "SELECT code, name, count FROM categories WHERE type='province' ORDER BY sort_order ASC;";
    const genreSql = "SELECT code, name, count FROM categories WHERE type='genre' ORDER BY sort_order ASC;";
    const intlGenreSql = "SELECT code, name, count FROM categories WHERE type='intl_genre' ORDER BY sort_order ASC;";

    const provinces = await this.queryJson(provSql);
    const genres = await this.queryJson(genreSql);
    const intlGenres = await this.queryJson(intlGenreSql);

    // 单条聚合 SQL，瞬间读取全库、国内、国际、收藏 4 项准确统计，省去 4 次进程 fork
    const countsStr = await this.queryScalar(
      "SELECT COUNT(*) || '|' || " +
      "SUM(CASE WHEN scope = 'cn' THEN 1 ELSE 0 END) || '|' || " +
      "SUM(CASE WHEN scope = 'intl' THEN 1 ELSE 0 END) || '|' || " +
      "SUM(CASE WHEN is_fav = 1 THEN 1 ELSE 0 END) " +
      "FROM stations WHERE status = 1;"
    );

    let all = 2105, cn = 1903, intl = 202, fav = 0;
    if (countsStr && countsStr.indexOf('|') !== -1) {
      const p = countsStr.split('|');
      all = parseInt(p[0], 10) || 2105;
      cn = parseInt(p[1], 10) || 1903;
      intl = parseInt(p[2], 10) || 202;
      fav = parseInt(p[3], 10) || 0;
    }

    return {
      provinces: provinces || [],
      genres: genres || [],
      intlGenres: intlGenres || [],
      counts: { all, cn, intl, fav }
    };
  },

  async getStations({ scope = 'all', genre = '全部', province = '全部', kw = '', limit = 5, offset = 0 } = {}) {
    const where = ['status = 1'];

    if (scope === 'fav') {
      where.push('is_fav = 1');
    } else if (scope === 'cn') {
      where.push("scope = 'cn'");
    } else if (scope === 'intl') {
      where.push("scope = 'intl'");
    }

    if (genre && genre !== '全部') {
      where.push("genre = '" + escapeSql(genre) + "'");
    }

    if (province && province !== '全部') {
      where.push("province = '" + escapeSql(province) + "'");
    }

    if (kw && kw.trim()) {
      const safe = escapeSql(kw.trim());
      where.push("(name LIKE '%" + safe + "%' OR city LIKE '%" + safe + "%' OR province LIKE '%" + safe + "%' OR genre LIKE '%" + safe + "%')");
    }

    const whereStr = where.join(' AND ');
    const countSql = 'SELECT COUNT(*) FROM stations WHERE ' + whereStr + ';';
    const querySql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
                     whereStr + ' ORDER BY id ASC LIMIT ' + limit + ' OFFSET ' + offset + ';';

    const totalStr = await this.queryScalar(countSql);
    const items = await this.queryJson(querySql);

    const total = parseInt(totalStr, 10) || 0;
    return {
      total,
      items: items || []
    };
  },

  async getNeighborStation(currentId, direction, filter = {}) {
    const cid = parseInt(currentId, 10) || 1;
    const where = ['status = 1'];
    if (filter.scope === 'fav') {
      where.push('is_fav = 1');
    } else if (filter.scope === 'cn') {
      where.push("scope = 'cn'");
    } else if (filter.scope === 'intl') {
      where.push("scope = 'intl'");
    }

    if (filter.genre && filter.genre !== '全部') {
      where.push("genre = '" + escapeSql(filter.genre) + "'");
    }
    if (filter.province && filter.province !== '全部') {
      where.push("province = '" + escapeSql(filter.province) + "'");
    }

    const whereStr = where.join(' AND ');
    if (direction > 0) {
      let sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
                whereStr + ' AND id > ' + cid + ' ORDER BY id ASC LIMIT 1;';
      let rows = await this.queryJson(sql);
      if (rows && rows.length > 0) return rows[0];
      sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
            whereStr + ' ORDER BY id ASC LIMIT 1;';
      rows = await this.queryJson(sql);
      return (rows && rows[0]) || null;
    } else {
      let sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
                whereStr + ' AND id < ' + cid + ' ORDER BY id DESC LIMIT 1;';
      let rows = await this.queryJson(sql);
      if (rows && rows.length > 0) return rows[0];
      sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
            whereStr + ' ORDER BY id DESC LIMIT 1;';
      rows = await this.queryJson(sql);
      return (rows && rows[0]) || null;
    }
  },

  // 随机切台：根据 randomScope ('cn', 'intl', 'all', 'fav') 从数据库随机拉取
  async getRandomStation(randomScope = 'cn', excludeId = 0) {
    const where = ['status = 1'];
    if (randomScope === 'cn') {
      where.push("scope = 'cn'");
    } else if (randomScope === 'intl') {
      where.push("scope = 'intl'");
    } else if (randomScope === 'fav') {
      where.push('is_fav = 1');
    }
    if (excludeId) {
      where.push('id != ' + parseInt(excludeId, 10));
    }

    const sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE ' +
                where.join(' AND ') + ' ORDER BY RANDOM() LIMIT 1;';
    const rows = await this.queryJson(sql);
    if (rows && rows.length > 0) return rows[0];

    // 兜底重试（防排除当前台后无结果）
    const fallbackSql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE status = 1 ORDER BY RANDOM() LIMIT 1;';
    const fb = await this.queryJson(fallbackSql);
    return (fb && fb[0]) || null;
  },

  async getStationById(id) {
    const num = parseInt(id, 10);
    if (isNaN(num)) return null;
    const sql = 'SELECT id, name, url, fmt, scope, province, city, genre, country, country_code, is_fav FROM stations WHERE id = ' + num + ' LIMIT 1;';
    const rows = await this.queryJson(sql);
    return (rows && rows[0]) || null;
  },

  async toggleFav(id) {
    const num = parseInt(id, 10);
    if (isNaN(num)) return false;
    const sql = 'UPDATE stations SET is_fav = CASE WHEN is_fav = 1 THEN 0 ELSE 1 END WHERE id = ' + num + ';';
    return await this.execSql(sql);
  },

  async getFavCount() {
    const countStr = await this.queryScalar('SELECT COUNT(*) FROM stations WHERE is_fav = 1;');
    return parseInt(countStr, 10) || 0;
  },

  async getConfig(key, defaultVal = '') {
    const safeKey = escapeSql(key);
    const sql = "SELECT value FROM radio_config WHERE key = '" + safeKey + "' LIMIT 1;";
    const val = await this.queryScalar(sql);
    return val !== '' ? val : defaultVal;
  },

  async setConfig(key, val) {
    const safeKey = escapeSql(key);
    const safeVal = escapeSql(String(val));
    const sql = "INSERT OR REPLACE INTO radio_config (key, value) VALUES ('" + safeKey + "', '" + safeVal + "');";
    return await this.execSql(sql);
  }
};
