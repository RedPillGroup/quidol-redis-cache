const { Mutex } = require('async-mutex');
const Redis = require('ioredis');
const objectHash = require('object-hash');

const redisMap = {};

/*
** type: can be standalone or cluster
*/

class Cache {
  constructor({
    defaultTTL = 60,
    type = 'standalone',
    redisClusterOptions,
    redisOptions,
  }) {
    if (!redisOptions && type !== 'cluster') {
      throw new Error(`No redisOptions specified for type:${type}`);
    }
    if (!redisClusterOptions && type !== 'standalone') {
      throw new Error(`No redisClusterOptions specified for type:${type}`);
    }
    if (redisOptions) {
      this.setupStandalone(redisOptions);
    } else {
      this.setupCluster(redisClusterOptions);
    }
    this.type = type;
    this.defaultTTL = defaultTTL;
    this.cache = this.redis;
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.mutexList = {};
  }

  setupCluster(clusterOptions) {
    const optionsHash = objectHash(clusterOptions);
    if (!redisMap[optionsHash]) {
      redisMap[optionsHash] = new Redis.Cluster(clusterOptions);
    }
    this.redis = redisMap[optionsHash];
  }

  setupStandalone(redisOptions) {
    const { host, port } = redisOptions;
    if (!host || !port) {
      throw new Error('No port or host specified for redisOptions');
    }
    if (!redisMap[`${host}:${port}`]) {
      redisMap[`${host}:${port}`] = new Redis(redisOptions);
    }
    this.redis = redisMap[`${host}:${port}`];
    this.redisOptions = redisOptions;
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
      delete this.mutexList[key];
    }
  }

  set(key, value, ttl = this.defaultTTL) {
    return this.cache.set(key, JSON.stringify(value), 'EX', (!ttl) ? 0 : ttl);
  }

  del(...keys) {
    if (this.type === 'cluster') {
      return Promise.all(keys.map(key => this.cache.del(key)));
    }
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
  
  delAll(match, count = 100) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout has occurred in delAll'))
      }, 10000);
      const promises = [];
      const stream = this.cache.scanStream({ count, match });
      let pipeline = this.cache.pipeline();
      let nbWaiting = 0;
      stream.on('data', (keys) => {
        keys.forEach((key) => {
          pipeline.del(key);
        });
        nbWaiting += keys.length;
        if (nbWaiting > count) {
          promises.push(new Promise(resolve => pipeline.exec(resolve)));
          nbWaiting = 0;
          pipeline = this.cache.pipeline();
        }
      });
      stream.on('end', async () => {
        promises.push(new Promise(resolve => pipeline.exec(resolve)));
        await Promise.all(promises);
        clearTimeout(timeout);
        resolve();
      });
      stream.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  flush() {
    this.cache.flushall('ASYNC');
  }
}

module.exports = Cache;
