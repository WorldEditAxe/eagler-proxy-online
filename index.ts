import { readFileSync } from "fs";
import * as http from "http"
import * as https from "https"
import { WebSocket, WebSocketServer } from "ws";
import { BRANDING, config, NETWORK_VERSION_TEXT, VERSION } from "./config.js";
import { handlePacket } from "./listener.js";
import { Logger } from "./logger.js";
import { disconnect, generateMOTDImage, parseUrl } from "./utils.js";
import { ChatColor, ProxiedPlayer, State } from "./types.js";
import { genUUID } from "./utils.js";
import { parse } from "url";
import { Worker } from "worker_threads";
import { init } from "./db.js";
import { bindListeners } from "./serverIPC.js";
import debug from "debug"
debug.disable()

const logger = new Logger("EagXProxy")
const connectionLogger = new Logger("ConnectionHandler")

global.PROXY = {
    brand: BRANDING,
    version: VERSION,
    MOTDVersion: NETWORK_VERSION_TEXT,

    serverName: config.name,
    secure: false,
    proxyUUID: genUUID(config.name),
    MOTD: {
        icon: config.motd.iconURL ? await generateMOTDImage(readFileSync(config.motd.iconURL)) : null,
        motd: [config.motd.l1, config.motd.l2]
    },

    wsServer: null,
    httpServer: null,
    internalServer: null,
    players: new Map(),
    logger: logger,
    config: config
}

let server: WebSocketServer, httpServer: https.Server | http.Server

if (PROXY.config.security.enabled) {
    logger.info(`Starting SECURE WebSocket proxy on port ${config.bindPort}...`)
    if (process.env.REPL_SLUG) {
        logger.warn("You appear to be running the proxy on Repl.it with encryption enabled. Please note that Repl.it by default provides encryption, and enabling encryption may or may not prevent you from connecting to the server.")
    } 
    httpServer = https.createServer({
        key: readFileSync(config.security.key),
        cert: readFileSync(config.security.cert)
    }).listen(config.bindPort, config.bindHost)
} else {
    logger.info(`Starting INSECURE WebSocket proxy on port ${config.bindPort}...`)
    httpServer = http.createServer().listen(config.bindPort, config.bindHost)
}
server = new WebSocketServer({ noServer: true })
PROXY.httpServer = httpServer

server.addListener('connection', (c: WebSocket, req: http.IncomingMessage) => {
    connectionLogger.debug(`[CONNECTION] New inbound WebSocket connection from [/${(c as any)._socket.remoteAddress}:${(c as any)._socket.remotePort}]. (${(c as any)._socket.remotePort} -> ${config.bindPort})`)
    const plr = new ProxiedPlayer()
    plr.url = req.url
    plr.ws = c
    plr.ip = (c as any)._socket.remoteAddress
    plr.remotePort = (c as any)._socket.remotePort
    plr.state = State.PRE_HANDSHAKE
    plr.queuedEaglerSkinPackets = []
    c.on('message', msg => {
        handlePacket(msg as Buffer, plr)
    })
})

httpServer.on('listening', async () => {
    logger.info("Starting internal authentication server...")
    logger.info("Connecting to authentication database...")
    await init(PROXY.config.auth.authMongoDbURI)
    PROXY.internalServer = new Worker("./authServer/server.js")
    await new Promise(res => PROXY.internalServer.once('message', res))
    bindListeners()
    httpServer.on('upgrade', (request, socket, head) => {
        try {
            const url = parse(request.url, true)
            if (url.query.server == null) {
                server.handleUpgrade(request, socket, head, ws => {
                    const plr = new ProxiedPlayer()
                    plr.state = State.POST_HANDSHAKE
                    plr.ws = ws
                    disconnect(plr, ChatColor.RED + "No server URL was provided!")
                })
            } else {
                server.handleUpgrade(request, socket, head, ws => {
                    server.emit('connection', ws, request)
                })
            }
        } catch (err) {
            logger.error(`Error whilst handling WebSocket upgrade: ${err.stack ?? err}`)
        }
    })
    logger.info(`Successfully started${config.security.enabled ? " [secure]" : ""} WebSocket proxy on port ${config.bindPort}!`)
    process.on('uncaughtException', err => {
        logger.error(`An uncaught exception was caught! Exception: ${err.stack ?? err}`)
    })
    process.on('unhandledRejection', err => {
        logger.error(`An unhandled promise rejection was caught! Rejection: ${(err != null ? (err as any).stack : err) ?? err}`)
    })
    process.on('SIGTERM', () => {
        logger.info("Cleaning up before exiting...")
        for (const [username, plr] of PROXY.players) {
            if (plr.remoteConnection != null) plr.remoteConnection.end()
            disconnect(plr, ChatColor.YELLOW + "Proxy is shutting down.")
        }
        process.exit(0)
    })
    process.on('SIGINT', () => {
        logger.info("Cleaning up before exiting...")
        for (const [username, plr] of PROXY.players) {
            if (plr.remoteConnection != null) plr.remoteConnection.end()
            disconnect(plr, ChatColor.YELLOW + "Proxy is shutting down.")
        }
        process.exit(0)
    })
})