import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const localAppData = process.env.LOCALAPPDATA || os.tmpdir()
const stateDir = path.join(localAppData, "MiMoLight")
const statusFile = path.join(stateDir, "status.json")
const eventLogFile = path.join(stateDir, "events.log")

function ensureDir() {
  fs.mkdirSync(stateDir, { recursive: true })
}

function safeJson(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function appendLog(line) {
  ensureDir()
  fs.appendFileSync(eventLogFile, line + "\n", "utf8")
}

function writeStatus(state, event, context = {}) {
  ensureDir()

  const payload = {
    state,
    source: "mimocode",
    event: event?.type || event?.name || "unknown",
    sessionId: event?.sessionID || event?.sessionId || event?.session?.id || null,
    projectDir: context?.directory || context?.worktree || null,
    updatedAt: new Date().toISOString()
  }

  fs.writeFileSync(statusFile, JSON.stringify(payload, null, 2), "utf8")
}

function mapEventToState(event) {
  const type = String(event?.type || event?.name || "").toLowerCase()

  if (!type) return "Thinking"

  if (type.includes("permission.asked") || (type.includes("permission") && type.includes("ask"))) {
    return "Permission"
  }

  if (type.includes("tool.execute.before")) {
    const toolName = String(event?.properties?.tool || event?.tool || "").toLowerCase()
    if (toolName === "question") return "Permission"
    return "Working"
  }

  if (type.includes("permission.replied")) {
    return "Thinking"
  }

  if (type.includes("tool.execute.after")) {
    return "Thinking"
  }

  if (type.includes("session.error") || type.includes("error")) {
    return "Error"
  }

  if (type.includes("session.idle")) {
    return "Done"
  }

  if (type.includes("session.created") || type.includes("server.connected")) {
    return "Idle"
  }

  if (type.includes("session.status")) {
    const statusType = String(event?.properties?.status?.type || "").toLowerCase()
    if (statusType === "busy") return "Working"
    if (statusType === "idle") return "Done"
    return "Thinking"
  }

  if (type.includes("message.part.delta")) {
    return "Thinking"
  }

  if (type.includes("message.part.updated")) {
    return "Thinking"
  }

  if (type.includes("message.updated") || type.includes("todo.updated") || type.includes("session.updated")) {
    return "Thinking"
  }

  if (type.includes("session.diff") || type.includes("metrics.")) {
    return "Thinking"
  }

  return "Thinking"
}

export const MiMoTrafficLightPlugin = async (context) => {
  appendLog(`[${new Date().toISOString()}] plugin.initialized ${safeJson({
    directory: context?.directory,
    worktree: context?.worktree
  })}`)

  writeStatus("Idle", { type: "plugin.initialized" }, context)

  return {
    event: async ({ event }) => {
      const state = mapEventToState(event)
      appendLog(`[${new Date().toISOString()}] ${safeJson(event)}`)
      writeStatus(state, event, context)
    },

    "tool.execute.before": async (input, output) => {
      appendLog(`[${new Date().toISOString()}] tool.execute.before ${safeJson({ input, output })}`)
      const toolName = String(input?.tool || output?.args?.tool || "").toLowerCase()
      if (toolName === "question") {
        writeStatus("Permission", { type: "tool.execute.before" }, context)
      } else {
        writeStatus("Working", { type: "tool.execute.before" }, context)
      }
    },

    "tool.execute.after": async (input, output) => {
      appendLog(`[${new Date().toISOString()}] tool.execute.after ${safeJson({ input, output })}`)
      writeStatus("Thinking", { type: "tool.execute.after" }, context)
    }
  }
}

export default MiMoTrafficLightPlugin
