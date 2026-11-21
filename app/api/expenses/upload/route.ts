import { NextRequest, NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// Extension comes from the validated MIME type, never from the file name.
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((v, i) => b[offset + i] === v);
}

// The first bytes must match what the client claimed the file is.
function bytesMatchType(type: string, b: Uint8Array): boolean {
  switch (type) {
    case "image/jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47]);
    case "application/pdf":
      return startsWith(b, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/webp": // RIFF....WEBP
      return startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
    case "image/heic": // ....ftyp
      return startsWith(b, [0x66, 0x74, 0x79, 0x70], 4);
    default:
      return false;
  }
}

// Receipts are private. This returns the storage path; the app opens a
// receipt through GET /api/expenses/[id]/receipt (short-lived signed URL).
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "File type not allowed. Use JPEG, PNG, WebP, HEIC, or PDF." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }
  if (!bytesMatchType(file.type, bytes)) {
    return NextResponse.json(
      { error: "That file doesn't look like a real photo or PDF. Try another." },
      { status: 400 }
    );
  }

  const path = `${session.userId}/${Date.now()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) {
    return fail(500, "Could not upload the receipt. Try again.", error);
  }

  return NextResponse.json({ path: data.path });
}
