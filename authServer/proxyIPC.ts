import { MongoClient, WithId } from "mongodb"

export let mongoClient: MongoClient = null

export type PasswordSchema = {
    username: string,
    password: string
}

export type TokenSchema = {
    username: string,
    token: {
        token: string,
        expiresOn: number
    }
}

export type IPBadAttemptsSchema = {
    ip: string,
    attempts: {
        [username: string]: number
    }
}

export type BanSchema = {
    ip: string,
    bannedTill: number,
    reason: string
}

export async function init(uri: string): Promise<MongoClient> {
    const client = await new MongoClient(uri).connect()
    await firstTimeInit(client).catch(() => {})
    mongoClient = client
    return client
}

export async function firstTimeInit(client: MongoClient) {
    if (await client.db('meta').collection('meta').findOne({ inited: true }) != null)
        throw new Error("Database already setup, no need to init again!")
    if (!await client.db('user_data').collection('passwords').indexExists('username')) {
        await client.db('user_data').collection('passwords').createIndex({
            username: 'text'
        })
    }
    if (!await client.db('user_data').collection('tokens').indexExists('username')) {
        await client.db('user_data').collection('tokens').createIndex({
            username: 'text'
        })
    }
    if (!await client.db('user_data').collection('login_attempts').indexExists('ip')) {
        await client.db('user_data').collection('tokens').createIndex({
            ip: 'text'
        })
    }
}

export async function fetchPasswordForUser(username: string): Promise<string | null> {
    const res = await mongoClient.db('user_data').collection('passwords').findOne({ username: username })
    return res != null ? res.password : null
}

export async function savePasswordForUser(username: string, password: string) {
    await mongoClient.db('user_data').collection('passwords').updateOne({
        username: username
    }, {
        $set: {
            username: username,
            password: password
        }
    }, { upsert: true })
}

export async function fetchTokenForUser(username: string): Promise<WithId<TokenSchema> | null> {
    const res = await mongoClient.db('user_data').collection('tokens').findOne({ username: username })
    return res as any
}

export async function saveTokenForUser(username: string, token: object) {
    await mongoClient.db('user_data').collection('tokens').updateOne({
        username: username
    }, {
        $set: {
            username: username,
            token: token
        }
    }, { upsert: true })
}

export async function saveLoginAttempts(ip: string, username: string, attempts?: number) {
    if (attempts != null) {
        if (attempts <= 0) {
            await mongoClient.db('user_data').collection('bad_logins').updateOne({
                ip: ip
            }, {
                $unset: {
                    [`attempts.${username}`]: 1
                },
                $set: {
                    ip: ip
                }
            }, { upsert: true })
        } else {
            const res = await mongoClient.db('user_data').collection('bad_logins').updateOne({
                ip: ip
            }, {
                $set: {
                    ip: ip,
                    [`attempts.${username}`]: attempts
                }
            }, { upsert: true })
        }
    } else {
        await mongoClient.db('user_data').collection('bad_logins').updateOne({
            ip: ip
        }, {
            $set: {
                ip: ip
            },
            $inc: { [`attempts.${username}`]: 1, totalAttempts: 1 }
        }, { upsert: true })
    }
}

export async function fetchBadLoginAttempts(ip: string): Promise<WithId<IPBadAttemptsSchema> | null> {
    const res = await mongoClient.db('user_data').collection('bad_logins').findOne({ ip: ip }) as any
    return res
}

export async function fetchBan(ip: string): Promise<WithId<BanSchema> | null> {
    return mongoClient.db('user_data').collection('bans').findOne({ ip: ip }) as any
}

export async function saveBan(data: BanSchema) {
    await mongoClient.db('user_data').collection('bans').insertOne(data)
}

export async function deleteBan(ip: string) {
    await mongoClient.db('user_data').collection('bans').deleteOne({ ip: ip })
}