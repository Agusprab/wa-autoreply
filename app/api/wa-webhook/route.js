import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from 'crypto';

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
        .select("id, selector_id, type, product, description, amount")
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

ID         : ${last.selector_id}
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
        .select("id, selector_id, type, product, amount")
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
        wa_number: from
      
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



    // /help — TAMPILKAN BANTUAN
    if (text.trim() === "/help") {
      await sendMessage(
        from,
        `🤖 *Bantuan Bot CashFlow*

📥 *Input Data:*
• /masuk nama | keterangan | nominal
• /keluar nama | keterangan | nominal

📊 *Rekap Data:*
• /rekap hari ini
• /rekap bulan ini
• /rekap kemarin
• /rekap all
• /rekap YYYY-MM (contoh: /rekap 2023-12)

🗑️ *Hapus Data:*
• /hapus (hapus data terakhir dengan konfirmasi)
• /delete <id> (hapus langsung berdasarkan ID)

📋 *Lihat Data:*
• /list <halaman> (tampilkan data dengan pagination, 10 per halaman)

� *Kelola Produk:*
• /produk list <halaman> (list produk)
• /produk tambah nama | deskripsi
• /produk edit <id> nama | deskripsi
• /produk hapus <id>

👤 *Kelola Akun:*
• /akun list <product_id> (list akun untuk produk)
• /akun tambah <product_id> username | password | note
• /akun edit <id> username | password | note
• /akun hapus <id>
• /akun gunakan <id> (tandai digunakan)
• /akun reset <id> (reset status)

💡 *Tips:*
• Nominal tanpa titik/koma (contoh: 50000)
• Gunakan | untuk pemisah
• ID bisa dilihat dari /list atau /produk list`
      );
      return NextResponse.json({ ok: true });
    }

    // /delete <id> — HAPUS LANGSUNG BERDASARKAN ID
    if (text.startsWith("/delete ")) {
      const id = text.replace("/delete", "").trim();

      if (!id) {
        await sendMessage(from, "❌ ID tidak valid. Gunakan /delete <id>");
        return NextResponse.json({ ok: true });
      }

      const { data: item, error } = await supabase
        .from("cashflows")
        .select("id, selector_id, type, product, description, amount")
        .eq("selector_id", id)
        .single();

      if (error || !item) {
        await sendMessage(from, "❌ Data dengan ID tersebut tidak ditemukan");
        return NextResponse.json({ ok: true });
      }

      await supabase.from("cashflows").delete().eq("selector_id", id);

      const label = item.type === "IN" ? "Uang Masuk" : "Uang Keluar";

      await sendMessage(
        from,
        `🗑️ Data berhasil dihapus
ID: ${item.selector_id}
Tipe: ${label}
Nama: ${item.product}
Keterangan: ${item.description}
Nominal: ${item.amount.toLocaleString("id-ID")}`
      );

      return NextResponse.json({ ok: true });
    }

    // /list <page> — TAMPILKAN DATA DENGAN PAGINATION
    if (text.startsWith("/list")) {
      const pageStr = text.replace("/list", "").trim();
      const page = pageStr ? Number(pageStr) : 1;

      if (isNaN(page) || page < 1) {
        await sendMessage(from, "❌ Halaman tidak valid. Gunakan /list <halaman>");
        return NextResponse.json({ ok: true });
      }

      const limit = 10;
      const offset = (page - 1) * limit;

      const { data: rows, error } = await supabase
        .from("cashflows")
        .select("id, selector_id, type, product, description, amount, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        await sendMessage(from, "❌ Gagal mengambil data");
        return NextResponse.json({ ok: true });
      }

      if (!rows || rows.length === 0) {
        await sendMessage(from, `📋 Tidak ada data di halaman ${page}`);
        return NextResponse.json({ ok: true });
      }

      let message = `📋 *Data CashFlow - Halaman ${page}*\n\n`;

      rows.forEach((row, index) => {
        const num = offset + index + 1;
        const label = row.type === "IN" ? "➕ Masuk" : "➖ Keluar";
        const date = new Date(row.created_at).toLocaleDateString("id-ID");

        message += `${num}. ${label} - ${row.product}\n`;
        message += `   💰 ${row.amount.toLocaleString("id-ID")}\n`;
        message += `   📝 ${row.description}\n`;
        message += `   🆔 ID: ${row.selector_id} | 📅 ${date}\n\n`;
      });

      message += `🔄 Gunakan /list ${page + 1} untuk halaman berikutnya`;

      await sendMessage(from, message);
      return NextResponse.json({ ok: true });
    }

    // PRODUK HANDLERS
    if (text.startsWith("/produk ")) {
      const parts = text.split(" ");
      const subcmd = parts[1];

      if (subcmd === "list") {
        const pageStr = parts[2] || "1";
        const page = Number(pageStr);
        if (isNaN(page) || page < 1) {
          await sendMessage(from, "❌ Halaman tidak valid. Gunakan /produk list <halaman>");
          return NextResponse.json({ ok: true });
        }
        const limit = 10;
        const offset = (page - 1) * limit;
        const { data: rows, error } = await supabase
          .from("products")
          .select("selector_id, name, description, created_at")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) {
          await sendMessage(from, "❌ Gagal mengambil data produk");
          return NextResponse.json({ ok: true });
        }
        if (!rows || rows.length === 0) {
          await sendMessage(from, `📋 Tidak ada produk di halaman ${page}`);
          return NextResponse.json({ ok: true });
        }
        let message = `📋 *Produk - Halaman ${page}*\n\n`;
        rows.forEach((row, index) => {
          const num = offset + index + 1;
          message += `${num}. ${row.name}\n`;
          message += `   📝 ${row.description || '-'}\n`;
          message += `   🆔 ID: ${row.selector_id}\n\n`;
        });
        message += `🔄 Gunakan /produk list ${page + 1} untuk halaman berikutnya`;
        await sendMessage(from, message);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "tambah") {
        const raw = text.replace("/produk tambah", "").trim();
        const [name, description] = raw.split("|").map(v => v?.trim());
        if (!name) {
          await sendMessage(from, "❌ Format salah. Gunakan /produk tambah nama | deskripsi");
          return NextResponse.json({ ok: true });
        }
        const { data, error } = await supabase
          .from("products")
          .insert({ name, description })
          .select("selector_id")
          .single();
        if (error) {
          await sendMessage(from, "❌ Gagal menambah produk");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `✅ Produk ditambahkan\nNama: ${name}\nDeskripsi: ${description || '-'}\nID: ${data.selector_id}`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "edit") {
        const raw = text.replace("/produk edit", "").trim();
        const [idStr, rest] = raw.split(" ", 2);
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID tidak valid. Gunakan /produk edit <id> nama | deskripsi");
          return NextResponse.json({ ok: true });
        }
        const [name, description] = rest.split("|").map(v => v?.trim());
        if (!name) {
          await sendMessage(from, "❌ Format salah. Gunakan /produk edit <id> nama | deskripsi");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("products")
          .update({ name, description })
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal mengedit produk");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `✅ Produk diedit\nID: ${id}\nNama: ${name}\nDeskripsi: ${description || '-'}`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "hapus") {
        const idStr = text.replace("/produk hapus", "").trim();
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID tidak valid. Gunakan /produk hapus <id>");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("products")
          .delete()
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal menghapus produk");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `🗑️ Produk dengan ID ${id} berhasil dihapus`);
        return NextResponse.json({ ok: true });
      }
    }

    // AKUN HANDLERS
    if (text.startsWith("/akun ")) {
      const parts = text.split(" ");
      const subcmd = parts[1];

      if (subcmd === "list") {
        const productIdStr = parts[2];
        const productId = Number(productIdStr);
        if (isNaN(productId)) {
          await sendMessage(from, "❌ ID produk tidak valid. Gunakan /akun list <product_id>");
          return NextResponse.json({ ok: true });
        }
        const { data: product } = await supabase
          .from("products")
          .select("id, name")
          .eq("selector_id", productId)
          .single();
        if (!product) {
          await sendMessage(from, "❌ Produk tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        const { data: rows, error } = await supabase
          .from("product_details")
          .select("selector_id, username, password, note, is_used, created_at")
          .eq("product_id", product.id)
          .order("created_at", { ascending: false });
        if (error) {
          await sendMessage(from, "❌ Gagal mengambil data akun");
          return NextResponse.json({ ok: true });
        }
        if (!rows || rows.length === 0) {
          await sendMessage(from, `📋 Tidak ada akun untuk produk ${product.name}`);
          return NextResponse.json({ ok: true });
        }
        let message = `📋 *Akun untuk Produk ${product.name}*\n\n`;
        rows.forEach((row, index) => {
          const status = row.is_used ? "✅ Digunakan" : "❌ Belum";
          message += `${index + 1}. Username: ${row.username}\n`;
          message += `   Password: ${row.password}\n`;
          message += `   Note: ${row.note || '-'}\n`;
          message += `   Status: ${status}\n`;
          message += `   🆔 ID: ${row.selector_id}\n\n`;
        });
        await sendMessage(from, message);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "tambah") {
        const raw = text.replace("/akun tambah", "").trim();
        const [productIdStr, rest] = raw.split(" ", 2);
        const productId = Number(productIdStr);
        if (isNaN(productId)) {
          await sendMessage(from, "❌ ID produk tidak valid. Gunakan /akun tambah <product_id> username | password | note");
          return NextResponse.json({ ok: true });
        }
        const [username, password, note] = rest.split("|").map(v => v?.trim());
        if (!username || !password) {
          await sendMessage(from, "❌ Format salah. Gunakan /akun tambah <product_id> username | password | note");
          return NextResponse.json({ ok: true });
        }
        const { data: product } = await supabase
          .from("products")
          .select("id")
          .eq("selector_id", productId)
          .single();
        if (!product) {
          await sendMessage(from, "❌ Produk tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        const { data, error } = await supabase
          .from("product_details")
          .insert({ product_id: product.id, username, password, note })
          .select("selector_id")
          .single();
        if (error) {
          await sendMessage(from, "❌ Gagal menambah akun");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `✅ Akun ditambahkan\nUsername: ${username}\nPassword: ${password}\nNote: ${note || '-'}\nID: ${data.selector_id}`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "edit") {
        const raw = text.replace("/akun edit", "").trim();
        const [idStr, rest] = raw.split(" ", 2);
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID akun tidak valid. Gunakan /akun edit <id> username | password | note");
          return NextResponse.json({ ok: true });
        }
        const [username, password, note] = rest.split("|").map(v => v?.trim());
        if (!username || !password) {
          await sendMessage(from, "❌ Format salah. Gunakan /akun edit <id> username | password | note");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("product_details")
          .update({ username, password, note })
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal mengedit akun");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `✅ Akun diedit\nID: ${id}\nUsername: ${username}\nPassword: ${password}\nNote: ${note || '-'}`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "hapus") {
        const idStr = text.replace("/akun hapus", "").trim();
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID akun tidak valid. Gunakan /akun hapus <id>");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("product_details")
          .delete()
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal menghapus akun");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `🗑️ Akun dengan ID ${id} berhasil dihapus`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "gunakan") {
        const idStr = text.replace("/akun gunakan", "").trim();
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID akun tidak valid. Gunakan /akun gunakan <id>");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("product_details")
          .update({ is_used: true })
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal menandai akun sebagai digunakan");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `✅ Akun dengan ID ${id} ditandai sebagai digunakan`);
        return NextResponse.json({ ok: true });
      }

      if (subcmd === "reset") {
        const idStr = text.replace("/akun reset", "").trim();
        const id = Number(idStr);
        if (isNaN(id)) {
          await sendMessage(from, "❌ ID akun tidak valid. Gunakan /akun reset <id>");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabase
          .from("product_details")
          .update({ is_used: false })
          .eq("selector_id", id);
        if (error) {
          await sendMessage(from, "❌ Gagal mereset akun");
          return NextResponse.json({ ok: true });
        }
        await sendMessage(from, `🔄 Akun dengan ID ${id} direset`);
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
