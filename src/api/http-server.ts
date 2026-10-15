import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RaftNode } from "../core/raft-node.js";
import { InvalidMessageError } from "../codec/validation.js";
import { parseAppendEntriesArgs, parseRequestVoteArgs } from "../rpc/codec.js";
import { RaftRoutes } from "../rpc/routes.js";

export type RaftHttpNode = Pick<RaftNode, "status" | "handleRequestVote" | "handleAppendEntries">;

type RouteHandler = (body: unknown) => unknown;

const maxBodyBytes = 1024 * 1024;

export function createHttpServer(node: RaftHttpNode): Server {
  const routes = new Map<string, RouteHandler>([
    ["GET /status", () => node.status()],
    [`POST ${RaftRoutes.requestVote}`, (body) => node.handleRequestVote(parseRequestVoteArgs(body))],
    [`POST ${RaftRoutes.appendEntries}`, (body) => node.handleAppendEntries(parseAppendEntriesArgs(body))],
  ]);

  return createServer((request, response) => {
    void handleRequest(routes, request, response);
  });
}

async function handleRequest(
  routes: ReadonlyMap<string, RouteHandler>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const handler = routes.get(`${request.method} ${pathname}`);
  if (handler === undefined) {
    sendJson(response, 404, { error: `Route ${request.method} ${pathname} not found` });
    return;
  }
  try {
    const body = request.method === "POST" ? await readJsonBody(request) : undefined;
    sendJson(response, 200, handler(body));
  } catch (error) {
    if (error instanceof InvalidMessageError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    sendJson(response, 500, { error: "Internal server error" });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new InvalidMessageError("Request body is too large");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidMessageError("Request body must be valid JSON");
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
