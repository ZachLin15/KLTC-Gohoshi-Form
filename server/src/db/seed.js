// Seeds one starter role template based on the KLTC Gohoshi sign-up sheet,
// but only if role_templates is empty (safe to call on every server boot).
const { client, init } = require("./index");

async function seedIfEmpty() {
  const existing = await client.execute("SELECT COUNT(*) AS c FROM role_templates");
  if (Number(existing.rows[0].c) > 0) return false;

  const tx = await client.transaction("write");
  try {
    const info = await tx.execute({
      sql: "INSERT INTO role_templates (name_en, name_zh, name_ja) VALUES (?, ?, ?)",
      args: ["Gohoshi Duty Day", "供仕当值日", "御奉仕当番日"],
    });
    const templateId = Number(info.lastInsertRowid);

    const roles = [
      ["Altar Cleaning & Start of Day Chanting", "佛坛预备及诵经", "", 1],
      ["End of Day Chanting", "结尾诵经", "", 1],
      ["AV", "视听", "", 3],
      ["Sesshin & Greetings", "接心及接待", "", 3],
      ["Cleaning", "清扫", "", 6],
    ];

    for (let i = 0; i < roles.length; i++) {
      const [name_en, name_zh, name_ja, limit_count] = roles[i];
      await tx.execute({
        sql: `INSERT INTO template_roles (template_id, name_en, name_zh, name_ja, limit_count, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [templateId, name_en, name_zh, name_ja, limit_count, i],
      });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  console.log("Seeded 'Gohoshi Duty Day' role template.");
  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  (async () => {
    await init();
    const seeded = await seedIfEmpty();
    if (!seeded) console.log("role_templates already has data, skipping seed.");
    process.exit(0);
  })();
}
