import { ServerGlobals } from "./authServer/types_server.js"
import { ProxyGlobals } from "./types.js"

declare global {
    // only available from proxy
    var PROXY: ProxyGlobals
    // only available from server
    var SERVER: ServerGlobals
}

export {}