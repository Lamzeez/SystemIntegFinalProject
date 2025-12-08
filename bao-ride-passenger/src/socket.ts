// src/socket.ts
import { io, Socket } from "socket.io-client";
import { BASE_URL } from "./api";

let socket: Socket;

export function getSocket() {
  if (!socket) {
    socket = io(BASE_URL, {
      transports: ["websocket"],
    });
  }
  return socket;
}
