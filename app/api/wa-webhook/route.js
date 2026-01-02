import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const payload = await req.json();
    const data = payload?.data;

    const text =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text;

    const from = data?.key?.remoteJid;
    const fromMe = data?.key?.fromMe;

    if (!text || fromMe) {
      return NextResponse.json({ ok: true });
    }

    console.log("Pesan masuk:", { from, text });

    // HAPUS STEP 1 — TAMPILKAN DATA TERAKHIR
    if (text.trim() === "/hapus") {
      const { data: last, error } = await supabase
        .from("cashflows")
        .select("id, type, product, description, amount")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !last) {
        await sendMessage(from, "❌ Tidak ada data yang bisa dihapus");
        return NextResponse.json({ ok: true });
      }

      const label = last.type === "IN" ? "Uang Masuk" : "Uang Keluar";

      await sendMessage(
        from,
        `⚠️ Konfirmasi Hapus Data Terakhir

Tipe       : ${label}
Nama       : ${last.product}
Keterangan : ${last.description}
Nominal    : ${last.amount.toLocaleString("id-ID")}

Ketik:
👉 /hapus iya   → hapus
👉 /hapus batal → batal`
      );

      return NextResponse.json({ ok: true });
    }

    // HAPUS STEP 2 — KONFIRMASI
    if (text.trim() === "/hapus iya") {
      const { data: last } = await supabase
        .from("cashflows")
        .select("id, type, product, amount")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!last) {
        await sendMessage(from, "❌ Data tidak ditemukan");
        return NextResponse.json({ ok: true });
      }

      await supabase.from("cashflows").delete().eq("id", last.id);

      await sendMessage(
        from,
        `🗑️ Data berhasil dihapus
${last.type === "IN" ? "Masuk" : "Keluar"}: ${last.product}
Nominal: ${last.amount.toLocaleString("id-ID")}`
      );

      return NextResponse.json({ ok: true });
    }

    if (text.trim() === "/hapus batal") {
      await sendMessage(from, "✅ Penghapusan dibatalkan");
      return NextResponse.json({ ok: true });
    }

    // REKAP HARI INI (GLOBAL)
    if (text.trim() === "/rekap hari ini") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const { data: rows } = await supabase
        .from("cashflows")
        .select("type, amount")
        .gte("created_at", start.toISOString());

      await sendRekap(from, rows, "Rekap Hari Ini (Semua Data)");
      return NextResponse.json({ ok: true });
    }

    // REKAP BULAN INI (GLOBAL)
    if (text.trim() === "/rekap bulan ini") {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      const { data: rows } = await supabase
        .from("cashflows")
        .select("type, amount")
        .gte("created_at", start.toISOString());

      await sendRekap(from, rows, "Rekap Bulan Ini (Semua Data)");
      return NextResponse.json({ ok: true });
    }

    // /masuk & /keluar (FORMAT SAMA)
    if (text.startsWith("/masuk") || text.startsWith("/keluar")) {
      const type = text.startsWith("/masuk") ? "IN" : "OUT";
      const cmd = type === "IN" ? "/masuk" : "/keluar";

      const raw = text.replace(cmd, "").trim();
      const [product, description, amountRaw] = raw
        .split("|")
        .map((v) => v?.trim());

      if (!product || !description || !amountRaw) {
        await sendMessage(
          from,
          `❌ Format salah
Gunakan:
${cmd} nama | keterangan | nominal`
        );
        return NextResponse.json({ ok: true });
      }

      const amount = Number(amountRaw.replace(/\D/g, ""));
      if (isNaN(amount) || amount <= 0) {
        await sendMessage(from, "❌ Nominal tidak valid");
        return NextResponse.json({ ok: true });
      }

      await supabase.from("cashflows").insert({
        type,
        product,
        description,
        amount,
        wa_number: from,
      });

      const label = type === "IN" ? "Uang Masuk" : "Uang Keluar";

      await sendMessage(
        from,
        `✅ ${label} Tercatat
Nama       : ${product}
Keterangan : ${description}
Nominal    : ${amount.toLocaleString("id-ID")}

🗑️ Salah input?
Ketik: /hapus`
      );

      return NextResponse.json({ ok: true });
    }

    if (text.trim() === "/rekap kemarin") {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);

  const { data: rows } = await supabase
    .from("cashflows")
    .select("type, amount")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  await sendRekap(from, rows, "Rekap Kemarin (Semua Data)");
  return NextResponse.json({ ok: true });
}

if (text.trim() === "/rekap all") {
  const { data: rows } = await supabase
    .from("cashflows")
    .select("type, amount");

  await sendRekap(from, rows, "Rekap Semua Data");
  return NextResponse.json({ ok: true });
}


if (text.startsWith("/rekap ")) {
  const arg = text.replace("/rekap", "").trim();

  // format YYYY-MM
  if (/^\d{4}-\d{2}$/.test(arg)) {
    const [year, month] = arg.split("-").map(Number);

    const start = new Date(year, month - 1, 1, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59);

    const { data: rows } = await supabase
      .from("cashflows")
      .select("type, amount")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    await sendRekap(
      from,
      rows,
      `Rekap ${year}-${String(month).padStart(2, "0")} (Semua Data)`
    );

    return NextResponse.json({ ok: true });
  }
}



    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// HELPER REKAP
async function sendRekap(number, rows = [], title) {
  let masuk = 0;
  let keluar = 0;

  rows?.forEach((r) => {
    if (r.type === "IN") masuk += r.amount;
    if (r.type === "OUT") keluar += r.amount;
  });

  const saldo = masuk - keluar;

  await sendMessage(
    number,
    `📊 ${title}

Uang Masuk : ${masuk.toLocaleString("id-ID")}
Uang Keluar: ${keluar.toLocaleString("id-ID")}
`
  );
}

// SEND MESSAGE
async function sendMessage(number, text) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number, text }),
  });

  console.log("SEND:", res.status, await res.text());
}
