export const config = {
    authMongoDbURI: process.env.MONGO,
    maxBadLoginAttempts: 10,
    rateLimitTime: 30 * 60 * 1000
}