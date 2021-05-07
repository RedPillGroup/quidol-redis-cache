const { Mutex } = require('async-mutex');
const Redis = require('ioredis');
const objectHash = require('object-hash');

const redisMap = {};

const defaults = { scaleReads: "slave" };

/*
** type: can be standalone, cluster or sentinel
*/

class Cache {
  constructor({
    defaultTTL = 60,
    type = 'standalone',
    redisClusterOptions,
    redisSentinelOptions,
    redisOptions,
    options = defaults
  }) {
    if(!options) options = { scaleReads: "slave" };

    switch(type) {
      case 'standalone':
        if(!redisOptions) throw new Error(`No redisOptions specified for type:${type}`);
        this.setupStandalone({...redisOptions, ...options});
        break;
      case 'cluster':
        if(!redisClusterOptions) throw new Error(`No redisClusterOptions specified for type:${type}`);
        this.setupCluster(redisClusterOptions, options);
        break;
      case 'sentinel':
        if(!redisSentinelOptions) throw new Error(`No redisSentinelOptions specified for type:${type}`);
        this.setupSentinel({...redisSentinelOptions, ...options});
        break;
      default:
        throw new Error(`Unknown type:${type}`);
    }

    this.type = type;
    this.defaultTTL = defaultTTL;
    this.cache = this.redis;
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.mutexList = {};
  }

  setupSentinel(clusterOptions) {
    const optionsHash = objectHash(clusterOptions);
    if (!redisMap[optionsHash]) {
      redisMap[optionsHash] = new Redis(clusterOptions);
    }
    this.redis = redisMap[optionsHash];
  }

  setupCluster(clusterOptions, options) {
    const optionsHash = objectHash(clusterOptions);
    if (!redisMap[optionsHash]) {
      redisMap[optionsHash] = new Redis.Cluster(clusterOptions, options);
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

  async delStartWith(startStr = '') {
    if (!startStr) {
      return;
    }
    if (this.type === 'cluster') {
      const masters = this.cache.nodes('master');
      const keysAllNodes = await Promise.all(masters.map((node) => node.keys(`${startStr}*`)));
      return Promise.all(keysAllNodes.map((keys) => {
        return Promise.all(keys.map((key) => {
          return this.cache.del(key);
        }))
      }));
    } else {
      const keys = await this.cache.keys(`${startStr}*`);
      return Promise.all(keys.map((key) => {
        this.cache.del(key);
      }));
    }
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

  static resetConnectionMap() {
    Object.keys(redisMap).map((key) => delete redisMap[key]);
  }

  static getDefaults() {
    return defaults;
  }
}

module.exports = Cache;
