const ioredis = require("ioredis");
const QuidolRedisCache = require("./index.js");

jest.mock('ioredis');

const defaultOptions = QuidolRedisCache.getDefaults();


beforeEach(() => {
    ioredis.mockClear();
    ioredis.Cluster.mockClear();
    QuidolRedisCache.resetConnectionMap();
});


test("should throw if an unknown type is provided", () => {
    expect(() => {
        new QuidolRedisCache({type: "unknown"});
    }).toThrow();
});

// Standalone
test("should throw if no host and port are provided with stanalone connection", () => {
    const redisOptions = {};
    const options = {};

    expect(() => {
        new QuidolRedisCache({type: "standalone", redisOptions, options});
    }).toThrow();
});

test("should accept standalone connection options", () => {
    const redisOptions = { host: "localhost", port: 6379 };
    const options = {};

    const cache = new QuidolRedisCache({type: "standalone", redisOptions, options});

    expect(ioredis).toHaveBeenCalledWith(redisOptions);
});

test("should default standalone connection options", () => {
    const redisOptions = { host: "localhost", port: 6379 };
    const options = defaultOptions;

    const cache = new QuidolRedisCache({redisOptions});

    expect(ioredis).toHaveBeenCalledWith({ ...redisOptions, ...options });
});

test("should pool standalone connection", () => {
    const redisOptions = { host: "localhost", port: 6379 };
    const options = defaultOptions;

    const cache = [];

    for (const i of Array(5).keys()) {
        cache[i] = new QuidolRedisCache({redisOptions});
    }

    expect(ioredis).toHaveBeenCalledTimes(1);
});


// Sentinel
test("should accept sentinel connection options", () => {
    const redisSentinelOptions = { host: "localhost", port: 6379 };
    const options = {};

    const cache = new QuidolRedisCache({type: "sentinel", redisSentinelOptions, options});

    expect(ioredis).toHaveBeenCalledWith({ ...redisSentinelOptions, ...options });
});

test("should pool sentinel connection", () => {
    const redisSentinelOptions = { host: "localhost", port: 6379 };
    const options = defaultOptions;

    const cache = [];

    for (const i of Array(5).keys()) {
        cache[i] = new QuidolRedisCache({type: "sentinel" , redisSentinelOptions});
    }

    expect(ioredis).toHaveBeenCalledTimes(1);
});


// Cluster
test("should accept cluster connection options", () => {
    const redisClusterOptions = [{ host: "localhost", port: 6379 }];
    const options = {};

    const cache = new QuidolRedisCache({type: "cluster", redisClusterOptions, options});

    expect(ioredis.Cluster).toHaveBeenCalledWith(redisClusterOptions, options);
});

test("should default cluster connection options", () => {
    const redisClusterOptions = [{ host: "localhost", port: 6379 }];
    const options = defaultOptions;

    const cache = new QuidolRedisCache({type: "cluster", redisClusterOptions });

    expect(ioredis.Cluster).toHaveBeenCalledWith(redisClusterOptions, options);
});

test("should pool cluster connection", () => {
    const redisClusterOptions = [{ host: "localhost", port: 6379 }];
    const options = defaultOptions;

    const cache = [];

    for (const i of Array(1).keys()) {
        cache[i] = new QuidolRedisCache({type: "cluster" , redisClusterOptions});
    }

    expect(ioredis.Cluster).toHaveBeenCalledTimes(1);
});