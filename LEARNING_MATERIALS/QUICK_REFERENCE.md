# Quick Reference Guide - CDC Monitoring Solution

**Author:** Almog Nachshon  
**Created:** 2025-11-15  
**Purpose:** Quick lookup for commands, ports, and critical information

---

## STARTUP & SHUTDOWN

```bash
# Start entire system
docker-compose up --build

# Stop entire system
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# View all logs
docker-compose logs

# Follow specific service logs
docker-compose logs consumer -f
docker-compose logs ticdc -f

# Restart specific service
docker-compose restart consumer
docker-compose restart grafana
```

---

## PORT MAPPINGS & ENDPOINTS

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **TiDB** | 4000 | `mysql://tidb:4000` | Database |
| **TiCDC API** | 8300 | `http://localhost:8300` | CDC Management |
| **Kafka** | 9092 | `kafka:9092` | Message Broker |
| **Zookeeper** | 2181 | `zookeeper:2181` | Coordination |
| **PD** | 2379 | `http://localhost:2379` | Cluster Mgmt |
| **Elasticsearch** | 9200 | `http://localhost:9200` | Search Engine |
| **Kibana** | 5601 | `http://localhost:5601` | ES UI |
| **Prometheus** | 9090 | `http://localhost:9090` | Metrics DB |
| **Grafana** | 3001 | `http://localhost:3001` | Dashboards |
| **Consumer Metrics** | 3000 | `http://localhost:3000/metrics` | App Metrics |

---

## DATABASE COMMANDS

### Connect to TiDB
```bash
# Via docker
docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb

# Via command line
mysql -h 127.0.0.1 -P 4000 -uroot appdb

# Credentials
User: root (or almog)
Password: (empty for root)
Database: appdb
```

### Common SQL Commands
```sql
-- Show tables
SHOW TABLES;

-- View users table
SELECT * FROM users;

-- Insert test user
INSERT INTO users (username, password, email) VALUES ('test', 'pass', 'test@example.com');

-- Update user
UPDATE users SET password='newpass' WHERE username='test';

-- Delete user
DELETE FROM users WHERE username='test';

-- Check user count
SELECT COUNT(*) FROM users;

-- View table structure
DESCRIBE users;
```

### Insert Test Data (Single Command)
```bash
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('testuser', 'testpass', 'test@example.com');"
```

---

## KAFKA COMMANDS

### List Topics
```bash
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Describe Topic
```bash
docker-compose exec kafka kafka-topics --describe --topic tidb-cdc --bootstrap-server localhost:9092
```

### Consume Messages
```bash
docker-compose exec kafka kafka-console-consumer \
  --topic tidb-cdc \
  --bootstrap-server localhost:9092 \
  --from-beginning
```

### Consumer Groups
```bash
docker-compose exec kafka kafka-consumer-groups \
  --list --bootstrap-server localhost:9092
```

---

## TICDC API COMMANDS

### List Changefeeds
```bash
curl http://localhost:8300/api/v1/changefeeds
```

### Get Changefeed Details
```bash
curl http://localhost:8300/api/v1/changefeeds/cf-kafka
```

### Create Changefeed (Manual)
```bash
curl -X POST http://localhost:8300/api/v1/changefeeds \
  -H "Content-Type: application/json" \
  -d '{
    "changefeed_id": "cf-kafka",
    "sink_uri": "kafka://kafka:9092/tidb-cdc?protocol=canal-json",
    "start_ts": 0
  }'
```

### Delete Changefeed
```bash
curl -X DELETE http://localhost:8300/api/v1/changefeeds/cf-kafka
```

---

## ELASTICSEARCH COMMANDS

### Check Cluster Health
```bash
curl http://localhost:9200/_cluster/health
```

### List Indices
```bash
curl http://localhost:9200/_cat/indices
```

### Count Documents in Index
```bash
curl http://localhost:9200/cdc-events/_count
```

### Search Events
```bash
curl http://localhost:9200/cdc-events/_search
```

### Search with Filters
```bash
curl -X POST http://localhost:9200/cdc-events/_search \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "match": {
        "database": "appdb"
      }
    }
  }'
```

### Get Index Mapping
```bash
curl http://localhost:9200/cdc-events/_mapping
```

### Delete Index (Reset)
```bash
curl -X DELETE http://localhost:9200/cdc-events
```

---

## PROMETHEUS COMMANDS

### Query Metrics
```bash
# Visit UI
http://localhost:9090

# Access expression language console
http://localhost:9090/graph

