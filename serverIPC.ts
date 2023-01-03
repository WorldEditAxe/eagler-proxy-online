import { EventEmitter } from "events"
import { fetchBadLoginAttempts, fetchPasswordForUser, fetchTokenForUser, saveBan, saveLoginAttempts, savePasswordForUser, saveTokenForUser } from "./db.js"
import { Logger } from "./logger.js"
import { ChatColor } from "./types.js"
import { disconnect } from "./utils.js"

const logger = new Logger("ServerIPCHandler")

enum RequestType {
    GET = 0,
    SET = 1,
    BAD_PW = 2,
    CORRECT_PW = 3,
    FINISHED = 4
}

type NonceBased = {
    nonce: string
}

type ReqAck = NonceBased

type PasswordRes = NonceBased & {
    password?: string
}

type TokenRes = NonceBased & {
    token?: object
}

type GetReq = NonceBased & {
    id: RequestType.GET,
    type: 'PASSWORD' | 'TOKEN',
    username?: string,
    token?: object
}

type SetReq = NonceBased & {
    id: RequestType.SET,
    type: 'PASSWORD' | 'TOKEN',
    username: string,
    password?: string,
    token?: object
}

type AuthedRes = {
    id: RequestType.FINISHED,
    url: string,
    username: string
}

type BadPasswordRes = {
    id: RequestType.BAD_PW,
    username: string
}

type CorrectPasswordRes = {
    id: RequestType.CORRECT_PW,
    username: string
}

async function awaitPacket(nonce: string): Promise<any> {
    return new Promise(res => {
        PROXY.internalServer.once('message', msg => {
            if (msg.nonce == nonce)
                res(msg)
        })
    })
}

async function handleGetter(req: GetReq) {
    if (req.type == 'PASSWORD') {
        PROXY.internalServer.postMessage({
            nonce: req.nonce,
            password: await fetchPasswordForUser(req.username)
        } as PasswordRes)
    } else {
        const res = await fetchTokenForUser(req.username)
        PROXY.internalServer.postMessage({
            nonce: req.nonce,
            token: res != null ? res.token : null
        } as TokenRes)
    }
}

async function handleSetter(req: SetReq) {
    if (req.type == 'PASSWORD') {
        await savePasswordForUser(req.username, req.password)
        PROXY.internalServer.postMessage({
            nonce: req.nonce
        } as ReqAck)
    } else {
        await saveTokenForUser(req.username, req.token)
        PROXY.internalServer.postMessage({
            nonce: req.nonce
        } as ReqAck)
    }
}

async function handleFinished(req: AuthedRes) {
    joinServerEventBus.emit(req.username, req.url)
}

async function handleBadPWDispatch(res: BadPasswordRes) {
    const player = PROXY.players.get(res.username)
    if (player) {
        await saveLoginAttempts(player.ip, player.username)
        if ((await fetchBadLoginAttempts(player.ip)).attempts[player.username] > PROXY.config.auth.maxBadLoginAttempts) {
            await saveLoginAttempts(player.ip, player.username, 0)
            await saveBan({
                ip: player.ip,
                reason: ChatColor.RED + "Too many failed password attempts detected, please reconnect at a later time.",
                bannedTill: Date.now() + PROXY.config.auth.rateLimitTime * 1000
            })
            disconnect(player, ChatColor.RED + "Too many failed password attempts!")
        }
    }
}

async function handleCorrectPWDispatch(res: CorrectPasswordRes) {
    const player = PROXY.players.get(res.username)
    if (player) await saveLoginAttempts(player.ip, player.username, 0)
}

export function bindListeners() {
    PROXY.internalServer.on('message', msg => {
        switch(msg.id as RequestType) {
            default:
                if (msg.id == undefined)
                    logger.warn("No request type in IPC packet from server!?")
                else
                    logger.warn(`No handler for IPC packet ID [${msg.id}]. Skipping packet.`)
                break
            case RequestType.BAD_PW:
                handleBadPWDispatch(msg)
                break
            case RequestType.CORRECT_PW:
                handleCorrectPWDispatch(msg)
                break
            case RequestType.FINISHED:
                handleFinished(msg)
                break
            case RequestType.GET:
                handleGetter(msg)
                break
            case RequestType.SET:
                handleSetter(msg)
                break
        }
    })
}

export const joinServerEventBus = new EventEmitter()
joinServerEventBus.setMaxListeners(0)