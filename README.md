# TiDB CDC Monitoring Stack – Complete Solution

**Author:** Almog Nachshon

> **A production-ready, real-time Change Data Capture (CDC) monitoring ecosystem built with Docker Compose**

This repository contains a complete, fully-functional CDC-based data pipeline demonstrating real-time data synchronization, event streaming, log aggregation, and metrics-driven monitoring. Everything runs locally with a single command and is ready for educational, testing, or production deployment.

## 🎯 Solution Overview

This solution demonstrates a modern data architecture pattern:

```
TiDB Database
     ↓ (CDC captures INSERT/UPDATE/DELETE)
TiCDC Change Stream
     ↓ (Canal-JSON format)
Kafka Message Queue
     ↓ (Consumer subscribes to tidb-cdc topic)
Node.js Consumer Service
     ├→ Elasticsearch (Event indexing)
     └→ Prometheus (Metrics exposure)
          ↓
Grafana Dashboards (Visualization)
Kibana (Event exploration)
Prometheus UI (Raw metrics)
```

## ⚡ Quick Start

```bash
# 1. Start the entire stack (all 12 services)
docker-compose up --build

# 2. Wait ~90 seconds for services to stabilize

# 3. Test with a sample insert
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb \
  -e "INSERT INTO users (username, password, email) VALUES ('test-user', 'pass123', 'test@example.com');"

# 4. Verify data flow
curl http://localhost:9200/cdc-events/_count        # Check Elasticsearch
curl http://localhost:3000/metrics | grep cdc_events_total  # Check Prometheus

# 5. Open dashboards
# Grafana:     http://localhost:3001 (admin/admin)
# Kibana:      http://localhost:5601
# Prometheus:  http://localhost:9090
```

---