# Example queries
cdc_events_total
cdc_events_total{table="users"}
cdc_events_total{op="insert"}
rate(cdc_events_total[1m])
```

### Targets (Scrape Configuration)
```bash
http://localhost:9090/targets
```

### Alerts
```bash
http://localhost:9090/alerts
```

---

## GRAFANA COMMANDS

### Access Dashboard
```
URL: http://localhost:3001
User: admin
Password: admin
```

### API - List Dashboards
```bash
curl http://localhost:3001/api/search
```

### API - Get Dashboard
```bash
curl http://localhost:3001/api/dashboards/db/tidb-cdc-monitoring
```

### API - List Datasources
```bash
curl http://localhost:3001/api/datasources
```

---

## CONSUMER APPLICATION METRICS

### View Metrics Endpoint
```bash
curl http://localhost:3000/metrics
```

### Filter Specific Metric
```bash
curl http://localhost:3000/metrics | grep cdc_events_total
```

### Example Output
```
# HELP cdc_events_total Total CDC events processed
# TYPE cdc_events_total counter
cdc_events_total{table="users",op="insert"} 5
cdc_events_total{table="users",op="update"} 2
cdc_events_total{table="users",op="delete"} 0
```

---

## DOCKER COMPOSE SERVICE NAMES

```
pd              - TiDB Placement Driver
tikv            - TiDB Storage Engine  
tidb            - TiDB SQL Engine
ticdc           - TiDB CDC Engine
kafka           - Message Broker
zookeeper       - Kafka Coordination
db-init         - Database Initialization (one-time)
cdc-task        - Changefeed Creation (one-time)
consumer        - Node.js Consumer Application
elasticsearch   - Search & Storage Engine
kibana          - Elasticsearch UI
prometheus      - Metrics Database
grafana         - Dashboard Visualization
mysql-client    - MySQL Client Container
```

---

## FILE STRUCTURE

```
project-root/
├── docker-compose.yml          # 12 services orchestration
├── README.md                   # Main documentation
├── screenshots/
│   └── README.md              # Visual guide (4 tools)
├── LEARNING_MATERIALS/
│   ├── LEARNING_GUIDE_ENGLISH.md
│   ├── LEARNING_GUIDE_HEBREW.md
│   ├── QUICK_REFERENCE.md
│   └── INTERVIEW_PREP.md
├── consumer/
│   ├── Dockerfile             # Node.js app container
│   ├── index.js               # Consumer application
│   └── package.json
├── db/
│   ├── init.sql               # Database schema
│   └── cdc-init.sh            # Changefeed setup script
├── prometheus/
│   └── prometheus.yml         # Prometheus config
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml
│       └── dashboards/
│           ├── cdc-dashboard.json
│           └── dashboards.yml
```

---

## TROUBLESHOOTING QUICK COMMANDS

### Check Service Status
```bash
# All services
docker-compose ps

# Specific service
docker-compose exec consumer ps aux

# Health check
curl http://localhost:3001/api/health  # Grafana
curl http://localhost:9200/_cluster/health  # ES
```

### View Logs
```bash
# Last 50 lines
docker-compose logs consumer --tail=50

# Real-time (follow)
docker-compose logs -f consumer

# Specific error search
docker-compose logs | grep -i error
```

### Connectivity Tests
```bash
# Test Kafka from consumer
docker-compose exec consumer nc -zv kafka 9092

# Test Elasticsearch from consumer
docker-compose exec consumer nc -zv elasticsearch 9200

# Test TiDB from consumer
docker-compose exec consumer nc -zv tidb 4000
```

### Restart Problematic Services
```bash
# Restart consumer
docker-compose restart consumer

# Restart Grafana
docker-compose restart grafana

# Rebuild consumer (if code changed)
docker-compose up --build consumer

# Full reset
docker-compose down -v
docker-compose up --build
```

---

## PROMETHEUS QUERIES (CHEAT SHEET)

```promql
# Total count
cdc_events_total

# Filter by table
cdc_events_total{table="users"}

# Filter by operation
cdc_events_total{op="insert"}

# Events per minute
rate(cdc_events_total[1m])

# Events per 5 minutes
rate(cdc_events_total[5m])

# Sum by operation
sum by (op) (cdc_events_total)

# Sum by table
sum by (table) (cdc_events_total)

# Increase in last hour
increase(cdc_events_total[1h])

# Count distinct tables
count(count by (table) (cdc_events_total))
```

---

## ELASTICSEARCH QUERIES (CHEAT SHEET)

### Basic Search
```bash
curl "http://localhost:9200/cdc-events/_search" -H "Content-Type: application/json"
```

### Search by Database
```bash
curl -X POST "http://localhost:9200/cdc-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "match": {
        "database": "appdb"
      }
    }
  }'
```

### Search by Operation
```bash
curl -X POST "http://localhost:9200/cdc-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "term": {
        "type": "insert"
      }
    }
  }'
