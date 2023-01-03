import { Config } from "./types.js";

export const config: Config = {
    name: "MinecraftProxy",
    bindHost: "0.0.0.0",
    bindPort: 80, // 443 if using TLS
    maxPlayers: 20,
    motd: {
        iconURL: null,
        l1: "hi",
        l2: "lol"
    },
    security: { // provide path to key & cert if you want to enable encryption/secure websockets
        enabled: false,
        key: null,
        cert: null
    },
    auth: {
        authMongoDbURI: process.env.MONGO,
        maxBadLoginAttempts: 10,
        rateLimitTime: 30 * 60 * 1000
    }
}

export const BRANDING: Readonly<string> = Object.freeze("EaglerXProxy")
export const VERSION: Readonly<string> = "1.0.0"
export const NETWORK_VERSION_TEXT: Readonly<string> = Object.freeze(BRANDING + "/" + VERSION)
export const PROTOCOL_EAGLER_VERSION: Readonly<number> = Object.freeze(2)
// game protocol version 47 (protocol number of 1.8.x as stated in game's code)
export const PROTOCOL_MINECRAFT_VERSION: Readonly<number> = Object.freeze(47)