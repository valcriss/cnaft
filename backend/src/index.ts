import "dotenv/config";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { attachCollabWebSocket } from "./collab/wsHub.js";

const app = createApp();
const server = app.listen(config.PORT, () => {
  console.log(`[backend] listening on http://localhost:${config.PORT}`);
});
attachCollabWebSocket(server);

process.on("SIGINT", async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});