## 1. Architecture Deep Dive

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         TiDB Cluster (v6.5.0)                   │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   PD    │  │  TiKV    │  │   TiDB      │  │   TiCDC     │   │
│  │:2379    │  │:20160    │  │:4000        │  │:8300        │   │
│  └─────────┘  └──────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ (POST http://ticdc:8300/api/v1/changefeeds)
                        │ Changefeed: cf-kafka
                        │ Sink: kafka://kafka:9092/tidb-cdc?protocol=canal-json
                        ▼
        ┌──────────────────────────────────┐
        │   Kafka Cluster (v7.6.1)         │
        │  ┌──────────────┐  ┌──────────┐ │
        │  │   Kafka      │  │Zookeeper │ │
        │  │ :9092        │  │:2181     │ │
        │  └──────────────┘  └──────────┘ │
        │  Topic: tidb-cdc (1 partition)  │
        │  Format: canal-json              │
        └──────────────────────────────────┘
                        │
                        │ (Consumer Group: tidb-cdc-consumer)
                        ▼
            ┌───────────────────────────┐
            │  Node.js Consumer          │
            │  (Express + prom-client)   │
            │  :3000                     │
            │  ┌─────────────────────┐   │
            │  │ Kafka Consumer      │   │
            │  │ Event Transform     │   │
            │  │ Metrics Export      │   │
            │  │ /metrics endpoint   │   │
            │  └─────────────────────┘   │
            └────────────┬──────┬────────┘
                         │      │
        ┌────────────────▼┐    │
        │ Elasticsearch   ├────┤
        │ (v8.7.0)        │    │
        │ :9200           │    │
        │ Index:          │    │
        │ cdc-events      │    │
        │ Doc count: dynamic   │
        └─────────────────┘    │
                               │
        ┌──────────────────────▼────┐
        │  Prometheus (v2.54.0)      │
        │  :9090                     │
        │  ┌────────────────────┐    │
        │  │ Metrics DB         │    │
        │  │ Scrape: 10s        │    │
        │  │ Retention: 15d     │    │
        │  └────────────────────┘    │
        └────────┬───────────────────┘
                 │
        ┌────────▼──────────────┐
        │   Grafana (v11.0.0)    │
        │   :3001/3000           │
        │   ┌──────────────────┐ │
        │   │ CDC Monitoring   │ │
        │   │ Dashboard        │ │
        │   └──────────────────┘ │
        │   • Events Table (ES)   │
        │   • Pie Chart (Prom)    │
        └────────────────────────┘

        ┌────────────────────────┐
        │   Kibana (v8.7.0)      │
        │   :5601                │
        │   Log Explorer         │
        └────────────────────────┘
```

### Data Flow: Step-by-Step

**Step 1: Event Capture (TiDB → TiCDC)**
- User executes SQL: `INSERT INTO users VALUES (...)`
- TiDB writes transaction to RocksDB
- TiCDC monitors transaction log in real-time
- Detects change and captures as CDC event

**Step 2: Event Distribution (TiCDC → Kafka)**
- TiCDC changefeed `cf-kafka` converts event to Canal JSON format
- Publishes to Kafka topic `tidb-cdc` with table name as partition key
- Example payload:
  ```json
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
  ```

**Step 3: Event Processing (Kafka → Consumer)**
- Node.js consumer subscribes to `tidb-cdc` topic
- Consumer group: `tidb-cdc-consumer`
- Parses each event:
  - Extracts database, table, operation type
  - Transforms data payload
  - Enriches with timestamp

**Step 4: Data Persistence (Consumer → Elasticsearch)**
- Event indexed into `cdc-events` index
- Elasticsearch document:
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

**Step 5: Metrics Exposure (Consumer → Prometheus)**
- Consumer increments Prometheus counter: `cdc_events_total`
- Labels: `table` (table name), `op` (insert/update/delete)
- Example metric line:
  ```
  cdc_events_total{table="users",op="insert"} 2
  ```
- Prometheus scrapes every 10 seconds

**Step 6: Visualization (Prometheus/ES → Grafana/Kibana)**
- Grafana retrieves data from both sources:
  - **Table Panel**: Queries Elasticsearch for raw events
  - **Pie Chart Panel**: Queries Prometheus for operation distribution
- Kibana provides advanced search and filtering in Elasticsearch

---

## 2. Technologies & Versions

| Component | Version | Purpose | Port |
|-----------|---------|---------|------|
| **TiDB** | v6.5.0 | Distributed SQL database | 4000 |
| **TiCDC** | v6.5.0 | Real-time CDC engine | 8300 |
| **TiKV** | v6.5.0 | Distributed storage | 20160 |
| **PD** | v6.5.0 | Cluster coordinator | 2379 |
| **Kafka** | 7.6.1 | Distributed message broker | 9092 |
| **Zookeeper** | 7.6.1 | Kafka coordination | 2181 |
| **Elasticsearch** | 8.7.0 | Full-text search & analytics | 9200 |
| **Kibana** | 8.7.0 | ES visualization | 5601 |
| **Prometheus** | v2.54.0 | Time-series metrics DB | 9090 |
| **Grafana** | 11.0.0 | Metrics dashboards | 3001 |
| **Node.js** | 18 (alpine) | Consumer service | 3000 |
| **MySQL** | 8.0 | Init & client utility | - |

---

## 3. Project Structure

```
tidb-cdc-monitoring/
│
├── docker-compose.yml                 # Orchestration (12 services)
├── README.md                          # This documentation
├── Devops Test Assignment (1).pdf     # Original assignment
│
├── db/
│   ├── init.sql                       # Database schema + seed data
│   └── cdc-init.sh                    # Changefeed initialization script
│
├── consumer/                          # Node.js Consumer Service
│   ├── Dockerfile                     # Multi-stage build
│   ├── package.json                   # Dependencies
│   ├── package-lock.json              # Lock file
│   └── index.js                       # Main application logic
│
├── prometheus/
│   └── prometheus.yml                 # Scrape configuration
│
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml        # Auto-provision ES + Prometheus
│       └── dashboards/
│           ├── dashboards.yml         # Dashboard loader config
│           └── cdc-dashboard.json     # CDC Monitoring dashboard
│
└── screenshots/                       # (User-provided) Dashboard screenshots
    ├── grafana-dashboard.png
    ├── elasticsearch-events.png
    ├── prometheus-metrics.png
    └── kibana-explorer.png
```

---

## 4. Detailed Configuration

### 4.1 Docker Compose Services

#### TiDB Cluster (4 services)
```yaml
pd:           # Placement Driver – cluster metadata, service discovery
tikv:         # Storage engine – distributed key-value store
tidb:         # SQL engine – MySQL-compatible interface
ticdc:        # CDC engine – captures and streams changes
```

**Critical Configuration:**
- TiCDC advertise address: `ticdc:8300` (for internal communication)
- TiKV advertise address: `tikv:20160` (for cluster gossip)
- All on `backend` network (no host exposure needed)

#### Data Processing (2 services)
```yaml
db-init:      # Init container – creates schema + seed data
cdc-task:     # Init container – creates TiCDC changefeed
```

**db-init workflow:**
1. Waits for TiDB to be ready (max 60 retries, 2-second intervals)
2. Executes `db/init.sql`:
   - Creates `appdb` database
   - Creates `users` table (id, username, password, email, created_at)
   - Inserts seed user: `almog/Aa123456`
3. Uses idempotent INSERT: won't fail if user exists

**cdc-task workflow:**
1. Waits 45 seconds for TiCDC to initialize
2. Executes POST to create changefeed:
   ```
   POST http://ticdc:8300/api/v1/changefeeds
   {
     "changefeed_id": "cf-kafka",
     "sink_uri": "kafka://kafka:9092/tidb-cdc?protocol=canal-json",
     "start_ts": 0
   }
   ```
3. Verifies changefeed status
4. Exits (init container behavior)

#### Kafka (2 services)
```yaml
zookeeper:    # Cluster coordination
kafka:        # Message broker
```

**Topic Configuration:**
- Name: `tidb-cdc`
- Partitions: 1 (auto-created)
- Replication: 1 (single node)
- Auto-create: enabled

#### Consumer & Search (4 services)
```yaml
consumer:     # Node.js app – Kafka→ES, exposes metrics
elasticsearch: # Event storage
kibana:       # ES UI
```

#### Monitoring (2 services)
```yaml
prometheus:   # Metrics scraper + time-series DB
grafana:      # Dashboard visualization
```

### 4.2 Database Schema

```sql
CREATE DATABASE appdb;

CREATE TABLE appdb.users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed user (idempotent insert)
INSERT INTO users (username, password, email) VALUES ('almog', 'Aa123456', 'almog@example.com')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='almog');
```

### 4.3 Consumer Application (Node.js)

**Key Files:**
- `consumer/index.js` – Main application
- `consumer/Dockerfile` – Multi-stage build (dev → production)
- `consumer/package.json` – Dependencies

**Dependencies:**
```json
{
  "kafkajs": "^2.2.4",           // Kafka client
  "express": "^4.18.2",          // HTTP server
  "prom-client": "^15.0.0",      // Prometheus metrics
  "@elastic/elasticsearch": "^8.12.1"  // ES client
}
```

**Application Workflow:**

```javascript
// 1. Initialize Kafka consumer
const kafka = new Kafka({
  clientId: 'tidb-cdc-consumer',
  brokers: ['kafka:9092']
});
const consumer = kafka.consumer({ groupId: 'tidb-cdc-consumer' });

