import { randomUUID } from "crypto"
import EventEmitter from "events"
import pauth from "prismarine-auth"
import { ChatColor } from "../types.js"
import debug from "debug"

const { Authflow, Titles } = pauth;

export type ServerDeviceCodeResponse = {
    user_code: string
    device_code: string
    verification_uri: string
    expires_in: number
    interval: number
    message: string
}

class InMemoryCache {
    private cache = {}
    async getCached () {
      return this.cache
    }
    async setCached (value) {
      this.cache = value
    }
    async setCachedPartial (value) {
      this.cache = {
        ...this.cache,
        ...value
      }
    }
}

export function auth(): EventEmitter {
    const emitter = new EventEmitter()
    const userIdentifier = randomUUID()
    const flow = new Authflow(userIdentifier, ({ username, cacheName }) => new InMemoryCache(), {
        authTitle: Titles.MinecraftNintendoSwitch,
        flow: 'live',
        deviceType: "Nintendo"
    }, code => {
        console.log = () => {}
        emitter.emit('code', code)
    })
    flow.getMinecraftJavaToken({ fetchProfile: true })
        .then(async data => {
            const _data = (await (flow as any).mca.cache.getCached()).mca
            if (data.profile == null || (data.profile as any).error)
                return emitter.emit('error', new Error(ChatColor.RED + "Couldn't fetch profile data, does the account own Minecraft: Java Edition?"))
            emitter.emit('done', {
                accessToken: data.token,
                expiresOn: _data.obtainedOn + _data.expires_in * 1000,
                selectedProfile: data.profile,
                availableProfiles: [data.profile]
            })
        })
        .catch(err => {
            if (err.toString().includes("Not Found"))
                emitter.emit('error', new Error(ChatColor.RED + "The provided account doesn't own Minecraft: Java Edition!"))
            else
                emitter.emit('error', new Error(ChatColor.YELLOW + err.toString()))
        })
    return emitter
}