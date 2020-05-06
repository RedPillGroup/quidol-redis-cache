const { Mutex } = require('async-mutex');
const Redis = require('ioredis');

const redisMap = {};

class Cache {
  constructor({ defaultTTL = 60, redisOptions }) {
    if (!redisOptions || !redisOptions.port || !redisOptions.host) {
      if (!redisOptions) throw new Error('No redisOptions specified');
      throw new Error('Invalid port or host for redis Cache');
    }
    const { host, port } = redisOptions;
    if (!redisMap[`${host}:${port}`]) {
      redisMap[`${host}:${port}`] = new Redis(redisOptions);
    }
    this.redis = redisMap[`${host}:${port}`];
    this.redisOptions = redisOptions;
    this.defaultTTL = defaultTTL;
    this.cache = new Redis(port, host);
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.mutexList = {};
  }

  async get(key, storeFunction, ttl = this.defaultTTL) {
    if (!this.mutexList[key]) this.mutexList[key] = new Mutex();
    const mutex = this.mutexList[key];
    const value = await this.cache.get(key);
    if (value) {
      return Promise.resolve(JSON.parse(value));
    }
    const release = await mutex.acquire();
    try {
      const newValueLocked = await this.cache.get(key);
      if (!newValueLocked) {
        if (storeFunction !== undefined) {
          const result = await storeFunction();
          await this.cache.set(key, JSON.stringify(result), 'EX', (!ttl) ? 0 : ttl);
          return result;
        }
      } else {
        return JSON.parse(newValueLocked);
      }
      return undefined;
    } finally {
      release();
    }
  }

  set(key, value, ttl = this.defaultTTL) {
    return this.cache.set(key, JSON.stringify(value), 'EX', (!ttl) ? 0 : ttl);
  }

  del(...keys) {
    if (keys.length > 0) return this.cache.del(...keys);
    return undefined;
  }

  delStartWith(startStr = '') {
    if (!startStr) {
      return;
    }
    const keys = this.cache.keys();
    keys.map((key) => {
      if (key.indexOf(startStr) === 0) {
        this.del(key);
      }
      return true;
    });
  }

  flush() {
    this.cache.flushall('ASYNC');
  }
}

module.exports = Cache;
