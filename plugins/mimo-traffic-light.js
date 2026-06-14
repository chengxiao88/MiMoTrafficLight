import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const localAppData = process.env.LOCALAPPDATA || os.tmpdir()
const stateDir = path.join(localAppData, "MiMoLight")
const statusFile = path.join(stateDir, "status.json")
const eventLogFile = path.join(stateDir, "events.log")

const MAX_LOG_SIZE = 1024 * 1024
const DEBUG_LOG = process.env.MIMO_TRAFFIC_LIGHT_DEBUG === "1"
const DONE_QUIET_MS = Math.max(1000, Number.parseInt(process.env.MIMO_TRAFFIC_LIGHT_DONE_QUIET_MS || "2500", 10) || 2500)
const HEARTBEAT_MS = 5000
const DONE_RESIDUAL_IGNORE_MS = 3000

let lastState = "Idle"
let stateChangedAt = Date.now()
let lastStatusWriteAt = 0
let doneTimer = null

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

function getEventType(event) {
  return String(event?.type || event?.name || "").toLowerCase()
}

function valueText(value) {
  if (value == null) return ""
  if (typeof value === "string") return value.toLowerCase()
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase()
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return String(value).toLowerCase()
  }
}

function getStatusText(event) {
  return valueText(
    event?.status ||
    event?.state ||
    event?.properties?.status?.type ||
    event?.properties?.status ||
    event?.properties?.state ||
    ""
  )
}

function getSessionId(event) {
  return (
    event?.sessionID ||
    event?.sessionId ||
    event?.session?.id ||
    event?.properties?.sessionID ||
    event?.properties?.sessionId ||
    null
  )
}

function getToolName(event) {
  const tool = event?.properties?.tool || event?.tool || event?.toolName || event?.properties?.toolName
  if (!tool) return ""
  if (typeof tool === "string") return tool.toLowerCase()
  return String(tool.name || tool.id || tool.type || tool.callID || "").toLowerCase()
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value))
}

function isPermissionReleaseEvent(type) {
  return (
    type === "permission.replied" ||
    type === "question.replied" ||
    type === "question.rejected" ||
    type.includes("permission.replied") ||
    type.includes("approval.replied")
  )
}

function isPermissionRequestEvent(type, status) {
  if (type === "permission.asked" || type === "question.asked") return true
  if (type.includes("permission") && !type.includes("replied") && !type.includes("reject")) return true
  if (type.includes("approval") && (type.includes("request") || type.includes("ask"))) return true

  return includesAny(status, [
    "waiting_for_approval",
    "requires_permission",
    "permission_required",
    "awaiting_permission",
    "permission_requested"
  ])
}

function isErrorEvent(type, status) {
  return (
    type.includes("error") ||
    includesAny(status, ["error", "failed", "failure"])
  )
}

function isDoneEvent(type, status) {
  if (
    type === "session.idle" ||
    type === "session.done" ||
    type === "session.completed" ||
    type === "server.instance.disposed"
  ) {
    return true
  }

  return includesAny(status, ["idle", "completed", "complete", "done", "success"])
}

function isIdleEvent(type) {
  return (
    type === "session.created" ||
    type === "server.connected" ||
    type === "plugin.initialized"
  )
}

function isWorkingEvent(type, status) {
  if (
    type === "tool.execute.before" ||
    type.includes("tool.call") ||
    type.includes("tool.started") ||
    type.includes("assistant.started")
  ) {
    return true
  }

  return includesAny(status, ["busy", "running", "working"])
}

function isToolAfterEvent(type) {
  return type === "tool.execute.after" || type.includes("tool.execute.after")
}

function isMessageActivity(type) {
  return (
    type === "message.part.delta" ||
    type === "message.part.updated" ||
    type === "message.updated"
  )
}

function isPassiveEvent(type) {
  return (
    type === "" ||
    type.startsWith("metrics.") ||
    [
      "actor.registered",
      "actor.status",
      "file.edited",
      "file.watcher.updated",
      "hook.executed",
      "hook.react.reentered",
      "session.diff",
      "session.updated",
      "task.created",
      "writer.cache_perf"
    ].includes(type)
  )
}

function shouldIgnoreResidualMessage(type) {
  return lastState === "Done" &&
    isMessageActivity(type) &&
    Date.now() - stateChangedAt < DONE_RESIDUAL_IGNORE_MS
}

function summarizeEvent(event, state, action, reason) {
  const type = getEventType(event) || "unknown"
  const status = getStatusText(event)
  const tool = getToolName(event)
  const sessionId = getSessionId(event)
  const parts = [`type=${type}`, `state=${state}`, `action=${action}`]

  if (reason) parts.push(`reason=${reason}`)
  if (status) parts.push(`status=${status}`)
  if (tool) parts.push(`tool=${tool}`)
  if (sessionId) parts.push(`session=${sessionId}`)

  return parts.join(" ")
}