// 2. Subscribe to changefeed topic
await consumer.subscribe({ topic: 'tidb-cdc' });

// 3. Process messages
await consumer.run({
  eachMessage: async ({ message }) => {
    // Parse Canal JSON format
    const event = JSON.parse(message.value);
    
    // Index to Elasticsearch
    await esClient.index({
      index: 'cdc-events',
      body: {
        database: event.database,
        table: event.table,
        type: event.type.toLowerCase(),
        ts_ms: event.ts,
        data: event.data[0],
        '@timestamp': new Date().toISOString()
      }
    });
    
    // Update Prometheus metric
    cdc_events_total.inc({
      table: event.table,
      op: event.type.toLowerCase()
    });
  }
});

// 4. Expose /metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

---

## 5. Running the Platform

### Prerequisites
- Docker & Docker Compose installed
- 4GB+ RAM available
- Ports 2181, 2379, 3000-3001, 4000, 5601, 8300, 9090-9092, 9200 available

### Launch

```bash
# Navigate to project root
cd /path/to/tidb-cdc-monitoring

# Start all services
docker-compose up --build

# Expected output (after ~90 seconds):
# [+] Running 12/12
# ✔ pd is healthy
# ✔ tikv is healthy
# ✔ tidb is healthy
# ✔ ticdc is healthy
# ✔ kafka is healthy
# ✔ zookeeper is healthy
# ✔ elasticsearch is healthy
# ✔ kibana is healthy
# ✔ prometheus is healthy
# ✔ grafana is healthy
# ✔ consumer is running
# ✔ db-init completed (exited)
# ✔ cdc-task completed (exited)
```

### Verification

```bash
# Check all services
docker compose ps

# Expected: 10 running (12 total - 2 init containers exited)
```

### Shutdown

