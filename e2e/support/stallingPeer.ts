import { connect, createServer, type Socket } from 'node:net';

export interface StallingPeer {
  port: number;
  stalledConnections(): number;
  close(): Promise<void>;
}

export function startStallingPeer(targetPort: number): Promise<StallingPeer> {
  const stalled: Socket[] = [];
  const open = new Set<Socket>();
  const track = (socket: Socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  };

  const server = createServer((socket) => {
    track(socket);
    socket.on('error', () => socket.destroy());
    if (stalled.length === 0) {
      stalled.push(socket);
      return;
    }
    const target = connect(targetPort, '127.0.0.1');
    track(target);
    target.on('error', () => socket.destroy());
    socket.on('close', () => target.destroy());
    target.on('close', () => socket.destroy());
    socket.pipe(target);
    target.pipe(socket);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        stalledConnections: () => stalled.length,
        close: () =>
          new Promise((done) => {
            for (const socket of open) socket.destroy();
            server.close(() => done());
          })
      });
    });
  });
}