function debugEventInfo(event) {
  return {
    type: getEventType(event) || "unknown",
    status: getStatusText(event) || null,
    tool: getToolName(event) || null,
    sessionId: getSessionId(event) || null,
    keys: Object.keys(event || {}),
    propertyKeys: Object.keys(event?.properties || {})
  }
}

function logDecision(event, state, action, reason, wroteStatus) {
  const type = getEventType(event)
  if (!DEBUG_LOG && isMessageActivity(type) && !wroteStatus) return

  const suffix = DEBUG_LOG ? ` debug=${safeJson(debugEventInfo(event))}` : ""
  appendLog(`[${new Date().toISOString()}] ${summarizeEvent(event, state, action, reason)}${suffix}`)
}

function writeStatus(state, event, context = {}) {
  ensureDir()

  const payload = {
    state,
    source: "mimocode",
    event: getEventType(event) || "unknown",
    sessionId: getSessionId(event),
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

function setState(state, event, context = {}, options = {}) {
  const now = Date.now()
  const changed = state !== lastState
  lastState = state

  if (changed) {
    stateChangedAt = now
  }

  const shouldWrite = changed || options.force === true || now - lastStatusWriteAt >= HEARTBEAT_MS
  if (!shouldWrite) return false

  writeStatus(state, event, context)
  lastStatusWriteAt = now
  return true
}

function scheduleDoneTransition(context, reason = "quiet") {
  if (doneTimer) clearTimeout(doneTimer)
  doneTimer = setTimeout(() => {
    if (lastState === "Thinking") {
      const event = { type: "auto.done", reason }
      const wrote = setState("Done", event, context, { force: true })
      logDecision(event, "Done", wrote ? "written" : "kept", reason, wrote)
    }
    doneTimer = null
  }, DONE_QUIET_MS)
}

function cancelDoneTransition() {
  if (doneTimer) {
    clearTimeout(doneTimer)
    doneTimer = null
  }
}

function decideState(event) {
  const type = getEventType(event)
  const status = getStatusText(event)
  const toolName = getToolName(event)

  if (isPermissionReleaseEvent(type)) {
    return { state: "Thinking", reason: "permission-released", scheduleDone: true }
  }

  if (isPermissionRequestEvent(type, status) || toolName === "question") {
    return { state: "Permission", reason: "permission-requested", cancelDone: true, force: true }
  }

  if (isErrorEvent(type, status)) {
    return { state: "Error", reason: "error", cancelDone: true, force: true }
  }

  if (lastState === "Permission") {
    return { ignore: true, reason: "protect-permission" }
  }

  if (isDoneEvent(type, status)) {
    return { state: "Done", reason: "done", cancelDone: true, force: true }
  }

  if (isIdleEvent(type)) {
    return { state: "Idle", reason: "idle", cancelDone: true, force: true }
  }

  if (isWorkingEvent(type, status)) {
    return { state: "Working", reason: "working", cancelDone: true }
  }

  if (isToolAfterEvent(type)) {
    return { state: "Thinking", reason: "tool-finished", scheduleDone: true }
  }

  if (shouldIgnoreResidualMessage(type)) {
    return { ignore: true, reason: "done-residual-message" }
  }

  if (isMessageActivity(type) || type === "todo.updated") {
    return { state: "Thinking", reason: "message-activity", scheduleDone: true }
  }

  if (isPassiveEvent(type)) {
    return { ignore: true, reason: "passive" }
  }

  return { ignore: true, reason: "unknown" }
}

function handleEvent(event, context) {
  const decision = decideState(event)

  if (decision.ignore) {
    logDecision(event, lastState, "ignored", decision.reason, false)
    return
  }

  if (decision.cancelDone !== false) {
    cancelDoneTransition()
  }

  const wrote = setState(decision.state, event, context, { force: decision.force })
  logDecision(event, decision.state, wrote ? "written" : "kept", decision.reason, wrote)

  if (decision.scheduleDone) {
    scheduleDoneTransition(context, decision.reason)
  }
}

export const MiMoTrafficLightPlugin = async (context) => {
  const initEvent = { type: "plugin.initialized" }
  const wrote = setState("Idle", initEvent, context, { force: true })
  logDecision(initEvent, "Idle", wrote ? "written" : "kept", "plugin-initialized", wrote)

  return {
    event: async ({ event }) => {
      handleEvent(event, context)
    },

    "tool.execute.before": async (input, output) => {
      const toolName = String(input?.tool || output?.args?.tool || "").toLowerCase()
      handleEvent(
        { type: "tool.execute.before", tool: toolName, properties: { tool: toolName } },
        context
      )
    },

    "tool.execute.after": async (input, output) => {
      const toolName = String(input?.tool || output?.args?.tool || "").toLowerCase()
      handleEvent(
        { type: "tool.execute.after", tool: toolName, properties: { tool: toolName } },
        context
      )
    }
  }
}

export default MiMoTrafficLightPlugin
