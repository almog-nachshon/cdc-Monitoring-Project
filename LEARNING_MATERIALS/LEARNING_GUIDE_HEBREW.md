# פתרון CDC Monitoring - מדריך למידה (עברית)

**מחבר:** Almog Nachshon  
**תאריך:** 15 בנובמבר 2025  
**פרויקט:** מערכת CDC Monitoring עבור TiDB

---

## תוכן עניינים

1. [סקירה מהירה](#סקירה-מהירה)
2. [הסבר הארכיטקטורה](#הסבר-הארכיטקטורה)
3. [עומק בכל רכיב](#עומק-בכל-רכיב)
4. [איך הנתונים זורמים](#איך-הנתונים-זורמים)
5. [טכנולוגיות בשימוש](#טכנולוגיות-בשימוש)
6. [שאלות ראיון נפוצות](#שאלות-ראיון-נפוצות)
7. [התקנה והטמעה](#התקנה-והטמעה)
8. [מדריך פתרון בעיות](#מדריך-פתרון-בעיות)
9. [מושגים חשובים](#מושגים-חשובים)
10. [רשימת בדיקה לסקירה](#רשימת-בדיקה-לסקירה)

---

## סקירה מהירה

### מה הפרויקט הזה?
מערכת Change Data Capture (CDC) בזמן אמת שעושה:
- **תפיסה** של שינויים בצורת דטא מ-TiDB מיידית
- **הזרמה** שלהם דרך Kafka
- **עיבוד** שלהם בצרכן Node.js
- **שמירה** של האירועים ב-Elasticsearch
- **ניטור** עם מדדי Prometheus
- **ויזואליזציה** דרך לוחות Grafana

### למה זה משמעותי?
- **תובנות בזמן אמת** של שינויים במסד הנתונים
- **רישום ביקורת מלא** של כל שינוי
- **ניטור ביצועים** עם מדדים
- **שקיפות בציוד ארגוני**

---

## הסבר הארכיטקטורה

### ארכיטקטורה של המערכת (ויזואלית)

```
┌─────────────────┐
│     TiDB        │  ← מסד נתונים תואם MySQL
│   (Database)    │     • אחסון נתונים של היישום
└────────┬────────┘
         │ שינויים (INSERT/UPDATE/DELETE)
         ▼
┌─────────────────┐
│    TiCDC        │  ← מנוע CDC
│  (Capture)      │     • צופה בקובץ עסקאות
│                 │     • המרה ל-Canal JSON
└────────┬────────┘
         │ אירועים (פורמט Canal JSON)
         ▼
┌─────────────────┐
│     Kafka       │  ← מתווך הודעות
│   (Queue)       │     • משלוח אמין
│  Topic: tidb-cdc│     • ניתוק producer/consumer
└────────┬────────┘
         │ הודעות
         ▼
┌─────────────────┐
│  Node.js        │  ← שירות צרכן
│  Consumer       │     • ניתוח הודעות
│                 │     • אינדקס ל-ES
│                 │     • חשיפת מדדים
└────────┬────────┘
         │
         ├─────────────────────┬──────────────────┐
         │                     │                  │
         ▼                     ▼                  ▼
    ┌─────────────┐    ┌──────────────┐   ┌─────────────┐
    │Elasticsearch│    │ Prometheus   │   │  Consumer   │
    │  (חיפוש)    │    │ (מדדים)      │   │   Metrics   │
    │ אינדקס:    │    │ אחסון        │   │  Endpoint   │
    │ cdc-events  │    │              │   │  :3000      │
    └──────┬──────┘    └────────┬─────┘   └─────────────┘
           │                    │
           └────────┬───────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
    ┌─────────────┐    ┌──────────────┐
    │   Kibana    │    │   Grafana    │
    │ (חקירה)     │    │ (לוחות בקרה)│
    │             │    │              │
    │ חיפוש UI    │    │ • טבלה      │
    │ לאירועים    │    │ • תרשים עוגה│
    └─────────────┘    └──────────────┘
```

### רכיבי המערכת

| רכיב | תפקיד | למה? |
|------|-------|------|
| **TiDB** | מסד נתונים | מפוזר, תואם MySQL |
| **TiCDC** | מנוע CDC | תפיסת שינויים בזמן אמת |
| **Kafka** | תור הודעות | חלוקת אירועים אמינה |
| **Elasticsearch** | חיפוש/אחסון | חיפוש מלא-טקסט באירועים |
| **Prometheus** | מסד נתונים מדדים | אסיפת מדדי סדרות זמן |
| **Grafana** | לוחות בקרה | ויזואליזציה של מדדים ואירועים |
| **צרכן Node.js** | עיבוד | גשר בין Kafka ל-ES/Prometheus |

---

## עומק בכל רכיב

### 1. TiDB (שכבת מסד הנתונים)

**מה זה:**
- מסד נתונים SQL מפוזר
- תואם MySQL (ניתן להשתמש בלקוחות MySQL)
- בנוי על ידי PingCAP

**בפרויקט זה:**
- אחסון נתונים של יישום (טבלת users)
- כל שינוי נתפס על ידי TiCDC
- תורים טבעיים באופן אוטומטי עם סכימה

**נקודות משמעותיות:**
```
חיבור: mysql -h localhost -P 4000 -uroot appdb
מסד נתונים: appdb
טבלה: users (id, username, password, email, created_at)
משתמש ברירת מחדל: almog/Aa123456
```

---

### 2. TiCDC (מנוע CDC)

**מה זה:**
- מנוע Change Data Capture בזמן אמת
- חלק מאקוסיסטם TiDB
- צופה בקובץ עסקאות לשינויים

**איך זה עובד:**
```
1. ניטור של קובץ עסקאות TiDB
2. גילוי פעולות INSERT/UPDATE/DELETE
3. המרה לפורמט CDC (Canal JSON)
4. שליחה אל sink (Kafka במקרה שלנו)
```

**בפרויקט זה:**
- מוגדר כשירות על פורט 8300
- מוגדר זרם: `cf-kafka`
- sink: `kafka://kafka:9092/tidb-cdc?protocol=canal-json`
- נוצר באופן אוטומטי בהפעלה דרך שירות cdc-task

**נקודות קצה של API:**
```
GET  http://localhost:8300/api/v1/changefeeds          # רשימת זרמים
POST http://localhost:8300/api/v1/changefeeds          # יצירת זרם
GET  http://localhost:8300/api/v1/changefeeds/{id}     # קבלת ספציפיק
```

---

### 3. Apache Kafka (תור הודעות)

**מה זה:**
- מתווך הודעות מפוזר
- ניתוק producers מ-consumers
- משמור משלוח לפחות פעם אחת

**בפרויקט זה:**
- נושא: `tidb-cdc`
- פורמט: הודעות Canal JSON
- מחיצות: 1 (broker יחיד)
- TiCDC → Producer, Consumer → Subscriber

**זרם הודעות:**
```
TiCDC כותב → נושא Kafka (tidb-cdc) → צרכן קורא
```

**למה Kafka?**
- ✅ משלוח אמין (עמידות)
- ✅ ניתוק מערכות (צימוד רופף)
- ✅ ניתן להרחיב (יכול להוסיף brokers)
- ✅ מהיר (תפוקה גבוהה)

---

### 4. יישום צרכן Node.js

**מה זה עושה:**
```
1. התחברות ל-Kafka broker
2. הנתיכה ל-tidb-cdc topic
3. ניתוח כל אירוע CDC
4. אינדקס ל-Elasticsearch
5. הגדלת מונה Prometheus
6. חשיפת נקודת קצה /metrics
```

**טכנולוגיות חשובות:**
- `kafkajs` - לקוח Kafka
- `@elastic/elasticsearch` - לקוח ES
- `prom-client` - מדדי Prometheus
- `express` - שרת HTTP עבור /metrics

**מדדים שנחשפים:**
```
cdc_events_total{table="users",op="insert"} 2
cdc_events_total{table="users",op="update"} 0
cdc_events_total{table="users",op="delete"} 0
```

**מסמכי Elasticsearch:**
```json
{
  "database": "appdb",
  "table": "users",
  "type": "insert",
  "ts_ms": 1700000000000,
  "data": {
    "id": 2,
    "username": "test-user",
    "password": "pass123",
    "email": "test@example.com",
    "created_at": "2025-11-15 16:36:17"
  },
  "@timestamp": "2025-11-15T16:36:17.000Z"
}
```

---

### 5. Elasticsearch (אחסון אירועים)

**מה זה:**
- מנוע חיפוש מלא-טקסט
- אחסון מסמכי JSON
- אינדקס לאחזור מהיר

**בפרויקט זה:**
- אינדקס: `cdc-events`
- אחסון כל אירועי CDC
- מספק חיפוש/סינון
- נתונים ממקור צרכן Node.js

**יכולות:**
- ✅ חיפוש מלא-טקסט
- ✅ סינון מורכב
- ✅ צבירות
- ✅ ניתוח

---

### 6. Prometheus (מסד נתונים מדדים)

**מה זה:**
- מסד נתונים סדרות זמן מדדים
- משיכה-מבוססת (מגרדות נקודות קצה /metrics)
- שמירה: 15 ימים כברירת מחדל

**בפרויקט זה:**
- גרדות consumer:3000/metrics כל 10 שניות
- אחסון מדדים עם תוויות (ממדים)
- אפשרות ניתוח סדרות זמן

**מדד משמעותי:**
```
cdc_events_total
  ├─ תווית: table (שם הטבלה)
  └─ תווית: op (סוג פעולה: insert/update/delete)
```

**שאילתות PromQL:**
```
cdc_events_total                    # כל אירועים
cdc_events_total{table="users"}     # רק טבלת users
cdc_events_total{op="insert"}       # רק inserts
rate(cdc_events_total[1m])          # אירועים לדקה
```

---

### 7. Grafana (לוחות בקרה)

**מה זה:**
- כלי ויזואליזציה לוח בקרה
- התחברות למספר sources של נתונים
- תמיכה בהפקה אוטומטית

**בפרויקט זה:**
- הגדרה אוטומטית של sources (Prometheus, Elasticsearch)
- הפקה אוטומטית של לוח בקרה מ-JSON
- לוח בקרה: "TiDB CDC Monitoring"

**פנלים בלוח בקרה:**

**פנל 1: טבלת אירועים (מ-Elasticsearch)**
```
מציג:
- database, table, type (פעולה), timestamp, data
- אירועי CDC גולמיים בטבלה
- רענון אוטומטי כל 30 שניות
```

**פנל 2: תרשים עוגה פעולות (מ-Prometheus)**
```
מציג:
- התפלגות INSERT/UPDATE/DELETE
- חלון זמן: 1 שעה
- עדכונים בזמן אמת
- הצגה של התפלגות אחוזים
```

---

## איך הנתונים זורמים

### דוגמה שלב-אחר-שלב: הוספת משתמש

```
1️⃣  פעולה משתמש
    משתמש/יישום מבצע SQL:
    INSERT INTO users VALUES (...)

2️⃣  TiDB מקבל
    TiDB כותב ל-RocksDB
    עסקאה מתועדת

3️⃣  TiCDC גילוי
    TiCDC מנטר את הקובץ
    רואה פעולת INSERT
    המרה לפורמט Canal JSON

4️⃣  Kafka מקבל
    TiCDC מפרסם ל-Kafka
    נושא: tidb-cdc
    הודעה מעוברת בתור באופן אמין

5️⃣  צרכן קורא
    צרכן Node.js משיכת הודעה
    ניתוח מטענת JSON
    חילוץ: database, table, op, data

6️⃣  אינדקס Elasticsearch
    צרכן שולח ל-ES
    אינדקס: cdc-events
    מסמך מאוחסן וניתן לחיפוש

7️⃣  עדכון Prometheus
    צרכן הגדלת מונה:
    cdc_events_total{table="users",op="insert"}++
    מדד כעת = 2 (אם היה 1)

8️⃣  Prometheus גרידה
    כל 10 שניות, מגרדת :3000/metrics
    אחסון ערך מדד חדש
    יצירת נקודת נתונים סדרות זמן

9️⃣  Grafana שאילתה
    טבלה פנל: שאילתה ES
    פנל תרשים עוגה: שאילתה Prometheus
    לוחות בקרה רענון כל 30 שניות

🔟 משתמש רואה
    לוח בקרה Grafana מציג:
    ✓ אירוע חדש בטבלה
    ✓ תרשים עוגה עודכן (count insert +1)
```

---

## טכנולוגיות בשימוש

### מסד נתונים & CDC
- **TiDB v6.5.0** - מסד נתונים SQL מפוזר
- **TiKV v6.5.0** - מנוע אחסון
- **PD v6.5.0** - מתאמן מיקום (מתאמן אשכול)
- **TiCDC v6.5.0** - מנוע CDC

### תור הודעות
- **Apache Kafka v7.6.1** - תווך הודעות
- **Zookeeper v7.6.1** - שירות קואורדינציה

### עיבוד נתונים
- **Node.js 18** - יישום צרכן
- **kafkajs 2.2.4** - לקוח Kafka
- **@elastic/elasticsearch 8.14.0** - לקוח ES
- **prom-client 15.1.3** - מדדי Prometheus

### אחסון & חיפוש
- **Elasticsearch v8.7.0** - חיפוש מלא-טקסט ואחסון
- **Kibana v8.7.0** - ויזואליזציה ES

### ניטור & ויזואליזציה
- **Prometheus v2.54.0** - מסד נתונים מדדים
- **Grafana v11.0.0** - לוחות בקרה

### ניהול קונטיינרים
- **Docker** - התכלול
- **Docker Compose** - ניהול (כל השירותים)

---

## שאלות ראיון נפוצות

### שאלה 1: למה להשתמש ב-CDC במקום בסקירה (polling)?

**תשובה:**
```
CDC (Change Data Capture):
✓ בזמן אמת (תופעל חלק ממילישניות)
✓ ללא עומס מסד נתונים מסקירה
✓ תפיסה כל שינויים (אין אירועים שהוחמצו)
✓ שימוש משאבים נמוך יותר
✓ סמנטיקה של בדיוק-פעם אחת או לפחות-פעם אחת

סקירה:
✗ תופעה (בהתאם לאינטרוול הבדיקה)
✗ עומס מסד נתונים
✗ יכול להחמיץ שינויים אם האינטרוול ארוך מדי
✗ שימוש CPU/רשת גבוה
✗ לא אמין לנתונים קריטיים
```

---

### שאלה 2: למה Kafka במקום Elasticsearch ישיר?

**תשובה:**
```
Kafka מספק:
✓ חיץ - טיפול בקפיצות תעבורה
✓ ניתוק - ES יכול להיות למטה, הודעות בתור
✓ ניתן להשמיט - יכול לעבד מחדש אירועים
✓ צרכנים מרובים - מערכות שונות יכולות לצרוך
✓ עמידות - הודעות מתמשכות
✓ ניתן להרחיב - הוסף מחיצות לתפוקה

חיבור ישיר:
✗ ללא חיץ (אובדן נתונים אם ES למטה)
✗ צימוד הדוק (קשה לשנות מערכות)
✗ ללא ניתן להשמיט
✗ דפוס צרכן יחיד
```

---

### שאלה 3: מה צרכן Node.js עושה?

**תשובה:**
```
אחריות צרכן:
1. התחברות ל-Kafka
2. הנתיכה ל-tidb-cdc topic
3. ניתוח פורמט Canal JSON
4. טרנספורמציה נתונים (הוסף @timestamp, וכו')
5. אינדקס ל-Elasticsearch
6. הגדלת מונה Prometheus
7. חשיפת נקודת קצה /metrics
8. טיפול בשגיאות וחזרות
```

---

### שאלה 4: איך מדדים מתויגים ב-Prometheus?

**תשובה:**
```
מדד: cdc_events_total
תוויות מספקות ממדים:
  - table: "users", "orders", "products", וכו'
  - op: "insert", "update", "delete"

ערכי דוגמה:
  cdc_events_total{table="users",op="insert"} 5
  cdc_events_total{table="users",op="update"} 2
  cdc_events_total{table="orders",op="insert"} 3

יתרונות:
✓ סינון לפי טבלה
✓ סינון לפי פעולה
✓ שילוב (sum, rate, וכו')
✓ סדרות זמן נפרדות
```

---

### שאלה 5: מה ההבדל בין Elasticsearch ל-Prometheus?

**תשובה:**
```
ELASTICSEARCH:
- אחסון: מסמכי אירוע מלאים (JSON)
- תכלית: חיפוש, חקירת יומנים, ביקורת
- שאילתה: סינון מורכב (Kibana)
- אינדקס: כל שדה מאינדקס
- שימוש: שאלות "מה קרה?"

PROMETHEUS:
- אחסון: מדדי סדרות זמן (מספרים)
- תכלית: ניטור, התראות
- שאילתה: PromQL (שאילתות סדרות זמן)
- שמירה: נתונים סדרות זמן (15 ימים כברירת מחדל)
- שימוש: שאלות "כמה?" (rate, count, וכו')
```

---

### שאלה 6: איך הזרם מתורים בעצם אוטומטית?

**תשובה:**
```
תהליך:
1. docker-compose מתחיל שירות cdc-task
2. cdc-task חוכה 45 שניות (לרעדות TiCDC)
3. מבצע סקריפט db/cdc-init.sh
4. סקריפט POST ל-http://ticdc:8300/api/v1/changefeeds
5. המטען כולל:
   - changefeed_id: "cf-kafka"
   - sink_uri: "kafka://kafka:9092/tidb-cdc?protocol=canal-json"
   - start_ts: 0 (מתחילה)
6. TiCDC יוצר זרם
7. מתחיל לתפוס שינויים מיד
```

---

### שאלה 7: מה קורה אם צרכן מתרסק?

**תשובה:**
```
תרחיש: צרכן Node.js מתרסק

ציר הזמן:
1. TiCDC ממשיך לכתוב ל-Kafka (לא מושפע)
2. הודעות מצטברות בנושא Kafka
3. צרכן קבוצת offset חודל מתקדם
4. צרכן חוזר למעלה
5. התחבר מחדש ל-Kafka
6. חוזר מהאחרון מוגדר offset
7. מעבד מצטבר הודעות
8. תופס הזמן הנוכחי

תוצאה: ללא אובדן נתונים! (משלוח לפחות-פעם אחת)
```

---

## התקנה והטמעה

### דרישות מוקדמות
- Docker & Docker Compose מותקנות
- 4GB RAM זמינה
- יציאות זמינות: 2181, 2379, 3000-3001, 4000, 5601, 8300, 9090-9092, 9200

### הפעלה בפקודה אחת
```bash
docker-compose up --build
```

### מה קורה באופן אוטומטי
```
1. יצירת רשת Docker backend
2. התחלת אשכול TiDB (PD, TiKV, TiDB)
3. התחלת שירות TiCDC
4. תורים של מסד נתונים (סכימה + משתמש ביד)
5. יצירת זרם CDC
6. התחלת Kafka + Zookeeper
7. התחלת יישום צרכן
8. התחלת Elasticsearch + Kibana
9. התחלת Prometheus
10. התחלת Grafana עם לוחות בקרה
```

### ציר זמן
```
00:00 - docker-compose up --build
00:30 - אשכול TiDB מוכן
01:00 - מסד נתונים תורים
01:30 - זרם תפיסת, לוכד אירועים
02:00 - צרכן מחובר, שומע ל-Kafka
02:30 - כל השירותים בריאים
03:00 - לוחות בקרה נגישים
```

### נקודות גישה לאחר הפעלה
```
מסד נתונים TiDB:
  mysql -h 127.0.0.1 -P 4000 -uroot appdb

Grafana (לוחות בקרה):
  http://localhost:3001
  משתמש: admin, סיסמה: admin

Kibana (מחקר אירוע):
  http://localhost:5601

Prometheus (חוקר מדדים):
  http://localhost:9090

מדדי צרכן:
  http://localhost:3000/metrics

סטטוס TiCDC:
  curl http://localhost:8300/api/v1/changefeeds
```

---

## מדריך פתרון בעיות

### בעיה: שירותים לא מתחילים

**סימפטום:** Docker Compose תלוי או נכשל

**פתרון:**
```bash
# בדוק דמון Docker
docker ps

# בדוק יומנים
docker-compose logs

# הפעל מחדש עם מצב נקי
docker-compose down -v
docker-compose up --build
```

---

### בעיה: אירועי CDC לא מופיעים

**סימפטום:** Elasticsearch ריק, מדדי Prometheus לא גדלים

**פתרון:**
```bash
# בדוק סטטוס זרם
curl http://localhost:8300/api/v1/changefeeds

# בדוק נושא Kafka
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# הוסף נתונים בדיקה
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test', 'pass', 'test@example.com');"

# חכה 5 שניות, בדוק Elasticsearch
curl http://localhost:9200/cdc-events/_count
```

---

### בעיה: צרכן לא מקבל הודעות

**סימפטום:** הודעות Kafka לא מעובדות

**פתרון:**
```bash
# בדוק יומני צרכן
docker-compose logs consumer -f

# בדוק קישור Kafka
docker-compose exec consumer nc -zv kafka 9092

# בדוק קבוצת צרכן
docker-compose exec kafka kafka-consumer-groups \
  --list --bootstrap-server localhost:9092
```

---

### בעיה: אינדקס Elasticsearch ריק

**סימפטום:** Kibana מציג אל אירועים

**פתרון:**
```bash
# בדוק בריאות ES
curl http://localhost:9200/_health

# בדוק אינדקס
curl http://localhost:9200/cdc-events

# הוסף נתונים בדיקה
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test2', 'pass', 'test2@example.com');"

# חכה 5 שניות, בדוק שוב
curl http://localhost:9200/cdc-events/_search
```

---

### בעיה: לוח בקרה Grafana לא טוען

**סימפטום:** לוח בקרה ריק או חסר

**פתרון:**
```bash
# בדוק יומני Grafana
docker-compose logs grafana

# אימות sources
curl http://localhost:3001/api/datasources

# הפעל מחדש Grafana
docker-compose restart grafana

# חכה 30 שניות, רענן דפדפן
```

---

## מושגים חשובים

### בזמן אמת לעומת קרוב-לזמן אמת
```
בזמן אמת: תופעל מיקרו-שניות עד מילישניות
- מערכת שלנו: ~100-500ms (מקובל לרוב המקרים)
- CDC תופס מיד
- Kafka תור באופן מיידי
- צרכן מעבד בתוך שניות
```

### משלוח לפחות-פעם אחת
```
ערובה: כל הודעה מעובדת לפחות פעם אחת
- Kafka עמידות + צרכן offset tracking
- צרכן יכול לעבד אותה הודעה פעמיים (פעולות אידמפוטנטיות)
- ללא אובדן נתונים
- לעומת "בדיוק-פעם אחת" (קשה יותר להשיג)
```

### ממדים לעומת מדדים
```
מדדים: מספרים (מונים, מדדים, היסטוגרמות)
  - cdc_events_total = 5

ממדים: תוויות שפורקות מדדים
  - cdc_events_total{table="users",op="insert"} = 3
  - cdc_events_total{table="users",op="update"} = 2

יתרונות:
✓ ניתוח רב-ממדי
✓ סינון גמיש
✓ תובנות טובות יותר
```

### Sink לעומת Source
```
Source: המקום שנתונים באו
  - TiDB הוא ה-source

Sink: המקום שנתונים הולכים
  - Kafka הוא ה-sink (מנקודת CDC)
  - Elasticsearch הוא ה-sink (מנקודת צרכן)
  - Prometheus הוא ה-sink (מנקודת צרכן)
```

---

## רשימת בדיקה לסקירה

### לפני הסקירה הפיזית:

#### הבנת המערכת
- [ ] יכול להסביר ארכיטקטורה מזיכרון
- [ ] יכול לצייר דיאגרמת זרם נתונים
- [ ] הבנה של כל תפקיד רכיב
- [ ] ידיעה למה בחרנו בכל טכנולוגיה

#### פרטים טכניים
- [ ] ידיעה של נקודות קצה TiCDC API
- [ ] הבנה של תצורת זרם
- [ ] ידיעה של מבנה מדד Prometheus
- [ ] הבנה של אינדקס Elasticsearch

#### ידע מעשי
- [ ] יכול להתחיל מערכת עם docker-compose up
- [ ] יכול להוסיף נתונים בדיקה ולאמת זרם
- [ ] יכול לבדוק אירועי Elasticsearch
- [ ] יכול לצפות במדדי Prometheus
- [ ] יכול לפרש לוח בקרה Grafana

#### פתרון בעיות
- [ ] ידיעה כיצד לבדוק יומני שירות
- [ ] ידיעה כיצד לאמת קישור
- [ ] יכול לזהות בעיות נפוצות
- [ ] ידיעה כיצד להפעיל מחדש שירותים

#### מושגים
- [ ] הבנה של קונספט CDC
- [ ] הבנה של יתרונות תור הודעות
- [ ] הבנה של מדדים לעומת יומנים
- [ ] הבנה של הפקה אוטומטית

#### פרטי ביצוע
- [ ] ידיעה של סכימת מסד נתונים
- [ ] ידיעה של זרם יישום צרכן
- [ ] ידיעה של תלות Docker Compose
- [ ] ידיעה של מיקום קובצי תצורה

---

## עזר שדיר

### הפניה פקודה

**התחל מערכת:**
```bash
docker-compose up --build
```

**עצור מערכת:**
```bash
docker-compose down
```

**צפה בזומנים:**
```bash
docker-compose logs [service-name]
docker-compose logs consumer -f  # Follow consumer
```

**התחבר למסד נתונים:**
```bash
docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb
```

**הוסף נתונים בדיקה:**
```bash
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test', 'pass', 'test@example.com');"
```

**בדוק Elasticsearch:**
```bash
curl http://localhost:9200/cdc-events/_count
curl http://localhost:9200/cdc-events/_search?size=5
```

**בדוק מדדי Prometheus:**
```bash
curl http://localhost:3000/metrics | grep cdc_events_total
```

**בדוק זרם:**
```bash
curl http://localhost:8300/api/v1/changefeeds
```

---

## לקיחות משמעותיות

✅ **CDC בזמן אמת** תופס שינויים מסד נתונים מיד  
✅ **Kafka** משמור משלוח אמין, ניתוק מערכות  
✅ **יישום צרכן** גשר Kafka עם אחסון וניטור  
✅ **Elasticsearch** אחסון אירוע חיפוש  
✅ **Prometheus** עקבות מדדים פעילים  
✅ **Grafana** ויזואליזציה תובנות בזמן אמת  
✅ **Docker Compose** ניהול 12 שירותים בפקודה אחת  
✅ **אוטומציה מלאה** - אין צעדים ידניים נדרשים  

---

## טיפים למידה לסקירה

1. **הבן לא זכור** - דע קונספטים, לא פקודות בדיוק
2. **תרגל הזרם** - הוסף נתונים, צפה בהפצה דרך מערכת
3. **דע את ה"למה"** - למה Kafka? למה Elasticsearch? למה CDC?
4. **צפה למעקבות** - היה מוכן להסביר החלטות ארכיטקטורה
5. **אמת דוגמאות** - "מה קורה כאשר...?" תרחישים
6. **דע מגבלות** - מה היית משנה? איך היית מרחיב?
7. **תעד החלטות** - היה מוכן להסביר בחירות ביצוע

---

**בהצלחה בסקירה שלך! בנית משהו מרשים! 🚀**

---

*נוצר: 2025-11-15*  
*מחבר: Almog Nachshon*  
*עבור: למידה והכנה סקירה*
