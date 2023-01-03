import { createHash } from "crypto"
import { ClientState, ConnectionState } from "./types_server.js"
import * as uuid from "uuid-buffer"
import * as Chunk from "prismarine-chunk"
import * as Block from "prismarine-block"
import * as Registry from "prismarine-registry"
import vec3 from "vec3"
import { ChatColor } from "../types.js"
import { Client } from "minecraft-protocol"
import { Logger } from "../logger.js"
import { auth, ServerDeviceCodeResponse } from "./auth.js"
import { Authflow } from "prismarine-auth"
import { loginServer } from "./bungee.js"
import { fetchPasswordForUser } from "../db.js"
import { fetchTokenForUser, savePasswordForUser, saveTokenForUser } from "./proxyIPC.js"

const { Vec3 } = vec3 as any
const MAX_LIFETIME_CONNECTED = 10 * 60 * 1000, MAX_LIFETIME_AUTH = 5 * 60 * 1000, MAX_LIFETIME_LOGIN = 1 * 60 * 1000
const REGISTRY = Registry.default('1.8.8'), McBlock = (Block as any).default('1.8.8'), LOGIN_CHUNK = generateSpawnChunk().dump()
const logger = new Logger("PlayerHandler")

export function disconectIdle() {
    SERVER.players.forEach(client => {
        if (client.state == ConnectionState.AUTH && (Date.now() - client.lastStatusUpdate) > MAX_LIFETIME_AUTH) {
            client.gameClient.end("Timed out waiting for user to login via Microsoft")
        } else if (client.state == ConnectionState.LOGIN && (Date.now() - client.lastStatusUpdate) > MAX_LIFETIME_LOGIN) {
            client.gameClient.end("Timed out waiting for user to login to the server")
        } else if (client.state == ConnectionState.SUCCESS && (Date.now() - client.lastStatusUpdate) > MAX_LIFETIME_CONNECTED) {
            client.gameClient.end(ChatColor.RED + "Please enter the IP of the server you'd like to connect to in chat.")
        }
    })
}

export function genUUID(user: string): string {
    const str = `OfflinePlayer:${user}`
    let md5Bytes = createHash('md5').update(str).digest()
    md5Bytes[6]  &= 0x0f;  /* clear version        */
    md5Bytes[6]  |= 0x30;  /* set to version 3     */
    md5Bytes[8]  &= 0x3f;  /* clear variant        */
    md5Bytes[8]  |= 0x80;  /* set to IETF variant  */
    return uuid.toString(md5Bytes)
}

export function handleConnect(client: ClientState) {
    client.gameClient.write('login', {
        entityId: 1,
        gameMode: 2,
        dimension: 0,
        difficulty: 1,
        maxPlayers: 1,
        levelType: 'flat',
        reducedDebugInfo: false
    })
    client.gameClient.write('map_chunk', {
        x: 0,
        z: 0,
        groundUp: true,
        bitMap: 0xFFFF,
        chunkData: LOGIN_CHUNK
    })
    client.gameClient.write('position', {
        x: 0,
        y: 65,
        z: 8.5,
        yaw: -90,
        pitch: 0,
        flags: 0x01
    })
    client.gameClient.write('playerlist_header', {
        header: JSON.stringify({
            text: ` ${ChatColor.GOLD}EaglerProxy Authentication Server `
        }),
        footer: JSON.stringify({
            text: `${ChatColor.GOLD}Run ${ChatColor.RED}/help${ChatColor.GOLD} for help.`
        })
    })
    onConnect(client)
}

export function awaitCommand(client: Client, filter: (msg: string) => boolean): Promise<string> {
    return new Promise<string>((res, rej) => {
        const onMsg = packet => {
            if (filter(packet.message)) {
                client.removeListener('chat', onMsg)
                client.removeListener('end', onEnd)
                res(packet.message)
            }
        }
        const onEnd = () => rej("Client disconnected before promise could be resolved")
        client.on('chat', onMsg)
        client.on('end', onEnd)
    })
}

export function sendMessage(client: Client, msg: string) {
    client.write('chat', {
        message: JSON.stringify({ text: msg }),
        position: 1
    })
}