```bash
# Stop all services (preserves volumes)
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

---

## 6. Complete Testing Guide

### Test 1: Verify Database Initialization ✅

```bash
# Connect to TiDB and verify schema
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot -e "
  USE appdb;
  SELECT 'Users Table:';
  SELECT * FROM users;
"

# Expected output:
# Users Table:
# id | username | password | email           | created_at
# 1  | almog    | Aa123456 | almog@example.com | 2025-11-15 16:XX:XX
```

### Test 2: Verify Changefeed Creation ✅

```bash
# List changefeeds
curl -s http://localhost:8300/api/v1/changefeeds | jq '.[0] | {id, state, checkpoint_time}'

# Expected output:
# {
#   "id": "cf-kafka",
#   "state": "normal",
#   "checkpoint_time": "2025-11-15 16:XX:XX.XXX"
# }
```

### Test 3: End-to-End Data Flow ✅

```bash
# 1. Insert test data
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) 
   VALUES ('test-user-1', 'test123', 'user1@example.com');"

# 2. Verify in Elasticsearch (should see 2 events total)
curl -s http://localhost:9200/cdc-events/_count
# Output: {"count":2}

# 3. Verify in Prometheus (counter incremented)
curl -s http://localhost:3000/metrics | grep 'cdc_events_total{table="users"'
# Output: cdc_events_total{table="users",op="insert"} 2

# 4. View event details
curl -s 'http://localhost:9200/cdc-events/_search?size=1&sort=_id:desc' | \
  jq '.hits.hits[0]._source'
```

### Test 4: Grafana Dashboard 🎯

1. Open: **http://localhost:3001**
2. Login: `admin` / `admin`
3. Navigate: **CDC** folder → **TiDB CDC Monitoring** dashboard

**Expected Dashboard Panels:**

**Panel 1: Event Table**
- Data source: Elasticsearch
- Shows recent CDC events with columns: database, table, type, timestamp, data
- Auto-refreshes every 30 seconds

**Panel 2: Operation Distribution (Pie Chart)**
- Data source: Prometheus
- Query: `cdc_events_total` with time window 1h
- Shows percentage of INSERT vs UPDATE vs DELETE operations

### Test 5: Elasticsearch / Kibana 📊

1. Open: **http://localhost:5601**
2. Create Index Pattern:
   - Index name: `cdc-events*`
   - Timestamp: `@timestamp`
3. Go to Discover tab
4. See all indexed CDC events

### Test 6: Prometheus Metrics 📈

1. Open: **http://localhost:9090**
2. Go to Graph tab
3. Enter query: `cdc_events_total`
4. Click Graph to see time-series chart
5. Shows metric growth as new events arrive

---

## 7. Real-World Usage Scenarios

### Scenario 1: Data Synchronization
```sql
-- Insert new customer in TiDB
INSERT INTO users (username, password, email) 
VALUES ('customer-123', 'secure_pass', 'customer@company.com');

