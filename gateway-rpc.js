"use strict";

const crypto = require("crypto");
const { WebSocket } = require("ws");

class GatewayRpcClient {
  constructor(host, port, token) {
    this.host = host;
    this.port = port;
    this.token = token;
    this.ws = null;
    this.pending = new Map();
    this.connectNonce = null;
    this.connectSent = false;
    this.helloOk = null;
    this.connectPromise = null;
    this.eventHandlers = new Set();
    this.refCount = 0;
    this.idleCloseTimer = null;
    this._connectResolve = null;
    this._connectReject = null;
  }

  connect() {
    if (this.helloOk) return Promise.resolve(this.helloOk);
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
      const ws = new WebSocket(`ws://${this.host}:${this.port}/`);
      this.ws = ws;

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (_) {
          return;
        }

        if (msg.type === "event") {
          if (msg.event === "connect.challenge") {
            const nonce = msg.payload?.nonce;
            if (!nonce || !String(nonce).trim()) {
              this._failConnect(new Error("gateway connect challenge missing nonce"));
              try { ws.close(); } catch (_) {}
              return;
            }
            this.connectNonce = String(nonce).trim();
            this._sendConnectFrame();
            return;
          }
          for (const handler of this.eventHandlers) {
            try { handler(msg); } catch (_) {}
          }
          return;
        }

        if (msg.type !== "res") return;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        if (pending.expectFinal && msg.payload?.status === "accepted") return;
        this.pending.delete(msg.id);
        if (pending.timeout) clearTimeout(pending.timeout);
        if (msg.ok) pending.resolve(msg.payload);
        else {
          const err = new Error(msg.error?.message || "gateway request failed");
          err.code = msg.error?.code;
          err.details = msg.error?.details;
          pending.reject(err);
        }
      });

      ws.on("error", (err) => this._failConnect(err instanceof Error ? err : new Error(String(err))));
      ws.on("close", () => {
        this.ws = null;
        this.helloOk = null;
        this.connectSent = false;
        this.connectNonce = null;
        this.connectPromise = null;
        const err = new Error("gateway connection closed");
        this.flushPending(err);
        this._failConnect(err);
        for (const handler of this.eventHandlers) {
          try { handler({ type: "event", event: "gateway.closed" }); } catch (_) {}
        }
      });
    });
    return this.connectPromise;
  }

  _failConnect(err) {
    if (!this._connectReject) return;
    this._connectReject(err);
    this._connectReject = null;
    this._connectResolve = null;
    this.connectPromise = null;
  }

  _finishConnect(hello) {
    this.helloOk = hello;
    if (!this._connectResolve) return;
    this._connectResolve(hello);
    this._connectResolve = null;
    this._connectReject = null;
  }

  _sendConnectFrame() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.connectNonce || this.connectSent) return;
    this.connectSent = true;
    const id = crypto.randomUUID();
    const params = {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: "gateway-client",
        version: "0.0.0",
        platform: process.platform || "linux",
        mode: "backend",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      caps: [],
      commands: [],
      permissions: {},
      auth: { token: this.token },
      locale: "en-US",
      userAgent: "openclaw-tg-canvas/0.2.5",
    };
    const timeout = setTimeout(() => {
      if (!this.pending.has(id)) return;
      this.pending.delete(id);
      this._failConnect(new Error("gateway connect timeout"));
      try { this.ws?.close(); } catch (_) {}
    }, 15_000);
    this.pending.set(id, {
      resolve: (hello) => this._finishConnect(hello),
      reject: (err) => this._failConnect(err),
      expectFinal: false,
      timeout,
    });
    this.ws.send(JSON.stringify({ type: "req", id, method: "connect", params }));
  }

  request(method, params, opts = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = crypto.randomUUID();
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 60_000;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`gateway request timeout for ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve,
        reject,
        expectFinal: opts.expectFinal === true,
        timeout,
      });
      this.ws.send(JSON.stringify({ type: "req", id, method, params: params ?? {} }));
    });
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  acquire() {
    this.refCount += 1;
    if (this.idleCloseTimer) {
      clearTimeout(this.idleCloseTimer);
      this.idleCloseTimer = null;
    }
    return this.connect();
  }

  release() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.idleCloseTimer = setTimeout(() => {
        if (this.refCount === 0) this.close();
      }, 30_000);
      if (this.idleCloseTimer.unref) this.idleCloseTimer.unref();
    }
  }

  flushPending(err) {
    for (const [, p] of this.pending) {
      if (p.timeout) clearTimeout(p.timeout);
      p.reject(err);
    }
    this.pending.clear();
  }

  close() {
    if (this.idleCloseTimer) {
      clearTimeout(this.idleCloseTimer);
      this.idleCloseTimer = null;
    }
    this.flushPending(new Error("gateway client closed"));
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.helloOk = null;
    this.connectSent = false;
    this.connectNonce = null;
    this.connectPromise = null;
    this._connectResolve = null;
    this._connectReject = null;
  }
}

function createGatewayRpcPool(host, port, token) {
  let shared = null;

  function getClient() {
    if (!token) return null;
    if (!shared) shared = new GatewayRpcClient(host, port, token);
    return shared;
  }

  async function request(method, params, opts) {
    const client = getClient();
    if (!client) {
      const err = new Error("OPENCLAW_GATEWAY_TOKEN not configured");
      err.code = "GATEWAY_TOKEN_MISSING";
      throw err;
    }
    await client.acquire();
    try {
      return await client.request(method, params, opts);
    } finally {
      client.release();
    }
  }

  function createDedicatedClient() {
    if (!token) return null;
    return new GatewayRpcClient(host, port, token);
  }

  return { request, getClient, createDedicatedClient };
}

function parseSessionsApiPath(pathname) {
  if (pathname === "/api/sessions") return { kind: "list" };
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(history|send))?$/);
  if (!match) return null;
  const key = decodeURIComponent(match[1]);
  const action = match[2] || null;
  if (action === "history") return { kind: "history", key };
  if (action === "send") return { kind: "send", key };
  return null;
}

module.exports = {
  GatewayRpcClient,
  createGatewayRpcPool,
  parseSessionsApiPath,
};