```

### Search Recent (Last 1 Hour)
```bash
curl -X POST "http://localhost:9200/cdc-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "range": {
        "@timestamp": {
          "gte": "now-1h"
        }
      }
    }
  }'
```

### Get Latest 10 Events
```bash
curl -X POST "http://localhost:9200/cdc-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "size": 10,
    "sort": [
      {
        "@timestamp": {
          "order": "desc"
        }
      }
    ]
  }'
```

---

## EXPECTED BEHAVIOR TIMELINE

```
:00   docker-compose up --build
:30   TiDB cluster ready (pd, tikv, tidb started)
:45   TiCDC service ready
:50   Database initialized (schema created, user inserted)
:55   Changefeed created (cf-kafka configured, monitoring changes)
:60   Consumer started (listening to tidb-cdc topic)
:65   Elasticsearch started & healthy
:70   Kibana started
:75   Prometheus scraping metrics
:80   Grafana dashboards available
:90   System fully operational
```

**Typical wait: 1.5-2 minutes for full readiness**

---

## IMPORTANT NOTES

### Auto-provisioning Files
- `db/init.sql` - Executed by db-init service on startup
- `db/cdc-init.sh` - Executed by cdc-task service after TiCDC ready
- `grafana/provisioning/datasources/datasources.yml` - Auto-creates Prometheus & ES datasources
- `grafana/provisioning/dashboards/cdc-dashboard.json` - Auto-creates dashboard

### Default Credentials
- TiDB root: user=root, password=(empty)
- TiDB app user: user=almog, password=Aa123456
- Grafana: user=admin, password=admin
- Elasticsearch: no auth (default)
- Kibana: no auth (default)

### Seed Data
- Database: `appdb`
- Table: `users`
- Seed user: username=almog, password=Aa123456, email=almog@example.com

### Network Configuration
- Docker network: `backend` (bridges all containers)
- Internal DNS: use service names (e.g., `kafka:9092`, `tidb:4000`)
- External access: use `localhost:port` from host machine

---

## DATA FLOW VERIFICATION STEPS

### Step 1: Verify TiDB
```bash
docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e "SELECT * FROM users;"
```

### Step 2: Verify Changefeed
```bash
curl http://localhost:8300/api/v1/changefeeds | jq .
```

### Step 3: Insert Test Data
```bash
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) VALUES ('verify-test', 'pass', 'verify@test.com');"
```

### Step 4: Verify Elasticsearch
```bash
curl http://localhost:9200/cdc-events/_count
```

### Step 5: Verify Prometheus
```bash
curl http://localhost:3000/metrics | grep cdc_events_total
```

### Step 6: Verify Grafana
```
Visit http://localhost:3001/d/tidb-cdc-monitoring
Should see new event in table panel
Should see updated pie chart
```

**If all 6 steps succeed, system is fully operational! ✅**

---

## COMMON ISSUES & QUICK FIXES

| Issue | Symptom | Quick Fix |
|-------|---------|----------|
| Services won't start | Hang or errors | `docker-compose down -v && docker-compose up --build` |
| No events in ES | Empty index | Check changefeed: `curl http://localhost:8300/api/v1/changefeeds` |
| Metrics not increasing | Prometheus empty | Check consumer logs: `docker-compose logs consumer -f` |
| Grafana dashboard blank | No data visible | Restart Grafana: `docker-compose restart grafana` |
| Consumer crashes | Container exited | Check logs: `docker-compose logs consumer` |
| Port already in use | Port binding fails | Find using: `netstat -ano \| grep :3001` |
| Volumes corrupted | Data inconsistencies | Clean reset: `docker-compose down -v` |
| Network issues | Container can't connect | Check network: `docker-compose exec consumer ping kafka` |

---

## REVIEW PREPARATION SHORTCUTS

✅ **System Overview**
- Architecture: TiDB → CDC → Kafka → Consumer → ES/Prometheus → Grafana/Kibana

✅ **Key Technologies**
- TiDB: Database
- TiCDC: CDC Engine  
- Kafka: Message Queue
- Elasticsearch: Search/Storage
- Prometheus: Metrics
- Grafana: Visualization

✅ **Critical Concepts**
- CDC captures changes in real-time
- Kafka ensures reliable delivery
- Consumer bridges systems
- Metrics enable monitoring

✅ **Data Path**
INSERT → TiDB → TiCDC → Kafka → Consumer → ES (indexing) + Prometheus (metrics) → Grafana/Kibana (visualization)

---

**Created: 2025-11-15**  
**Author: Almog Nachshon**  
**Purpose: Quick Reference for Review Preparation**
