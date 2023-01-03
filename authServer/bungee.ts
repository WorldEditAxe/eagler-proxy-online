// Utilities related to replicating BungeeCord server switching.

import mc, { Client } from "minecraft-protocol";

export type BungeeJumpData = {
    login: any,
    chunks: any[],
    position: any
}

export enum Dimension {
    OVERWORLD = 0,
    NETHER = -1,
    END = 1
}

export function bungeeJump(client: mc.Client, data: BungeeJumpData) {
    client.write('playerlist_header', {
        header: JSON.stringify({}),
        footer: JSON.stringify({})
    })
    client.write('respawn', {
        dimension: Dimension.END,
        difficulty: data.login.difficulty,
        gamemode: data.login.gameMode,
        levelType: data.login.levelType
    })
    client.write('respawn', {
        dimension: Dimension.OVERWORLD,
        difficulty: data.login.difficulty,
        gamemode: data.login.gameMode,
        levelType: data.login.levelType
    })
    for (const chunk of data.chunks) {
        client.write('map_chunk', chunk)
    }
    client.write('position', data.position)
}

export function gatherJumpData(client: mc.Client): Promise<BungeeJumpData> {
    return new Promise<BungeeJumpData>((res, rej) => {
        const resolveData: BungeeJumpData = {
            login: null,
            chunks: [],
            position: null
        }
        const listener = (data: any, meta: mc.PacketMeta) => {
            if (meta.name == 'login') resolveData.login = data
            else if (meta.name == 'map_chunk') resolveData.chunks.push(data)
            else if (meta.name == 'position') {
                client.removeListener('packet', listener)
                resolveData.position = data
                res(resolveData)
            }
        }
        client.on('packet', listener)
    })
}

export function loginServer(ip: string, port: number, client: mc.Client, auth: any): Promise<mc.Client> {
    return new Promise<mc.Client>(async (res, rej) => {
        const session = auth.token
        const mcClient = mc.createClient({
            host: ip,
            port: port,
            auth: 'mojang',
            version: '1.8.8',
            username: session.selectedProfile.name,
            keepAlive: false,
            session: {
                accessToken: session.accessToken,
                clientToken: session.selectedProfile.id,
                selectedProfile: {
                  id: session.selectedProfile.id,
                  name: session.selectedProfile.name
                }
            },
            skipValidation: true,
            hideErrors: true
        })
        mcClient.on('error', err => {
            mcClient.end()
            rej(err)
        })
        mcClient.on('connect', async () => {
            mcClient.on('end', client.end)
            await gatherJumpData(mcClient)
                .then(data => {
                    bungeeJump(client, data)
                    mcClient.on('raw', p => {
                        client.writeRaw(p)
                    })
                })
            res(mcClient)
        })
    })
}