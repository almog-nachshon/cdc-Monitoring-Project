# 📸 Screenshots - CDC Monitoring Solution

**Author:** Almog Nachshon

This folder contains visual evidence of the complete CDC monitoring ecosystem running end-to-end.

> **[← Back to Main README](../README.md)** - Full project documentation and setup guide

---

## 🎯 Dashboard Screenshots Overview

Visual demonstrations of the real-time CDC data pipeline with monitoring and visualization tools.

### 1. 📊 Grafana Dashboard
**File**: `grafana-dashboard.png`

**What it shows**:
- Real-time CDC event monitoring dashboard
- Integration of multiple data sources
- Live operational metrics

**Details**:
| Property | Value |
|----------|-------|
| **URL** | http://localhost:3001 |
| **Username** | admin |
| **Password** | admin |
| **Tool** | Grafana v11.0.0 (Visualization & Dashboards) |
| **Purpose** | Dashboard for monitoring CDC metrics and events |

**Dashboard Contents**:
- **Left Panel - Events Table**
  - Data source: Elasticsearch
  - Shows recent CDC events in tabular format
  - Columns:
    - `database` - Source database (appdb)
    - `table` - Table name (users)
    - `type` - Operation type (insert, update, delete)
    - `ts_ms` - Event timestamp in milliseconds
    - `data` - Actual changed data as JSON
  - Auto-refreshes every 30 seconds

- **Right Panel - Operation Distribution Pie Chart**
  - Data source: Prometheus
  - Visualization: Pie chart
  - Metrics: `cdc_events_total` with labels `table` and `op`
  - Shows percentage breakdown:
    - INSERT operations (new records)
    - UPDATE operations (modified records)
    - DELETE operations (removed records)
  - Time range: Last 1 hour
  - Live update as new events arrive

**What to look for**:
✅ Dashboard loads without errors
✅ Event table displays at least 1+ rows
✅ Pie chart shows operation breakdown
✅ Panels refresh in real-time
✅ Grafana logo visible in top-left

**Key Insight**: This dashboard proves your CDC pipeline is capturing database changes in real-time and they're being processed, stored, and visualized.

---

### 2. 🔍 Elasticsearch Events
**File**: `elasticsearch-events.png`

**What it shows**:
- Raw CDC events indexed in Elasticsearch
- JSON structure of indexed documents
- Event count and metadata

**Details**:
| Property | Value |
|----------|-------|
| **URL** | http://localhost:9200/cdc-events/_search |
| **Tool** | Elasticsearch v8.7.0 (Full-text Search & Analytics) |
| **Purpose** | Persistent event storage with indexing and search |

**API Response Example**:
```json
{
  "hits": {
    "total": {"value": 2, "relation": "eq"},
    "hits": [
      {
        "_id": "unique-event-id",
        "_source": {
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
      }
    ]
  }
}
```

**Event Structure Breakdown**:
- **database**: Source database name (appdb)
- **table**: Table that was modified (users)
- **type**: CDC operation (insert/update/delete)
- **ts_ms**: Timestamp in milliseconds (from TiCDC)
- **data**: Actual row data with all columns
- **@timestamp**: ISO format timestamp for Kibana

**What to look for**:
✅ Response shows "hits.total.value": 2+ (events indexed)
✅ Each hit has complete data structure
✅ Timestamps are recent
✅ Data contains actual database values
✅ No errors in response

**Key Insight**: This proves Kafka messages successfully reached the consumer and were indexed into Elasticsearch without loss.

---

### 3. 📈 Prometheus Metrics Graph
**File**: `prometheus-metrics.png`

**What it shows**:
- Time-series graph of CDC event counter
- Metric growth and rate changes
- Multi-label breakdown of operations

**Details**:
| Property | Value |
|----------|-------|
| **URL** | http://localhost:9090/graph |
| **Tool** | Prometheus v2.54.0 (Time-Series Metrics Database) |
| **Purpose** | Collect and store metrics for operational monitoring |

**Query Used**:
```
cdc_events_total
```

**Metric Details**:
- **Name**: `cdc_events_total`
- **Type**: Counter (only increases)
- **Labels**:
  - `table` - Table name affected (e.g., "users")
  - `op` - Operation type (e.g., "insert", "update", "delete")
- **Unit**: Count of events
- **Scrape Interval**: 10 seconds (from consumer:3000/metrics)