-- Automatically:
-- 1. TiCDC captures change
-- 2. Published to Kafka
-- 3. Consumer processes event
-- 4. Indexed in Elasticsearch (searchable)
-- 5. Metric updated in Prometheus
-- 6. Grafana dashboard reflects change instantly
```

### Scenario 2: Data Auditing
```bash
# Find all user creation events from last hour
curl -s 'http://localhost:9200/cdc-events/_search' -X POST -H 'Content-Type: application/json' -d '{
  "query": {
    "bool": {
      "must": [
        {"match": {"type": "insert"}},
        {"match": {"table": "users"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  }
}'
```

### Scenario 3: Operational Monitoring
```bash
# Check event throughput (events/minute) over last hour
# In Prometheus: rate(cdc_events_total[1m])
# In Grafana: Configure graph panel with above query
# Shows: spikes indicate high activity periods
```

### Scenario 4: Table-Specific Monitoring
```bash
# Monitor specific table changes
# In Grafana: Filter by table="users" label
# Pie chart shows: which operations dominate (insert vs update)
```

---

## 8. Troubleshooting

### ❌ Services won't start

```bash
# Check Docker daemon
docker ps

# Check resource limits
docker stats

# Increase memory if needed: Docker Desktop → Settings → Resources
```

### ❌ No CDC events appearing

**Check Changefeed Status:**
```bash
curl -s http://localhost:8300/api/v1/changefeeds
# Look for "state": "normal" (not "stopped" or "error")
```

**Check Consumer Logs:**
```bash
docker compose logs consumer -f

# Look for errors like:
# "Error connecting to Kafka" → Kafka not ready
# "Error indexing to ES" → Elasticsearch connection issue
```

**Check Kafka Topic:**
```bash
docker compose exec -T kafka kafka-topics --list --bootstrap-server localhost:9092
# Should see "tidb-cdc" in output
```

### ❌ Elasticsearch index empty

```bash
# Check if consumer is running
docker compose ps consumer
# Should be "Up" (not exited)

# Check consumer logs for errors
docker compose logs consumer --tail 50

# Manually test insert
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('debug-user', 'pass', 'debug@test.com');"

# Wait 5 seconds, then check ES again
sleep 5
curl -s http://localhost:9200/cdc-events/_count
```

### ❌ Grafana dashboards not loading

```bash
# Check Grafana logs
docker compose logs grafana | tail -50

# Verify datasources are configured
curl -s http://localhost:3001/api/datasources | jq '.[] | {name, type}'
# Should see: prometheus and elasticsearch

# Manually refresh provisioning
docker compose restart grafana
```

### ❌ Prometheus has no metrics

```bash
# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {labels, health}'
# Should show: consumer:3000 with health "up"

# Test metrics endpoint directly
curl -s http://localhost:3000/metrics | head -20
# Should see metric lines like: "# HELP cdc_events_total..."
```

---

## 9. Performance Considerations

### Scalability
- **Kafka partitions**: Increase from 1 to N for parallel consumption
- **Elasticsearch shards**: Configure for large datasets
- **Prometheus retention**: Default 15d, adjust via `--storage.tsdb.retention.time`
- **Consumer instances**: Scale horizontally with same consumer group

### Resource Usage
- TiDB cluster: ~1GB RAM
- Elasticsearch: ~512MB-1GB
- Prometheus: ~500MB
- Total: ~3-4GB for this demo

### Production Tuning
```yaml
# Example: Scale consumer for throughput
consumer:
  replicas: 3  # Docker Swarm/Kubernetes
  resources:
    limits:
      memory: 512M
    requests:
      memory: 256M
```

---

## 10. Screenshots & Visuals

This solution includes visual demonstrations in the `screenshots/` folder:

- **grafana-dashboard.png**: Main CDC monitoring dashboard with event table and pie chart
- **elasticsearch-events.png**: Sample events indexed in Elasticsearch
- **prometheus-metrics.png**: Time-series graph of CDC event counter
- **kibana-explorer.png**: Advanced event search in Kibana

---

## 11. Production Deployment

### Docker Swarm
```bash
docker stack deploy -c docker-compose.yml tidb-cdc
```

### Kubernetes
```bash
# Requires helm charts or kustomize manifests
# Each service → StatefulSet/Deployment
# Kafka → StatefulSet with persistent volumes
# TiDB → TiDB Operator (helm chart)
```

### Cloud Platforms
- **AWS**: ECS/Fargate + RDS (replace TiDB)
- **GCP**: Cloud Run + BigTable (replace Elasticsearch)
- **Azure**: Container Instances + Cosmos DB

---

## 12. Summary

This solution provides:

✅ **Real-time CDC** – Changes captured from TiDB instantly
✅ **Event Streaming** – Kafka ensures reliable delivery
✅ **Full-Text Search** – Elasticsearch enables event exploration
✅ **Metrics Monitoring** – Prometheus + Grafana for operational visibility
✅ **Production-Ready** – All components configured with best practices
✅ **Easy Deployment** – Single `docker-compose up --build` command
✅ **Extensible** – Each component can be swapped/upgraded independently

### Quick Reference

| Need | Tool | URL |
|------|------|-----|
| View dashboards | Grafana | http://localhost:3001 |
| Search events | Kibana | http://localhost:5601 |
| Raw metrics | Prometheus | http://localhost:9090 |
| Database | TiDB CLI | `mysql -h 127.0.0.1 -P 4000 -uroot` |
| CDC Status | TiCDC API | `curl http://localhost:8300/api/v1/changefeeds` |

---

## 13. Contact & Support

Created as a technical assignment demonstrating:
- Docker & container orchestration
- Distributed systems architecture
- Real-time data processing
- Monitoring & observability
- Full-stack integration

**Tech Stack Summary:**
TiDB 6.5.0 | TiCDC | Kafka 7.6.1 | Node.js 18 | Elasticsearch 8.7.0 | Prometheus 2.54.0 | Grafana 11.0.0 | Docker Compose
