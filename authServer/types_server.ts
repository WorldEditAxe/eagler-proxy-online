import { Client, Server } from "minecraft-protocol"
import { parentPort } from "worker_threads"

export type ServerGlobals = {
    server: Server,
    players: Map<string, ClientState>
}

export type ClientState = {
    state: ConnectionState,
    gameClient: Client,
    remoteConnection: Client,
    token?: string,
    lastStatusUpdate: number
}

export enum ConnectionState {
    LOGIN,
    AUTH,
    SUCCESS,
    DISCONNECTED
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