**Graph Interpretation**:
- **X-axis**: Time (last 1 hour by default)
- **Y-axis**: Cumulative event count
- **Line 1**: `cdc_events_total{table="users",op="insert"}`
  - Red or blue colored line
  - Shows step increases when inserts occur
  - Flat lines indicate no activity
  
**Expected Pattern**:
```
Time 00:00 → Count: 1 (initial seed user)
Time 00:05 → Count: 2 (first test insert)
Time 00:10 → Count: 3 (second test insert)
       ↑
    Step increases = new events captured
```

**What to look for**:
✅ Graph shows at least 2 distinct data points
✅ Counter increases over time (never decreases)
✅ Time range selector visible
✅ Metric legend shows label values
✅ No "No data points found" message

**Key Insight**: This proves Prometheus is scraping metrics from the Node.js consumer every 10 seconds and metrics are being incremented as CDC events arrive.

---

### 4. 🗂️ Kibana Event Explorer
**File**: `kibana-explorer.png`

**What it shows**:
- Advanced event search and filtering interface
- Event list in table format
- Field-level filtering capabilities

**Details**:
| Property | Value |
|----------|-------|
| **URL** | http://localhost:5601/app/discover |
| **Tool** | Kibana v8.7.0 (Elasticsearch Visualization UI) |
| **Purpose** | Search, explore, and visualize indexed events |

**How to Use**:
1. **Create Index Pattern**:
   - Index name: `cdc-events*`
   - Timestamp field: `@timestamp`
   
2. **Discover Tab**:
   - Shows all documents in `cdc-events` index
   - Display as table with selectable columns

3. **Available Fields** (left sidebar):
   - `database` - Filter by database name
   - `table` - Filter by table
   - `type` - Filter by operation (insert/update/delete)
   - `ts_ms` - Filter by event timestamp
   - `data.*` - Filter by specific columns within data
   - `@timestamp` - Filter by indexing timestamp

4. **Search Examples**:
   ```
   type: "insert"                    // Only show inserts
   table: "users"                    // Only user table changes
   data.username: "test-user"        // Find specific user
   type: "insert" AND ts_ms > 1700000000000  // Insert after timestamp
   ```

**Sample Event Display**:
| database | table | type   | username   | email             | created_at          |
|----------|-------|--------|------------|-------------------|---------------------|
| appdb    | users | insert | test-user  | test@example.com  | 2025-11-15 16:36:17 |
| appdb    | users | insert | almog      | almog@example.com | 2025-11-15 16:00:00 |

**What to look for**:
✅ Discover page loads with events visible
✅ Event count shows 2+ documents
✅ Table shows columns: database, table, type, data fields
✅ Timestamp selector works (time range narrow)
✅ Search bar available for filtering
✅ Fields panel shows available fields to filter

**Key Insight**: Kibana demonstrates that all indexed events are searchable and can be filtered by any field, enabling advanced log analysis and troubleshooting.

---

## 📋 Data Flow Visualization

How these tools connect:

```
┌─────────────┐
│   TiDB      │ (CREATE/INSERT/UPDATE/DELETE)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  TiCDC          │ ← Captures changes
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Kafka Topic    │ ← Message broker
│ tidb-cdc        │
└──────┬──────────┘
       │
       ▼
┌─────────────────────────┐
│  Node.js Consumer       │ ← Processes messages
│  :3000/metrics          │
└──────┬───────┬──────────┘
       │       │
       │       └──────────────┐
       │                      │
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│Elasticsearch │      │ Prometheus   │
│cdc-events    │      │ Metrics DB   │
└──────┬───────┘      └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Kibana       │      │ Grafana      │ ← SCREENSHOTS SHOW THESE!
│ Visualize    │      │ Dashboards   │
└──────────────┘      └──────────────┘
```

---

## 🚀 How to Generate Screenshots

### Prerequisites
Ensure the system is fully running:
```bash
docker compose up --build
sleep 90  # Wait for all services to stabilize
```

### Step-by-Step Guide

#### Screenshot 1: Grafana Dashboard
```bash
# 1. Insert test data to populate the dashboard
docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb -e \
  "INSERT INTO users (username, password, email) \
   VALUES ('screenshot-user-1', 'pass123', 'user1@screenshot.com');"

# 2. Wait 5 seconds for data to propagate
sleep 5

# 3. Open in browser
# http://localhost:3001
# Login: admin / admin
# Dashboard: CDC → TiDB CDC Monitoring

# 4. Take screenshot of full dashboard
# (Include both table and pie chart panels)
```

