import { randomUUID } from "crypto"
import { Server } from "http"
import { Client } from "minecraft-protocol"
import { Worker } from "worker_threads"
import { WebSocketServer, WebSocket } from "ws"
import { BRANDING, VERSION, NETWORK_VERSION_TEXT } from "./config.js"
import { EaglerSkinPacketId, SkinId } from "./eaglerPacketDef.js"
import { Logger } from "./logger.js"

export type UUID = ReturnType<typeof randomUUID>

export enum State {
    PRE_HANDSHAKE,
    AUTHING,
    POST_AUTH,
    CONNECTING_SERVER,
    CONNECTED,
    DISCONNECTED
}

export type MOTD = {
    icon?: Buffer, // 16384
    motd: [string, string]
}

export type PlayerStats = {
    max: number,
    onlineCount: number
}

export type ProxyGlobals = {
    brand: typeof BRANDING,
    version: typeof VERSION,
    MOTDVersion: typeof NETWORK_VERSION_TEXT,

    serverName: string,
    secure: false,
    proxyUUID: UUID,
    MOTD: MOTD,
    internalServer: Worker

    wsServer: WebSocketServer,
    httpServer: Server,
    players: Map<string, ProxiedPlayer>,
    logger: Logger,
    config: Config
}

export type Config = {
    name: string,
    bindPort: number,
    bindHost: string,
    maxPlayers: number,
    motd: {
        iconURL?: string,
        l1: string,
        l2: string
    },
    security: {
        enabled: boolean
        key: string,
        cert: string
    },
    auth: {
        authMongoDbURI: string
        maxBadLoginAttempts: number
        rateLimitTime: number // in seconds
    }
}

export enum ChatColor {
    BLACK = "§0",
    DARK_BLUE = "§1",
    DARK_GREEN = "§2",
    DARK_CYAN = "§3",
    DARK_RED = "§4",
    PURPLE = "§5",
    GOLD = "§6",
    GRAY = "§7",
    DARK_GRAY = "§8",
    BLUE = "§9",
    BRIGHT_GREEN = "§a",
    CYAN = "§b",
    RED = "§c",
    PINK = "§d",
    YELLOW = "§e",
    WHITE = "§f",
    // text styling
    OBFUSCATED = '§k',
    BOLD = '§l',
    STRIKETHROUGH = '§m',
    UNDERLINED = '§n',
    ITALIC = '§o',
    RESET = '§r'
}

export type ChatExtra = {
    text: string,
    bold?: boolean,
    italic?: boolean,
    underlined?: boolean,
    strikethrough?: boolean,
    obfuscated?: boolean,
    color?: ChatColor | 'reset'
}

export type Chat = {
    text?: string,
    bold?: boolean,
    italic?: boolean,
    underlined?: boolean,
    strikethrough?: boolean,
    obfuscated?: boolean,
    color?: ChatColor | 'reset',
    extra?: ChatExtra[]
}

export class ProxiedPlayer {
    public username: string
    public uuid: string
    public clientBrand: string
    public state: State
    public ws: WebSocket
    public ip: string
    public remotePort: number
    public remoteConnection: Client
    public skin: {
        type: "CUSTOM" | "BUILTIN",
        skinId?: number,
        customSkin?: Buffer
    }
    public loginOptions: ProxyClientOptions
    public url: string
}

export enum ChannelMessageType {
    CLIENT = 0x17,
    SERVER = 0x3f
}

export type UnpackedChannelMessage = {
    channel: string,
    data: Buffer,
    type: ChannelMessageType
}

export type DecodedCFetchSkin = {
    id: EaglerSkinPacketId.C_FETCH_SKIN,
    uuid: UUID
}

export type DecodedSSkinFetchBuiltin = {
    id: EaglerSkinPacketId.S_SKIN_DL_BI,
    uuid: UUID,
    skinId: SkinId
}

export type DecodedSSkinDl = {
    id: EaglerSkinPacketId.S_SKIN_DL,
    uuid: UUID,
    skin: Buffer
}

export type DecodedCSkinReq = {
    id: EaglerSkinPacketId.C_REQ_SKIN,
    uuid: UUID,
    url: string
}

export type ProxyClientOptions = {
    server: string
}