export function sendMessageLogin(client: Client, url: string, token: string) {
    client.write('chat', {
        message: JSON.stringify({
            text: "Please go to ",
            color: ChatColor.RESET,
            extra: [
                {
                    text: url,
                    color: 'gold',
                    clickEvent: {
                        action: "open_url",
                        value: url
                    },
                    hoverEvent: {
                        action: "show_text",
                        value: ChatColor.GOLD + "Click to open me in a new window!"
                    }
                },
                {
                    text: " and login via the code "
                },
                {
                    text: token,
                    color: 'gold'
                },
                {
                    text: "."
                }
            ]
        }),
        position: 1
    })
}

export function updateState(client: Client, newState: 'REGISTER' | 'LOGIN' | 'AUTH' | 'SERVER', uri?: string, code?: string) {
    switch(newState) {
        case 'REGISTER':
            client.write('playerlist_header', {
                header: JSON.stringify({
                    text: ` ${ChatColor.GOLD}EaglerProxy Authentication Server `
                }),
                footer: JSON.stringify({
                    text: `${ChatColor.RED}/register <password> <password>`
                })
            })
            break
        case 'LOGIN':
            client.write('playerlist_header', {
                header: JSON.stringify({
                    text: ` ${ChatColor.GOLD}EaglerProxy Authentication Server `
                }),
                footer: JSON.stringify({
                    text: `${ChatColor.RED}/login <password>`
                })
            })
            break
        case 'AUTH':
            if (code == null || uri == null) throw new Error("Missing code/uri required for title message type AUTH")
            client.write('playerlist_header', {
                header: JSON.stringify({
                    text: ` ${ChatColor.GOLD}EaglerProxy Authentication Server `
                }),
                footer: JSON.stringify({
                    text: `${ChatColor.RED}${uri}${ChatColor.GOLD} | Code: ${ChatColor.RED}${code}`
                })
            })
            break
        case 'SERVER':
            client.write('playerlist_header', {
                header: JSON.stringify({
                    text: ` ${ChatColor.GOLD}EaglerProxy Authentication Server `
                }),
                footer: JSON.stringify({
                    text: `${ChatColor.RED}/join <ip>`
                })
            })
            break
    }
}

