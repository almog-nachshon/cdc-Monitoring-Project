# CDC Monitoring Solution - Learning Guide (English)

**Author:** Almog Nachshon  
**Date:** November 15, 2025  
**Project:** TiDB CDC Monitoring Ecosystem

---

## TABLE OF CONTENTS

1. [Quick Overview](#quick-overview)
2. [Architecture Explained](#architecture-explained)
3. [Key Components Deep Dive](#key-components-deep-dive)
4. [How Data Flows](#how-data-flows)
5. [Technologies Used](#technologies-used)
6. [Common Interview Questions](#common-interview-questions)
7. [Setup & Deployment](#setup--deployment)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Important Concepts](#important-concepts)
10. [Review Preparation Checklist](#review-preparation-checklist)

---

## QUICK OVERVIEW

### What is this project?
A real-time Change Data Capture (CDC) monitoring system that:
- **Captures** database changes from TiDB instantly
- **Streams** them through Kafka
- **Processes** them in a Node.js consumer
- **Stores** events in Elasticsearch
- **Monitors** with Prometheus metrics
- **Visualizes** via Grafana dashboards

### Why does it matter?
- **Real-time insights** into database changes
- **Complete audit trail** of all modifications
- **Performance monitoring** with metrics
- **Enterprise-grade observability**

---

## ARCHITECTURE EXPLAINED

### System Architecture (Visual)

```
┌─────────────────┐
│     TiDB        │  ← MySQL-compatible database
│   (Database)    │     • Stores application data
└────────┬────────┘
         │ Changes (INSERT/UPDATE/DELETE)
         ▼
┌─────────────────┐
│    TiCDC        │  ← CDC Engine
│  (Capture)      │     • Watches transaction log
│                 │     • Converts to Canal JSON
└────────┬────────┘
         │ Events (Canal JSON format)
         ▼
┌─────────────────┐
│     Kafka       │  ← Message Broker
│   (Queue)       │     • Reliable delivery
│  Topic: tidb-cdc│     • Decouples producer/consumer
└────────┬────────┘
         │ Messages
         ▼
┌─────────────────┐
│  Node.js        │  ← Consumer Service
│  Consumer       │     • Parses messages
│                 │     • Indexes to ES
│                 │     • Exposes metrics
└────────┬────────┘
         │
         ├─────────────────────┬──────────────────┐
         │                     │                  │
         ▼                     ▼                  ▼
    ┌─────────────┐    ┌──────────────┐   ┌─────────────┐
    │Elasticsearch│    │ Prometheus   │   │  Consumer   │
    │  (Search)   │    │  (Metrics)   │   │   Metrics   │
    │ Index:      │    │ Storage      │   │  Endpoint   │
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
    │  (Explore)  │    │ (Dashboard)  │
    │             │    │              │
    │ Search UI   │    │ • Table      │
    │ for Events  │    │ • Pie Chart  │
    └─────────────┘    └──────────────┘
```

### System Components

| Component | Role | Why? |
|-----------|------|------|
| **TiDB** | Database | Distributed, MySQL-compatible |
| **TiCDC** | CDC Engine | Captures changes in real-time |
| **Kafka** | Message Queue | Reliable event distribution |
| **Elasticsearch** | Search/Storage | Full-text search on events |
| **Prometheus** | Metrics DB | Time-series metrics collection |
| **Grafana** | Dashboards | Visualize metrics & events |
| **Node.js Consumer** | Processor | Bridge between Kafka and ES/Prometheus |

---

## KEY COMPONENTS DEEP DIVE

### 1. TiDB (Database Layer)

**What it is:**
- Distributed SQL database
- MySQL-compatible (can use MySQL clients)
- Built by PingCAP

**In this project:**
- Stores application data (users table)
- Every change is captured by TiCDC
- Initialized automatically with schema

**Key points:**
```
Connection: mysql -h localhost -P 4000 -uroot appdb
Database: appdb
Table: users (id, username, password, email, created_at)
Default user: almog/Aa123456
```

---

### 2. TiCDC (CDC Engine)

**What it is:**
- Real-time Change Data Capture engine
- Part of TiDB ecosystem
- Watches transaction log for changes

**How it works:**
```
1. Monitor TiDB transaction log
2. Detect INSERT/UPDATE/DELETE operations
3. Convert to CDC format (Canal JSON)
4. Send to sink (Kafka in our case)
```

**In this project:**
- Configured as service on port 8300
- Changefeed: `cf-kafka`
- Sink: `kafka://kafka:9092/tidb-cdc?protocol=canal-json`
- Auto-created on startup via cdc-task service

**API Endpoints:**
```
GET  http://localhost:8300/api/v1/changefeeds          # List changefeeds
POST http://localhost:8300/api/v1/changefeeds          # Create changefeed
GET  http://localhost:8300/api/v1/changefeeds/{id}     # Get specific
```

---

### 3. Apache Kafka (Message Queue)

**What it is:**
- Distributed message broker
- Decouples producers from consumers
- Ensures at-least-once delivery

**In this project:**
- Topic: `tidb-cdc`
- Format: Canal JSON messages
- Partitions: 1 (single broker)
- TiCDC → Producer, Consumer → Subscriber

**Message flow:**
```
TiCDC writes → Kafka topic (tidb-cdc) → Consumer reads
```

**Why Kafka?**
- ✅ Reliable delivery (durability)
- ✅ Decouples systems (loose coupling)
- ✅ Scalable (can add brokers)
- ✅ Fast (high throughput)

---

### 4. Node.js Consumer Application

**What it does:**
```
1. Connects to Kafka broker
2. Subscribes to tidb-cdc topic
3. Parses each CDC event
4. Indexes to Elasticsearch
5. Increments Prometheus counter
6. Exposes /metrics endpoint
```

**Key Technologies:**
- `kafkajs` - Kafka client
- `@elastic/elasticsearch` - ES client
- `prom-client` - Prometheus metrics
- `express` - HTTP server for /metrics

**Metrics Exported:**
```
cdc_events_total{table="users",op="insert"} 2
cdc_events_total{table="users",op="update"} 0
cdc_events_total{table="users",op="delete"} 0
```

**Elasticsearch Documents:**
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

### 5. Elasticsearch (Event Storage)

**What it is:**
- Full-text search engine
- Stores JSON documents
- Indexes for fast retrieval

**In this project:**
- Index: `cdc-events`
- Stores all CDC events
- Provides search/filtering
- Data sourced from Node.js Consumer

**Capabilities:**
- ✅ Full-text search
- ✅ Complex filtering
- ✅ Aggregations
- ✅ Analytics

---

### 6. Prometheus (Metrics Database)

**What it is:**
- Time-series metrics database
- Pull-based (scrapes /metrics endpoints)
- Retention: 15 days by default

**In this project:**
- Scrapes consumer:3000/metrics every 10 seconds
- Stores metrics with labels (dimensions)
- Enables time-series analysis

**Key Metric:**
```
cdc_events_total
  ├─ Label: table (table name)
  └─ Label: op (operation type: insert/update/delete)
```

**PromQL Queries:**
```
cdc_events_total                    # All events
cdc_events_total{table="users"}     # Only users table
cdc_events_total{op="insert"}       # Only inserts
rate(cdc_events_total[1m])          # Events per minute
```

---

### 7. Grafana (Dashboards)

**What it is:**
- Dashboard visualization tool
- Connects to multiple datasources
- Auto-provisioning support

**In this project:**
- Auto-configures datasources (Prometheus, Elasticsearch)
- Auto-provisions dashboard from JSON
- Dashboard: "TiDB CDC Monitoring"

**Dashboard Panels:**

**Panel 1: Event Table (from Elasticsearch)**
```
Shows:
- database, table, type (operation), timestamp, data
- Raw CDC events as table
- Auto-refreshes every 30 seconds
```

**Panel 2: Operation Pie Chart (from Prometheus)**
```
Shows:
- Breakdown of INSERT/UPDATE/DELETE
- Time window: 1 hour
- Updates in real-time
- Shows percentage distribution
```

---

## HOW DATA FLOWS

### Step-by-Step Example: Insert a User

```
1️⃣  USER ACTION
    User/App executes SQL:
    INSERT INTO users VALUES (...)

2️⃣  TIDB ACCEPTS
    TiDB writes to RocksDB
    Transaction logged

3️⃣  TICDC DETECTS
    TiCDC monitors log
    Sees INSERT operation
    Converts to Canal JSON format

4️⃣  KAFKA RECEIVES
    TiCDC publishes to Kafka
    Topic: tidb-cdc
    Message queued reliably

5️⃣  CONSUMER READS
    Node.js consumer pulls message
    Parses JSON payload
    Extracts: database, table, op, data

6️⃣  ELASTICSEARCH INDEXES
    Consumer sends to ES
    Index: cdc-events
    Document stored & searchable

7️⃣  PROMETHEUS UPDATES
    Consumer increments counter:
    cdc_events_total{table="users",op="insert"}++
    Metric now = 2 (if was 1)

8️⃣  PROMETHEUS SCRAPES
    Every 10 seconds, scrapes :3000/metrics
    Stores new metric value
    Creates time-series datapoint

9️⃣  GRAFANA QUERIES
    Table Panel: queries ES
    Pie Chart Panel: queries Prometheus
    Dashboards refresh every 30 seconds

🔟 USER SEES
    Grafana Dashboard shows:
    ✓ New event in table
    ✓ Pie chart updated (insert count +1)
```

---

## TECHNOLOGIES USED

### Database & CDC
- **TiDB v6.5.0** - Distributed SQL database
- **TiKV v6.5.0** - Storage engine
- **PD v6.5.0** - Placement driver (cluster coordinator)
- **TiCDC v6.5.0** - CDC engine

### Message Queue
- **Apache Kafka v7.6.1** - Message broker
- **Zookeeper v7.6.1** - Coordination service

### Data Processing
- **Node.js 18** - Consumer application
- **kafkajs 2.2.4** - Kafka client
- **@elastic/elasticsearch 8.14.0** - ES client
- **prom-client 15.1.3** - Prometheus metrics

### Storage & Search
- **Elasticsearch v8.7.0** - Full-text search & storage
- **Kibana v8.7.0** - ES visualization

### Monitoring & Visualization
- **Prometheus v2.54.0** - Metrics database
- **Grafana v11.0.0** - Dashboards

### Container Orchestration
- **Docker** - Containerization
- **Docker Compose** - Orchestration (all services)

---

## COMMON INTERVIEW QUESTIONS

### Q1: Why use CDC instead of polling?

**Answer:**
```
CDC (Change Data Capture):
✓ Real-time (milliseconds latency)
✓ No database load from polling
✓ Captures all changes (no missed events)
✓ Lower resource usage
✓ Exactly-once or at-least-once semantics

Polling:
✗ Latency (check interval based)
✗ Database overhead
✗ Can miss changes if interval too long
✗ High CPU/network usage
✗ Not reliable for critical data
```

---

### Q2: Why Kafka instead of direct Elasticsearch?

**Answer:**
```
Kafka provides:
✓ Buffering - Handle traffic spikes
✓ Decoupling - ES can be down, messages queued
✓ Replayability - Can reprocess events
✓ Multiple consumers - Different systems can consume
✓ Durability - Messages persisted
✓ Scalability - Add partitions for throughput

Direct connection:
✗ No buffering (data loss if ES down)
✗ Tight coupling (hard to change systems)
✗ No replayability
✗ Single consumer pattern
```

---

### Q3: What does the Node.js consumer do?

**Answer:**
```
Consumer responsibilities:
1. Connects to Kafka
2. Subscribes to tidb-cdc topic
3. Parses Canal JSON format
4. Transforms data (adds @timestamp, etc.)
5. Indexes to Elasticsearch
6. Increments Prometheus counter
7. Exposes /metrics endpoint
8. Handles errors & retries
```

---

### Q4: How are metrics labeled in Prometheus?

**Answer:**
```
Metric: cdc_events_total
Labels provide dimensions:
  - table: "users", "orders", "products", etc.
  - op: "insert", "update", "delete"

Example values:
  cdc_events_total{table="users",op="insert"} 5
  cdc_events_total{table="users",op="update"} 2
  cdc_events_total{table="orders",op="insert"} 3

Benefits:
✓ Filter by table
✓ Filter by operation
✓ Combine (sum, rate, etc.)
✓ Separate time series
```

---

### Q5: What's the difference between Elasticsearch and Prometheus?

**Answer:**
```
ELASTICSEARCH:
- Stores: Full event documents (JSON)
- Purpose: Search, log exploration, audit
- Query: Complex filtering (Kibana)
- Indexing: Every field indexed
- Use: "What happened?" questions

PROMETHEUS:
- Stores: Time-series metrics (numbers)
- Purpose: Monitoring, alerting
- Query: PromQL (time-series queries)
- Retention: Time-series data (15d default)
- Use: "How much?" questions (rate, count, etc.)
```

---

### Q6: How is the changefeed auto-created?

**Answer:**
```
Process:
1. docker-compose starts cdc-task service
2. cdc-task waits 45 seconds (for TiCDC readiness)
3. Executes db/cdc-init.sh script
4. Script POSTs to http://ticdc:8300/api/v1/changefeeds
5. Payload includes:
   - changefeed_id: "cf-kafka"
   - sink_uri: "kafka://kafka:9092/tidb-cdc?protocol=canal-json"
   - start_ts: 0 (from beginning)
6. TiCDC creates changefeed
7. Begins capturing changes immediately
```

---

### Q7: What happens if consumer crashes?

**Answer:**
```
Scenario: Node.js consumer crashes

Timeline:
1. TiCDC keeps writing to Kafka (unaffected)
2. Messages accumulate in Kafka topic
3. Consumer group offset stops advancing
4. Consumer comes back up
5. Reconnects to Kafka
6. Resumes from last committed offset
7. Processes backlog of messages
8. Catches up to current time

Result: No data loss! (at-least-once delivery)
```

---

### Q8: How does Docker Compose manage dependencies?

**Answer:**
```
Dependencies (depends_on):
- db-init waits for tidb
- cdc-task waits for ticdc, kafka, db-init
- consumer waits for kafka, elasticsearch
- grafana waits for prometheus, elasticsearch

Execution order:
1. PD starts (no deps)
2. TiKV starts (after PD ready)
3. TiDB starts (after PD, TiKV ready)
4. TiCDC starts (after TiDB ready)
5. db-init runs (after TiDB ready)
6. cdc-task runs (after all above ready)
7. Consumer starts (after Kafka ready)
8. Elasticsearch starts (no deps)
9. Kibana starts (after ES ready)
10. Prometheus starts (no deps)
11. Grafana starts (after Prometheus, ES ready)
```

---

### Q9: What is Canal JSON format?

**Answer:**
```
Canal JSON is CDC event format:

{
  "id": 0,
  "database": "appdb",
  "table": "users",
  "pkNames": ["id"],
  "isDDL": false,
  "type": "INSERT",
  "es": 1700000000000,
  "ts": 1700000000000,
  "sql": "",
  "data": [
    {
      "id": "2",
      "username": "test-user",
      "password": "pass123",
      "email": "test@example.com",
      "created_at": "2025-11-15 16:36:17"
    }
  ]
}

Fields:
- database: Source database
- table: Source table
- type: INSERT, UPDATE, DELETE, DDL
- data: Actual row data (array for bulk)
- pkNames: Primary key columns
- ts: Event timestamp (milliseconds)
```

---

### Q10: How does Grafana auto-provision?

**Answer:**
```
Auto-provisioning process:

1. Grafana starts
2. Reads grafana/provisioning/datasources/datasources.yml
   - Creates Prometheus datasource (http://prometheus:9090)
   - Creates Elasticsearch datasource (http://elasticsearch:9200)

3. Reads grafana/provisioning/dashboards/dashboards.yml
   - Points to folder containing JSON files

4. Loads grafana/provisioning/dashboards/cdc-dashboard.json
   - Creates "TiDB CDC Monitoring" dashboard
   - Configures panels with queries
   - Links panels to datasources

Result: Dashboard immediately available on http://localhost:3001
```

---

## SETUP & DEPLOYMENT

### Prerequisites
- Docker & Docker Compose installed
- 4GB RAM available
- Ports available: 2181, 2379, 3000-3001, 4000, 5601, 8300, 9090-9092, 9200

### Single Command Startup
```bash
docker-compose up --build
```

### What Happens Automatically
```
1. Creates backend Docker network
2. Starts TiDB cluster (PD, TiKV, TiDB)
3. Starts TiCDC service
4. Initializes database (schema + seed user)
5. Creates CDC changefeed
6. Starts Kafka + Zookeeper
7. Starts Consumer application
8. Starts Elasticsearch + Kibana
9. Starts Prometheus
10. Starts Grafana with dashboards
```

### Timeline
```
00:00 - docker-compose up --build
00:30 - TiDB cluster ready
01:00 - Database initialized
01:30 - Changefeed created, capturing events
02:00 - Consumer connected, listening to Kafka
02:30 - All services healthy
03:00 - Dashboards accessible
```

### Access Points After Startup
```
TiDB Database:
  mysql -h 127.0.0.1 -P 4000 -uroot appdb

Grafana (Dashboards):
  http://localhost:3001
  User: admin, Pass: admin

Kibana (Event Explorer):
  http://localhost:5601

Prometheus (Metrics Explorer):
  http://localhost:9090

Consumer Metrics:
  http://localhost:3000/metrics

TiCDC Status:
  curl http://localhost:8300/api/v1/changefeeds
```

---

## TROUBLESHOOTING GUIDE

### Issue: Services won't start

**Symptom:** Docker Compose hangs or fails

**Solution:**
```bash
# Check Docker daemon
docker ps

# Check logs
docker-compose logs

# Restart with clean state
docker-compose down -v
docker-compose up --build
```

---

### Issue: No CDC events appearing

**Symptom:** Elasticsearch empty, Prometheus metrics not increasing

**Solution:**
```bash
# Check changefeed status
curl http://localhost:8300/api/v1/changefeeds

# Check Kafka topic
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Insert test data
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test', 'pass', 'test@example.com');"

# Wait 5 seconds, check Elasticsearch
curl http://localhost:9200/cdc-events/_count
```

---

### Issue: Consumer not receiving messages

**Symptom:** Kafka messages not processed

**Solution:**
```bash
# Check consumer logs
docker-compose logs consumer -f

# Verify Kafka connectivity
docker-compose exec consumer nc -zv kafka 9092

# Check consumer group
docker-compose exec kafka kafka-consumer-groups \
  --list --bootstrap-server localhost:9092
```

---

### Issue: Elasticsearch index empty

**Symptom:** Kibana shows no events

**Solution:**
```bash
# Check ES health
curl http://localhost:9200/_health

# Check index
curl http://localhost:9200/cdc-events

# Insert test data
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test2', 'pass', 'test2@example.com');"

# Wait 5 seconds, check again
curl http://localhost:9200/cdc-events/_search
```

---

### Issue: Grafana dashboard not loading

**Symptom:** Dashboard blank or missing

**Solution:**
```bash
# Check Grafana logs
docker-compose logs grafana

# Verify datasources
curl http://localhost:3001/api/datasources

# Restart Grafana
docker-compose restart grafana

# Wait 30 seconds, refresh browser
```

---

## IMPORTANT CONCEPTS

### Real-time vs Near-real-time
```
Real-time: Microseconds to milliseconds latency
- Our system: ~100-500ms (acceptable for most use cases)
- CDC captures immediately
- Kafka queues instantly
- Consumer processes within seconds
```

### At-least-once Delivery
```
Guarantee: Every message processed at least once
- Kafka durability + consumer offset tracking
- Consumer might process same message twice (idempotent operations)
- No data loss
- vs "exactly-once" (harder to achieve)
```

### Dimensions vs Metrics
```
Metrics: Numbers (counters, gauges, histograms)
  - cdc_events_total = 5

Dimensions: Labels that break down metrics
  - cdc_events_total{table="users",op="insert"} = 3
  - cdc_events_total{table="users",op="update"} = 2

Benefits:
✓ Multi-dimensional analysis
✓ Flexible filtering
✓ Better insights
```

### Sink vs Source
```
Source: Where data comes FROM
  - TiDB is the source

Sink: Where data goes TO
  - Kafka is the sink (from CDC perspective)
  - Elasticsearch is the sink (from Consumer perspective)
  - Prometheus is the sink (from Consumer perspective)
```

---

## REVIEW PREPARATION CHECKLIST

### Before Your Physical Review:

#### System Understanding
- [ ] Can explain architecture from memory
- [ ] Can draw data flow diagram
- [ ] Understand each component's role
- [ ] Know why each technology was chosen

#### Technical Details
- [ ] Know TiCDC API endpoints
- [ ] Understand changefeed configuration
- [ ] Know Prometheus metric structure
- [ ] Understand Elasticsearch indexing

#### Hands-on Knowledge
- [ ] Can start system with docker-compose up
- [ ] Can insert test data and verify flow
- [ ] Can check Elasticsearch events
- [ ] Can view Prometheus metrics
- [ ] Can interpret Grafana dashboard

#### Troubleshooting
- [ ] Know how to check service logs
- [ ] Know how to verify connectivity
- [ ] Can identify common issues
- [ ] Know how to restart services

#### Concepts
- [ ] Understand CDC concept
- [ ] Understand message queue benefits
- [ ] Understand metrics vs logs
- [ ] Understand auto-provisioning

#### Implementation Details
- [ ] Know database schema
- [ ] Know consumer application flow
- [ ] Know Docker Compose dependencies
- [ ] Know configuration files locations

---

## QUICK REFERENCE

### Command Reference

**Start system:**
```bash
docker-compose up --build
```

**Stop system:**
```bash
docker-compose down
```

**View logs:**
```bash
docker-compose logs [service-name]
docker-compose logs consumer -f  # Follow consumer
```

**Connect to database:**
```bash
docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb
```

**Insert test data:**
```bash
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('test', 'pass', 'test@example.com');"
```

**Check Elasticsearch:**
```bash
curl http://localhost:9200/cdc-events/_count
curl http://localhost:9200/cdc-events/_search?size=5
```

**Check Prometheus metrics:**
```bash
curl http://localhost:3000/metrics | grep cdc_events_total
```

**Check changefeed:**
```bash
curl http://localhost:8300/api/v1/changefeeds
```

---

## KEY TAKEAWAYS

✅ **Real-time CDC** captures database changes instantly  
✅ **Kafka** ensures reliable, decoupled event streaming  
✅ **Consumer app** bridges Kafka with storage and monitoring  
✅ **Elasticsearch** provides searchable event storage  
✅ **Prometheus** tracks operational metrics  
✅ **Grafana** visualizes insights in real-time  
✅ **Docker Compose** orchestrates 12 services with one command  
✅ **Complete automation** - no manual steps needed  

---

## STUDY TIPS FOR REVIEW

1. **Understand not memorize** - Know concepts, not exact commands
2. **Practice the flow** - Insert data, watch it propagate through system
3. **Know the "why"** - Why Kafka? Why Elasticsearch? Why CDC?
4. **Expect follow-ups** - Be ready to explain architecture decisions
5. **Have examples ready** - "What happens when...?" scenarios
6. **Know limitations** - What would you change? How would you scale?
7. **Document your decisions** - Be ready to explain implementation choices

---

**Good luck with your review! You've built something impressive! 🚀**

---

*Created: 2025-11-15*  
*Author: Almog Nachshon*  
*For: Learning & Review Preparation*
