import { expect, it } from "bun:test";
import net from "node:net";
import { stallGuardedSocket } from "../client.server.ts";

it("destroys a socket that goes quiet, so the in-flight query fails", async () => {
  const server = net.createServer(() => {}).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as net.AddressInfo;

  const socket = await stallGuardedSocket({ host: ["127.0.0.1"], port: [port] }, 50);
  const closed = new Promise<Error>((r) => socket.once("error", r));
  expect((await closed).message).toBe("database socket stalled");
  expect(socket.destroyed).toBe(true);
  server.close();
});