export async function onConnect(client: ClientState) {
    try {
        // TODO: logging in
        client.state = ConnectionState.LOGIN
        client.lastStatusUpdate = Date.now()
        let pw = await fetchPasswordForUser(client.gameClient.username)
        if (pw == null) {
            updateState(client.gameClient, 'REGISTER')
            sendMessage(client.gameClient, `Please register a password to protect your account username. Run ${ChatColor.GOLD}/register <password> <password>${ChatColor.RESET}.`)
            while (true) {
                const msg = await awaitCommand(client.gameClient, msg => msg.startsWith("/register")), parsed = msg.split(/ /gi, 3)
                if (parsed.length < 3) sendMessage(client.gameClient, `Please repeat your password to confirm your password. ${ChatColor.GOLD}/register <password> <password>`)
                else {
                    if (parsed[1].length < 8) sendMessage(client.gameClient, `Your password must be at least ${ChatColor.RED}8${ChatColor.RESET} characters of length or above! ${ChatColor.GOLD}/register <password> <password>`)
                    else if (parsed[1].length > 16) sendMessage(client.gameClient, `Your password must be shorter than ${ChatColor.RED}16${ChatColor.RESET} characters! ${ChatColor.GOLD}/register <password> <password>`)
                    else {
                        if (parsed[1].match(/[^ -~]+/gi) != null) sendMessage(client.gameClient, `Your password may only contain alphanumerical and special characters! ${ChatColor.GOLD}/register <password> <password>`)
                        else {
                            if (parsed[1] !== parsed[2]) sendMessage(client.gameClient, `Passwords do not match! ${ChatColor.GOLD}/register <password> <password>`)
                            else {
                                pw = parsed[1]
                                await savePasswordForUser(client.gameClient.username, pw)
                                sendMessage(client.gameClient, ChatColor.BRIGHT_GREEN + "Successfully registered your password!")
                                break
                            }
                        }
                    }
                }
            }
        }
        client.lastStatusUpdate = Date.now()
        updateState(client.gameClient, 'LOGIN')
        sendMessage(client.gameClient, `Please log in with your proxy password. Run ${ChatColor.GOLD}/login <password>${ChatColor.RESET}.`)
        while (true) {
            const msg = await awaitCommand(client.gameClient, msg => msg.startsWith("/login")), parsed = msg.split(/ /gi, 2)
            if (parsed.length < 2) sendMessage(client.gameClient, `Please provide a password. ${ChatColor.GOLD}/login <password>${ChatColor.RESET}.`)
            else {
                if (parsed[1] !== pw) {
                    sendMessage(client.gameClient, `Incorrect password, please try again. ${ChatColor.GOLD}/login <password>${ChatColor.RESET}.`)
                } else {
                    sendMessage(client.gameClient, ChatColor.BRIGHT_GREEN + "Successfully authenticated!")
                    break
                }
            }
        }
        let savedAuth = await fetchTokenForUser(client.gameClient.username)
        let errored = false
        if (savedAuth.token == null || savedAuth.token.expiresOn <= Date.now()) {
            const authHandler = auth(), codeCallback = (code: ServerDeviceCodeResponse) => {
                updateState(client.gameClient, 'AUTH', code.verification_uri, code.user_code)
                // sendMessage(client.gameClient, `Please go to ${ChatColor.GOLD}microsoft.com/link${ChatColor.RESET} and login via the code: ${ChatColor.GOLD}${code.user_code}${ChatColor.RESET}.`)
                sendMessageLogin(client.gameClient, code.verification_uri, code.user_code)
            }
            authHandler.once('error', err => {
                if (!client.gameClient.ended) client.gameClient.end(err.message)
                errored = true
            })
            authHandler.on('code', codeCallback)
            await saveTokenForUser(client.gameClient.username, await new Promise(res => authHandler.once('done', result => {
                savedAuth = result
                res(result)
            })))
            sendMessage(client.gameClient, ChatColor.BRIGHT_GREEN + "Successfully logged into Minecraft!")
        }

        if (errored) return
        client.state = ConnectionState.SUCCESS
        client.lastStatusUpdate = Date.now()
        updateState(client.gameClient, 'SERVER')
        sendMessage(client.gameClient, `Please enter the IP of the server to connect to. ${ChatColor.GOLD}/join <ip> [port]${ChatColor.RESET}.`)
        let url: string, port: number
        while (true) {
            const msg = await awaitCommand(client.gameClient, msg => msg.startsWith("/join")), parsed = msg.split(/ /gi, 3)
            if (parsed.length < 2) sendMessage(client.gameClient, `Please provide a server to connect to. ${ChatColor.GOLD}/join <ip> [port]${ChatColor.RESET}.`)
            else if (parsed.length > 3 && isNaN(parseInt(parsed[2]))) sendMessage(client.gameClient, `A valid port number has to be passed! ${ChatColor.GOLD}/join <ip> [port]${ChatColor.RESET}.`)
            else {
                sendMessage(client.gameClient, `${ChatColor.YELLOW}Connecting to server...`)
                url = parsed[1]
                if (parsed.length > 3) port = parseInt(parsed[2])
                port = port ?? 25565
                break
            }
        }
        client.gameClient.on('raw', d => {
            client.remoteConnection.writeRaw(d)
        })
        client.gameClient.on('end', client.remoteConnection.end)
        client.remoteConnection = await loginServer(url, port, client.gameClient, savedAuth)
    } catch (err) {
        if (!client.gameClient.ended) {
            logger.error(`Error whilst processing user ${client.gameClient.username}: ${err.stack || err}`)
            client.gameClient.end(ChatColor.YELLOW + "Something went wrong whilst processing your request. Please reconnect.")
        }
    }
}

export function generateSpawnChunk(): Chunk.PCChunk {
    const chunk = new (Chunk.default(REGISTRY))(null) as Chunk.PCChunk
    chunk.initialize(() => new McBlock(REGISTRY.blocksByName.air.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 64, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 67, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(7, 65, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(7, 66, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(9, 65, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(9, 66, 8), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 65, 7), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 66, 7), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 65, 9), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setBlock(new Vec3(8, 66, 9), new McBlock(REGISTRY.blocksByName.barrier.id, REGISTRY.biomesByName.plains.id, 0))
    chunk.setSkyLight(new Vec3(8, 66, 8), 15)
    return chunk
}