#### Screenshot 2: Elasticsearch Events
```bash
# 1. Open in browser
# http://localhost:9200/cdc-events/_search

# 2. Expected output: JSON with indexed events

# 3. Or use curl to get formatted JSON
curl -s 'http://localhost:9200/cdc-events/_search?size=10' | \
  python.exe -m json.tool > elasticsearch-response.json

# 4. Take screenshot of response
```

#### Screenshot 3: Prometheus Metrics
```bash
# 1. Open in browser
# http://localhost:9090

# 2. Click "Graph" tab

# 3. In query box, enter: cdc_events_total

# 4. Click "Execute"

# 5. Click "Graph" tab (below query box)

# 6. Take screenshot showing time-series graph
```

#### Screenshot 4: Kibana Explorer
```bash
# 1. Open in browser
# http://localhost:5601

# 2. Create index pattern (if first time):
#    - Kibana → Stack Management → Index Patterns
#    - Index name: cdc-events*
#    - Timestamp: @timestamp

# 3. Go to Discover app

# 4. View events in table

# 5. Take screenshot of Discover page with events visible
```

---

## ✅ Verification Checklist

Before considering the project complete:

- [ ] **Grafana Screenshot**
  - [ ] Dashboard titled "TiDB CDC Monitoring"
  - [ ] Event table shows 2+ rows
  - [ ] Pie chart visible with operation distribution
  - [ ] No error messages displayed
  
- [ ] **Elasticsearch Screenshot**
  - [ ] Shows JSON response with hits
  - [ ] Event count shows 2+ documents
  - [ ] Each document has all required fields
  - [ ] Data contains actual database values
  
- [ ] **Prometheus Screenshot**
  - [ ] Graph displays metric: `cdc_events_total`
  - [ ] Y-axis shows count (starts at 1+)
  - [ ] Time series shows step increases
  - [ ] Query box shows "cdc_events_total"
  
- [ ] **Kibana Screenshot**
  - [ ] Discover page loads
  - [ ] Event table displays
  - [ ] Shows 2+ rows of data
  - [ ] Timestamp field visible
  - [ ] Filter options available

---

## 📚 Tool Information

### Grafana (Dashboards)
- **Version**: 11.0.0
- **Purpose**: Real-time operational dashboards
- **Features**: 
  - Data source integration (Prometheus, Elasticsearch, etc.)
  - Multiple panel types (graph, table, pie, gauge, etc.)
  - Auto-refresh capabilities
  - Dashboard provisioning (auto-load via JSON)
  - Alert configuration
- **Use Case**: Monitor CDC pipeline health and event flow in real-time

### Elasticsearch (Search & Analytics)
- **Version**: 8.7.0
- **Purpose**: Full-text search and log aggregation
- **Features**:
  - Distributed document indexing
  - JSON document storage
  - Advanced query capabilities (bool, range, match, etc.)
  - Aggregations for analytics
  - Index lifecycle management
- **Use Case**: Store and search all CDC events with flexible filtering

### Prometheus (Metrics)
- **Version**: 2.54.0
- **Purpose**: Time-series metrics collection
- **Features**:
  - Pull-based scraping (HTTP endpoints)
  - Time-series database
  - Label-based metric organization
  - PromQL query language
  - Built-in alerting
  - Retention policies
- **Use Case**: Track CDC event count and rate over time with dimensional analysis

### Kibana (Visualization)
- **Version**: 8.7.0
- **Purpose**: Elasticsearch visualization and exploration
- **Features**:
  - Discover app (search interface)
  - Canvas (custom dashboards)
  - Alerting
  - Dev tools (console, debugger)
  - Advanced filtering and aggregations
- **Use Case**: Ad-hoc exploration and advanced analysis of CDC events

---

## 🎓 Learning Outcomes

These screenshots demonstrate understanding of:

✅ **Real-time Data Processing** - Events flowing from TiDB through pipeline
✅ **Event Streaming** - Kafka delivering messages reliably
✅ **Log Aggregation** - Elasticsearch indexing and storing events
✅ **Metrics Monitoring** - Prometheus tracking operational metrics
✅ **Data Visualization** - Grafana and Kibana displaying insights
✅ **Full-Stack Integration** - All components working together seamlessly
✅ **Distributed Systems** - Multiple services coordinating via APIs
✅ **DevOps Practices** - Docker containerization and orchestration

---

**[← Back to Main README](../README.md)** - Full project documentation

---

*Last Updated: 2025-11-15*
*Project: TiDB CDC Monitoring Stack*
*Status: ✅ Complete and Operational*
