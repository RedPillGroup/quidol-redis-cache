# quidol-redis-cache
Quidol Cache used for our real time show and REST API.

- Async-mutex included in this package for a reliable cache.
- Only one connection used per redis Instance, if you instanciante multiple `QuidolCache` this will not open a new connection but use a connection already open.

## Install

```
  yarn add @redpill-paris/quidol-redis-cache
```

## Configuration

### Redis Standalone
```javascript
const QuidolCache = require('@redpill-paris/quidol-redis-cache');

const redisOptions = {
  host: 'localhost',
  port: '6379',
}

const cache = new QuidolCache({ redisOptions });
```
### Redis Cluster
```javascript
const QuidolCache = require('@redpill-paris/quidol-redis-cache');

const redisClusterOptions = [
  {
    host: 'localhost',
    port: '6379',
  },
  {
    host: 'localhost',
    port: '6380',
  },
]

const cache = new QuidolCache({ redisClusterOptions, type: 'cluster' });
```

#### Parameters available:
- **redisOptions**: compatible with all options used in the connect from ioRedis.
- **defaultTTL**: default expiration key in seconds(default 60).
- **type**: `cluster` or `standalone` default(standalone).
- **redisClusterOptions**: options passed to Redis.Cluster();

## Methods

- **get**:
```javascript
  cache.get(key, storeFunction(optionnal))
```
return a Promise.
If the cache is invalid or null the storeFunction will be executed and the result of this function will be stored in the cache.
```javascript
const userInfo = await cache.get(
  `userInfo:${userId}`,
  async () => {
    /* Some Async things, fetch user info from DB or other sources.
    ** The method passed in parameter can be sync or async it doesn't matter everything is handled in the package.
    */
    ...
    return userInfo
  }
);
```

### del: 
```javascript
cache.del(key)
```
 Return a Promise.
```javascript
await cache.del(`userInfo:${userId}`);
```
### delAll
```javascript
cache.delAll(match, count)
```
 Return a Promise.
```javascript
await cache.del(`userInfo:${userId}`);
```
### set: 
```javascript
cache.set(key, value)
```
Return a Promise
```javascript
await cache.set(`userInfo:${userId}`, {
  admin: true,
  nickname: 'Kubessandra',
});
```

## Exemple:

```javascript
const QuidolCache = require('@redpill-paris/quidol-redis-cache');

const redisOptions = {
  host: 'localhost',
  port: '6379',
}
const cache = new QuidolCache({ redisOptions });

// Exemple for fetching user info with a cache of 60secs

const userId = '123456';
const userInfo = await cache.get(
  `userInfo:${userId}`,
  async () => {
    /* Some Async things, fetch user info from DB or other sources.
    ** The method passed in parameter can be sync or async it doesn't matter everything is handled in the package.
    */
    ...
    return userInfo
  }
);

// I can now use my userInfo without spamming the database everytime.
console.log(userInfo);

// If the user is Updated, you can del or set the key to invalide the cache and requesting a new fetch on the next req.
await cache.del(`userInfo:${userId}`);

// If there are multiple users, you can delete all this keys
await cache.delAll('userInfo:*', 100);
```

