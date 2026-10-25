import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth.js';
import { importSqlite } from './import-sqlite.js';

const FLAVORS = [
  ['cherry', 'ალუბალი', 'კლასიკური წითელი. ტკბილი ალუბალი და მჟავე ანანასი — ყველაზე პოპულარული კომბინაცია.', '#ff2e4d'],
  ['blue-raspberry', 'ლურჯი ჟოლო', 'ელექტრო ლურჯი. ყველაზე მჟავე და ყველაზე ხალისიანი — ენაც გალურჯდება.', '#1fb3ff'],
  ['grape', 'ყურძენი', 'იისფერი და რბილი. ტკბილი ყურძენი ტროპიკულ ანანასთან ერთად.', '#9a5cff'],
  ['tropical-punch', 'ტროპიკული პუნში', 'ტროპიკული ხილის მიქსი. ცოტა მჟავე, ძალიან წვნიანი — ზაფხული ქილაში.', '#ff6a3d'],
];

const FAQS = [
  ['სად აწვდით?', 'ამ ეტაპზე თბილისში. მიწოდების ფასი და დრო შეკვეთის ფორმაში ჩანს, სანამ შეკვეთას დაადასტურებ.'],
  ['როგორ გადავიხადო?', 'მიტანისას — ნაღდი ფულით ან ბარათით, კურიერთან.'],
  ['რამდენ ხანს ინახება?', 'მხოლოდ მაცივარში. ახლად დაჭრილი ხილია, ამიტომ საუკეთესოა პირველივე დღეებში; ვადა ქილაზე წერია.'],
  ['რა არის შემადგენლობაში?', 'ახლად დაჭრილი ანანასი და Kool-Aid-ის ფხვნილი. ზუსტი შემადგენლობა ქილის ეტიკეტზე წერია.'],
  ['შემიძლია შეკვეთის სტატუსის ნახვა?', 'კი — გვერდის ბოლოში „შეკვეთის სტატუსი“: შეიყვანე შეკვეთის ნომერი და ტელეფონი.'],
];

const metaGet = async (db, key) => (await db.one('SELECT value FROM meta WHERE key = $1', [key]))?.value;
const metaSet = (db, key, value) =>
  db.query('INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);

// Fills an empty database: either from the old SQLite file (first run after the move to
// Postgres) or with the starter catalogue. Safe to run on every start.
export async function seed(db, { sqliteFile, adminUser, adminPassword }) {
  const { n } = await db.one('SELECT count(*)::int AS n FROM products');
  if (n === 0) {
    if (sqliteFile && existsSync(sqliteFile) && !(await metaGet(db, 'sqlite_imported'))) {
      await importSqlite(db, sqliteFile);
      await metaSet(db, 'sqlite_imported', new Date().toISOString());
      console.log('✓ ძველი SQLite ბაზიდან მონაცემები გადმოტანილია');
    } else {
      for (const [i, [slug, flavor, description, color]] of FLAVORS.entries()) {
        const { id } = await db.one(
          `INSERT INTO products (slug, flavor, description, color, price, cost, stock, sort)
           VALUES ($1, $2, $3, $4, 2000, 0, 60, $5) RETURNING id`,
          [slug, flavor, description, color, i + 1]
        );
        await db.query(
          `INSERT INTO stock_movements (product_id, delta, balance, reason, note, actor)
           VALUES ($1, 60, 60, 'import', 'საწყისი მარაგი', 'system')`,
          [id]
        );
      }
    }
  }

  const zones = await db.one('SELECT count(*)::int AS n FROM delivery_zones');
  if (zones.n === 0) {
    await db.query(`INSERT INTO delivery_zones (name, fee, eta, sort) VALUES ('თბილისი', 0, 'იმავე დღეს', 1)`);
  }

  if (!(await metaGet(db, 'faqs_seeded'))) {
    for (const [i, [q, a]] of FAQS.entries()) {
      await db.query('INSERT INTO faqs (question, answer, sort) VALUES ($1, $2, $3)', [q, a, i + 1]);
    }
    await metaSet(db, 'faqs_seeded', '1');
  }

  // salt for the cookieless visitor hash
  if (!(await metaGet(db, 'visit_salt'))) await metaSet(db, 'visit_salt', randomBytes(32).toString('hex'));

  const staff = await db.one('SELECT count(*)::int AS n FROM staff');
  if (staff.n === 0) {
    if (!adminPassword || adminPassword.length < 8) {
      console.warn('⚠ თანამშრომელი ჯერ არ არსებობს: .env-ში ჩაწერე ADMIN_USER და ADMIN_PASSWORD (მინ. 8 სიმბოლო) და გადატვირთე სერვერი.');
    } else {
      await db.query(`INSERT INTO staff (username, name, role, password_hash) VALUES ($1, 'მფლობელი', 'admin', $2)`, [
        adminUser || 'admin',
        hashPassword(adminPassword),
      ]);
      console.log(`✓ შეიქმნა ადმინი „${adminUser || 'admin'}“`);
    }
  }
}
