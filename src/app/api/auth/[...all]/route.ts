import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, ready } from "@/lib/server/auth";

async function handle(request: Request) {
  await ready();
  const { GET, POST } = toNextJsHandler(getAuth());
  return request.method === "GET" ? GET(request) : POST(request);
}

export { handle as GET, handle as POST };
