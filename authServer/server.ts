import * as mc from "minecraft-protocol"
import { Logger } from "../logger.js"
import { genUUID } from "../utils.js"
import { disconectIdle, handleConnect } from "./handlers.js"
import { ClientState, ConnectionState } from "./types_server.js"
import debug from "debug"
debug.disable()

const logger = new Logger("InternalServer")
const server = mc.createServer({
    port: 42069,
    host: "127.0.0.1",
    motd: "Internal authentication server [1.8.9]",
    version: "1.8.8",
    fallbackVersion: "1.8.9",
    'online-mode': false
})
const LOCALHOST_ADDRS = ["127.0.0.1", "localhost", "::1"]
const players = new Map<string, ClientState>()

global.SERVER = {
    server: server,
    players: players
}

server.once('listening', () => {
    logger.info(`Created integrated authentication server.`)
})

server.on('login', client => {
    if (!LOCALHOST_ADDRS.some(ip => client.socket.remoteAddress === ip))
        return client.end("Disallowed client IP")
    if (SERVER.players.has(client.username))
        return client.end(`Duplicate username: ${client.username}. Please reconnect under another username.`)
    logger.info(`Client ${client.username} [/${client.socket.remoteAddress}:${client.socket.remotePort}] connected.`)
    const c: ClientState = {
        state: ConnectionState.LOGIN,
        gameClient: client,
        remoteConnection: null,
        token: null,
        lastStatusUpdate: Date.now()
    }
    client.on('end', () => {
        c.state = ConnectionState.DISCONNECTED
        SERVER.players.delete(client.username)
        logger.info(`Client ${client.username} [/${client.socket.remoteAddress}:${client.socket.remotePort}] disconnected.`)
    })
    SERVER.players.set(client.username, c)
    handleConnect(c)
})

setInterval(disconectIdle, 1000)