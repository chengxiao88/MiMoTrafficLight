import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const localAppData = process.env.LOCALAPPDATA || os.tmpdir()
const stateDir = path.join(localAppData, "MiMoLight")
const statusFile = path.join(stateDir, "status.json")
const eventLogFile = path.join(stateDir, "events.log")

const MAX_LOG_SIZE = 1024 * 1024
const DEBUG_LOG = process.env.MIMO_TRAFFIC_LIGHT_DEBUG === "1"

let lastState = "Idle"

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

function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(eventLogFile)
    if (stat.size > MAX_LOG_SIZE) {
      const backup = path.join(stateDir, "events.log.1")
      try { fs.rmSync(backup, { force: true }) } catch {}
      fs.renameSync(eventLogFile, backup)
    }
  } catch {}
}

function appendLog(line) {
  ensureDir()
  rotateLogIfNeeded()
  fs.appendFileSync(eventLogFile, line + "\n", "utf8")
}

function writeStatus(state, event, context = {}) {
  ensureDir()

  const payload = {
    state,
    source: "mimocode",
    event: event?.type || event?.name || "unknown",
    sessionId: event?.sessionID || event?.sessionId || event?.session?.id || null,
    projectDir: context?.directory || context?.worktree || process.cwd() || null,
    updatedAt: new Date().toISOString()
  }

  const tmpFile = `${statusFile}.${process.pid}.tmp`

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf8")
    fs.renameSync(tmpFile, statusFile)
  } catch (error) {
    try {
      if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true })
    } catch {}
    throw error
  }
}

function shouldIgnoreEventAfterIdle(type) {
  if (lastState !== "Done" && lastState !== "Idle") return false

  return (
    type.includes("message.updated") ||
    type.includes("session.updated") ||
    type.includes("metrics.") ||
    type.includes("session.diff")
  )
}

function mapEventToState(event) {
  const type = String(event?.type || event?.name || "").toLowerCase()
  const status = String(event?.status || event?.state || "").toLowerCase()

  if (
    type.includes("permission") ||
    type.includes("approval") ||
    status.includes("waiting_for_approval") ||
    status.includes("requires_permission")
  ) {
    return "Permission"
  }

  if (
    type.includes("error") ||
    status.includes("error") ||
    status.includes("failed")
  ) {
    return "Error"
  }

  if (
    type.includes("tool.call") ||
    type.includes("tool.execute.before") ||
    type.includes("tool.started") ||
    type.includes("assistant.started") ||
    status.includes("running") ||
    status.includes("working") ||
    status.includes("thinking")
  ) {
    const toolName = String(event?.properties?.tool || event?.tool || "").toLowerCase()
    if (toolName === "question") return "Permission"
    return "Working"
  }

  if (type.includes("tool.execute.after") || type.includes("permission.replied")) {
    return "Thinking"
  }

  if (
    type.includes("session.idle") ||
    type.includes("session.done") ||
    status.includes("idle") ||
    status.includes("completed") ||
    status.includes("done")
  ) {
    return "Done"
  }

  if (type.includes("session.created") || type.includes("server.connected") || type.includes("plugin.initialized")) {
    return "Idle"
  }

  if (type.includes("session.status")) {
    const statusType = String(event?.properties?.status?.type || "").toLowerCase()
    if (statusType === "busy") return "Working"
    if (statusType === "idle") return "Done"
    return "Thinking"
  }

  if (type.includes("message.part.delta") || type.includes("message.part.updated")) {
    return "Thinking"
  }

  if (type.includes("message.updated") || type.includes("todo.updated") || type.includes("session.updated")) {
    return "Thinking"
  }

  if (type.includes("session.diff") || type.includes("metrics.")) {
    return "Thinking"
  }

  return lastState || "Idle"
}

export const MiMoTrafficLightPlugin = async (context) => {
  appendLog(`[${new Date().toISOString()}] plugin.initialized ${safeJson({
    directory: context?.directory,
    worktree: context?.worktree
  })}`)

  writeStatus("Idle", { type: "plugin.initialized" }, context)

  return {
    event: async ({ event }) => {
      const type = String(event?.type || event?.name || "").toLowerCase()

      if (shouldIgnoreEventAfterIdle(type)) {
        appendLog(`[${new Date().toISOString()}] ignored type=${type} lastState=${lastState}`)
        return
      }

      const state = mapEventToState(event)
      lastState = state

      if (DEBUG_LOG) {
        appendLog(`[${new Date().toISOString()}] ${safeJson(event)}`)
      } else {
        appendLog(`[${new Date().toISOString()}] type=${type} state=${state}`)
      }

      writeStatus(state, event, context)
    },

    "tool.execute.before": async (input, output) => {
      const toolName = String(input?.tool || output?.args?.tool || "").toLowerCase()
      const state = toolName === "question" ? "Permission" : "Working"
      lastState = state
      appendLog(`[${new Date().toISOString()}] tool.execute.before type=${toolName} state=${state}`)
      writeStatus(state, { type: "tool.execute.before" }, context)
    },

    "tool.execute.after": async (input, output) => {
      lastState = "Thinking"
      appendLog(`[${new Date().toISOString()}] tool.execute.after state=Thinking`)
      writeStatus("Thinking", { type: "tool.execute.after" }, context)
    }
  }
}

export default MiMoTrafficLightPlugin
