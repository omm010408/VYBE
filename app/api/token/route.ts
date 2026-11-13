import { createHmac, randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^[a-f0-9]{64}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { key?: unknown; name?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const displayName = typeof body.name === "string" ? body.name.trim().slice(0, 32) : "";

    if (!KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: "That room key doesn't look valid." }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    // Keep the LiveKit URL server-side; the client receives it in the token
    // response and does not need it embedded in the browser bundle.
    const livekitUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: "Video service isn't configured yet. Add the three LiveKit environment variables to this deployment." },
        { status: 503 },
      );
    }

    // The raw invite key is never used as a room name or stored. HMAC makes
    // the derived room identifier useless without the server-side secret.
    const roomDigest = createHmac("sha256", apiSecret).update(key.toLowerCase()).digest("hex");
    const roomName = `vybe-${roomDigest.slice(0, 40)}`;
    const identity = `guest-${randomBytes(6).toString("hex")}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: displayName || "Guest",
      ttl: "8h",
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json(
      { token: await token.toJwt(), serverUrl: livekitUrl },
      { headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } },
    );
  } catch {
    return NextResponse.json({ error: "Couldn't prepare this room. Please try again." }, { status: 400 });
  }
}
